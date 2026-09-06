import { supabase } from '../lib/supabase';
import {
  Building,
  Colonist,
  Rover,
  OreDeposit,
  PendingArrival,
  BatteryCell,
  MiningSite,
  Asteroid,
  SimulationAction,
} from '../simulation/types';
import { SeededPRNG, generateInitialSeed } from '../simulation/prng';
import { generateOreDistribution } from '../simulation/ore-generator';
import { RealtimeChannel } from '@supabase/supabase-js';
import {
  executeAuthoritativeTick,
  executeAuthoritativeAction,
} from './server-simulation';
import { CONTRACT_RULES } from '../simulation/contract-rules';

export interface ColonyRecord {
  id: string;
  owner: string;
  oxygen: number;
  power: number;
  food?: number;
  ore: number;
  electronics?: number;
  seed?: number;
  battery_cells?: BatteryCell[];
  mining_sites?: MiningSite[];
  active_asteroid?: Asteroid | null;
  pending_arrivals?: PendingArrival[];
  tick: number;
  last_tick_at: string;
  status: 'active' | 'game_over';
  created_at: string;
  updated_at: string;
}

export interface ColonyData {
  colony: ColonyRecord;
  buildings: Building[];
  colonists: Colonist[];
  rovers: Rover[];
  oreDeposits: OreDeposit[];
  bestSolsSurvived: number;
}

export class ColonyService {
  private inFlightColonyLoads: Map<string, Promise<ColonyData>> = new Map();

  /**
   * Loads an existing colony for the authenticated user, or creates one if it's the first sign-in.
   * Performs authoritative server-side catch-up (capped at 28,800 ticks).
   */
  public async loadOrCreateColony(userId: string): Promise<ColonyData> {
    const existing = this.inFlightColonyLoads.get(userId);
    if (existing) {
      return existing;
    }

    const loadPromise = this.performLoadOrCreateColony(userId);
    this.inFlightColonyLoads.set(userId, loadPromise);

    try {
      return await loadPromise;
    } finally {
      this.inFlightColonyLoads.delete(userId);
    }
  }

  private async performLoadOrCreateColony(userId: string): Promise<ColonyData> {
    // 1. Fetch or create user account profile (best_sols_survived)
    const { data: userProfile } = await supabase
      .from('marscolony_users')
      .select('best_sols_survived')
      .eq('id', userId)
      .maybeSingle();

    if (!userProfile) {
      await supabase
        .from('marscolony_users')
        .upsert({ id: userId, best_sols_survived: 0 }, { onConflict: 'id' });
    }

    // 2. Check for existing colony owned by this user
    const { data: existingColonies, error: fetchColonyError } = await supabase
      .from('marscolony_colonies')
      .select('*')
      .eq('owner', userId)
      .limit(1);

    if (fetchColonyError) {
      throw new Error(`Failed to query colony: ${fetchColonyError.message}`);
    }

    let colonyId: string;

    if (existingColonies && existingColonies.length > 0) {
      colonyId = existingColonies[0].id;
    } else {
      // First sign-in: generate fresh seed and 500-ore distribution
      const initialSeed = generateInitialSeed();
      const prng = new SeededPRNG(initialSeed);
      const { oreDeposits: generatedDeposits, miningSites: generatedMiningSites } = generateOreDistribution(prng);

      const { data: newColony, error: createColonyError } = await supabase
        .from('marscolony_colonies')
        .insert({
          owner: userId,
          oxygen: 50,
          power: 50,
          food: 50,
          ore: CONTRACT_RULES.starting.ore ?? 25,
          electronics: 0,
          seed: initialSeed,
          battery_cells: [],
          mining_sites: generatedMiningSites,
          active_asteroid: null,
          pending_arrivals: [],
          tick: 0,
          status: 'active',
          last_tick_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (createColonyError) {
        const { data: retryColonies } = await supabase
          .from('marscolony_colonies')
          .select('*')
          .eq('owner', userId)
          .limit(1);

        if (retryColonies && retryColonies.length > 0) {
          colonyId = retryColonies[0].id;
        } else {
          throw new Error(`Failed to initialize colony: ${createColonyError.message}`);
        }
      } else {
        colonyId = newColony.id;
      }

      // Insert initial ore deposits
      if (generatedDeposits.length > 0) {
        const depositRows = generatedDeposits.map((d) => ({
          colony_id: colonyId,
          owner: userId,
          x: d.x,
          y: d.y,
          remaining: d.remaining,
        }));
        await supabase.from('marscolony_ore_deposits').insert(depositRows);
      }

      // Insert initial starter buildings (Habitat + Solar Array + Scrubber)
      const { starting, colonists: cSpecs } = CONTRACT_RULES;
      const habX = starting.starterHabitat?.x ?? 7;
      const habY = starting.starterHabitat?.y ?? 7;
      const solX = starting.starterSolar?.x ?? 5;
      const solY = starting.starterSolar?.y ?? 7;
      const scbX = (starting as any).starterScrubber?.x ?? 9;
      const scbY = (starting as any).starterScrubber?.y ?? 7;

      const starterBuildingRows = [
        {
          colony_id: colonyId,
          owner: userId,
          type: 'habitat',
          x: habX,
          y: habY,
          condition: 'operational',
          repair_progress: 0,
          dig_progress: 0,
          was_broken_before_burial: false,
        },
        {
          colony_id: colonyId,
          owner: userId,
          type: 'solar',
          x: solX,
          y: solY,
          condition: 'operational',
          repair_progress: 0,
          dig_progress: 0,
          was_broken_before_burial: false,
        },
        {
          colony_id: colonyId,
          owner: userId,
          type: 'scrubber',
          x: scbX,
          y: scbY,
          condition: 'operational',
          repair_progress: 0,
          dig_progress: 0,
          was_broken_before_burial: false,
        },
      ];
      await supabase.from('marscolony_buildings').insert(starterBuildingRows);

      // Insert initial pioneer colonists
      const starterColonistRows = [
        {
          colony_id: colonyId,
          owner: userId,
          x: habX,
          y: habY,
          health: cSpecs.maxHealth,
          age: 0,
          lifespan: prng.nextInt(cSpecs.minLifespanTicks, cSpecs.maxLifespanTicks),
          destination: { x: habX, y: habY },
          destination_type: 'habitat',
          route: [],
        },
        {
          colony_id: colonyId,
          owner: userId,
          x: habX,
          y: habY,
          health: cSpecs.maxHealth,
          age: 0,
          lifespan: prng.nextInt(cSpecs.minLifespanTicks, cSpecs.maxLifespanTicks),
          destination: { x: habX, y: habY },
          destination_type: 'habitat',
          route: [],
        },
      ];
      await supabase.from('marscolony_colonists').insert(starterColonistRows);
    }

    // 3. Authoritative server tick execution on load (catch-up calculation and state persistence)
    return await this.triggerServerTick(colonyId, userId);
  }

  /**
   * Invokes the server-side authoritative tick calculation and state persistence route.
   */
  public async triggerServerTick(colonyId: string, userId: string): Promise<ColonyData> {
    try {
      // Try invoking Edge Function first if available
      const { data, error } = await supabase.functions.invoke('tick', {
        body: { colonyId },
      });
      if (!error && data && data.colonyData) {
        return data.colonyData as ColonyData;
      }
    } catch {
      // Fall back to server simulation runner directly
    }

    return await executeAuthoritativeTick(supabase, colonyId, userId);
  }

  /**
   * Dispatches a player action to the authoritative server route.
   * Checks affordability, applies resource deductions, and updates state on the server.
   */
  public async executeServerAction(
    colonyId: string,
    userId: string,
    action: SimulationAction
  ): Promise<{ success: boolean; reason?: string; colonyData: ColonyData }> {
    try {
      // Try invoking Edge Function first if available
      const { data, error } = await supabase.functions.invoke('action', {
        body: { colonyId, action },
      });
      if (!error && data && data.colonyData) {
        return data as { success: boolean; reason?: string; colonyData: ColonyData };
      }
    } catch {
      // Fall back to server simulation runner directly
    }

    return await executeAuthoritativeAction(supabase, colonyId, userId, action);
  }

  /**
   * Subscribes to real-time Postgres changes on the colony.
   */
  public subscribeToColony(
    colonyId: string,
    onUpdate: (payload: any) => void,
    onStatusChange?: (status: string) => void
  ): RealtimeChannel {
    const channel = supabase
      .channel(`colony-${colonyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'marscolony_colonies',
          filter: `id=eq.${colonyId}`,
        },
        (payload) => {
          onUpdate(payload);
        }
      );

    if (onStatusChange) {
      channel.subscribe((status) => {
        onStatusChange(status);
      });
    } else {
      channel.subscribe();
    }

    return channel;
  }

  public async updateLastTickTime(colonyId: string, userId: string): Promise<void> {
    const nowIso = new Date().toISOString();
    await supabase
      .from('marscolony_colonies')
      .update({ last_tick_at: nowIso, updated_at: nowIso })
      .eq('id', colonyId)
      .eq('owner', userId);
  }
}

export const colonyService = new ColonyService();
