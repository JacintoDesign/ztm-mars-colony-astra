import { SupabaseClient } from '@supabase/supabase-js';
import {
  Building,
  BuildingType,
  Colonist,
  ColonyState,
  Rover,
  OreDeposit,
  BatteryCell,
  SimulationAction,
  BUILDING_COSTS,
} from '../simulation/types';
import { applyTicks } from '../simulation/tick';
import { CONTRACT_RULES } from '../simulation/contract-rules';
import { SeededPRNG, generateInitialSeed } from '../simulation/prng';
import { generateOreDistribution } from '../simulation/ore-generator';
import { findShortestRoute, getFreeAdjacentTiles } from '../simulation/pathfinding';
import { isInGrid } from '../engine/iso-math';
import { ColonyData, ColonyRecord } from './colony-service';

/**
 * Server-Side Authoritative Simulation Runner.
 * 
 * Rules:
 * - This server execution logic is the ONLY entity that ever writes tick, oxygen,
 *   power, food, ore, electronics, colonist state, building condition, rover state,
 *   or bestSolsSurvived to Supabase.
 * - The browser client never writes authoritative simulation ticks directly.
 */

export async function executeAuthoritativeTick(
  client: SupabaseClient,
  colonyId: string,
  userId: string
): Promise<ColonyData> {
  // 1. Fetch user account profile
  let bestSolsSurvived = 0;
  const { data: userProfile } = await client
    .from('marscolony_users')
    .select('best_sols_survived')
    .eq('id', userId)
    .maybeSingle();

  if (userProfile) {
    bestSolsSurvived = userProfile.best_sols_survived ?? 0;
  }

  // 2. Fetch colony record
  const { data: colonyRow, error: colonyError } = await client
    .from('marscolony_colonies')
    .select('*')
    .eq('id', colonyId)
    .eq('owner', userId)
    .single();

  if (colonyError || !colonyRow) {
    throw new Error(`Colony not found: ${colonyError?.message ?? 'Unknown'}`);
  }

  const colony: ColonyRecord = colonyRow as ColonyRecord;

  // 3. Fetch buildings
  const { data: buildingsData } = await client
    .from('marscolony_buildings')
    .select('*')
    .eq('colony_id', colonyId)
    .order('created_at', { ascending: true });

  const buildings: Building[] = (buildingsData || []).map((b) => ({
    id: b.id,
    type: b.type as BuildingType,
    x: b.x,
    y: b.y,
    condition: b.condition ?? 'operational',
    repairProgress: b.repair_progress ?? 0,
    digProgress: b.dig_progress ?? 0,
    wasBrokenBeforeBurial: b.was_broken_before_burial ?? false,
  }));

  // 4. Fetch colonists
  const { data: colonistsData } = await client
    .from('marscolony_colonists')
    .select('*')
    .eq('colony_id', colonyId);

  const colonists: Colonist[] = (colonistsData || []).map((c) => ({
    id: c.id,
    x: c.x,
    y: c.y,
    health: c.health,
    age: c.age ?? 0,
    lifespan: c.lifespan ?? 15000,
    destination: c.destination,
    destinationType: c.destination_type ?? 'habitat',
    targetEntityId: null,
    route: c.route || [],
  }));

  // 5. Fetch rovers
  const { data: roversData } = await client
    .from('marscolony_rovers')
    .select('*')
    .eq('colony_id', colonyId);

  const totalGarages = buildings.filter((b) => b.type === 'garage').length;
  const maxRoversAllowed = totalGarages * CONTRACT_RULES.rovers.maxRoversPerGarage;
  let rovers: Rover[] = (roversData || []).map((r) => ({
    id: r.id,
    garageX: r.garage_x,
    garageY: r.garage_y,
    x: r.x,
    y: r.y,
    state: r.state,
    power: r.power,
    cargo: r.cargo,
    destination: r.destination,
    onSiteTicksRemaining: 0,
    route: r.route || [],
  }));
  if (rovers.length > maxRoversAllowed) {
    rovers = rovers.slice(0, maxRoversAllowed);
  }

  // 6. Fetch ore deposits
  const { data: depositsData } = await client
    .from('marscolony_ore_deposits')
    .select('*')
    .eq('colony_id', colonyId);

  let oreDeposits: OreDeposit[] = (depositsData || []).map((d) => ({
    id: d.id,
    x: d.x,
    y: d.y,
    remaining: d.remaining,
  }));

  if (oreDeposits.length === 0) {
    const seed = colony.seed ?? generateInitialSeed();
    const prng = new SeededPRNG(seed);
    const generated = generateOreDistribution(prng);
    oreDeposits = generated.oreDeposits;
    colony.mining_sites = generated.miningSites;
    colony.seed = seed;
  }

  // If colony is already in game_over status, immediately return without applying ticks
  if (colony.status === 'game_over') {
    return {
      colony: { ...colony, status: 'game_over' },
      buildings: [],
      colonists: [],
      rovers: [],
      oreDeposits: [],
      bestSolsSurvived,
    };
  }

  // 7. Authoritative Simulation Ticks Computation
  const lastTickTime = colony.last_tick_at ? new Date(colony.last_tick_at).getTime() : Date.now();
  const now = Date.now();
  const elapsedSeconds = Math.max(0, Math.floor((now - lastTickTime) / 1000));
  const ticksToApply = Math.min(elapsedSeconds, CONTRACT_RULES.maxCatchUpTicks);

  if (colony.status === 'active' && ticksToApply > 0) {
    const currentState: ColonyState = {
      colonyId: colony.id,
      tick: colony.tick,
      oxygen: colony.oxygen,
      power: colony.power,
      food: colony.food ?? 50,
      ore: colony.ore,
      electronics: colony.electronics ?? 0,
      seed: colony.seed ?? 133742,
      oreDeposits,
      buildings,
      colonists,
      pendingArrivals: colony.pending_arrivals ?? [],
      rovers,
      batteryCells: colony.battery_cells ?? [],
      miningSites: colony.mining_sites ?? [],
      activeAsteroid: colony.active_asteroid ?? null,
      signedInAccount: userId,
      colonyOwner: userId,
      status: colony.status,
      bestSolsSurvived,
      lastAppliedTick: colony.last_tick_at,
    };

    const nextState = applyTicks(currentState, ticksToApply);

    // 8. Authoritative Database Writes
    const newLastTickAt = new Date().toISOString();

    // 8a. Update colony record
    await client
      .from('marscolony_colonies')
      .update({
        oxygen: nextState.oxygen,
        power: nextState.power,
        food: nextState.food,
        ore: nextState.ore,
        electronics: nextState.electronics,
        seed: nextState.seed,
        battery_cells: nextState.batteryCells,
        mining_sites: nextState.miningSites,
        active_asteroid: nextState.activeAsteroid,
        pending_arrivals: nextState.pendingArrivals,
        tick: nextState.tick,
        status: nextState.status,
        last_tick_at: newLastTickAt,
        updated_at: newLastTickAt,
      })
      .eq('id', colonyId)
      .eq('owner', userId);

    // If colony just terminated (reached game_over), record best sols and persist terminal state
    if (nextState.status === 'game_over') {
      const solsSurvived = Math.floor(nextState.tick / CONTRACT_RULES.ticksPerSol);
      if (solsSurvived > bestSolsSurvived) {
        bestSolsSurvived = solsSurvived;
        await client
          .from('marscolony_users')
          .update({ best_sols_survived: solsSurvived })
          .eq('id', userId);
      }

      await client.from('marscolony_colonists').delete().eq('colony_id', colonyId);

      return {
        colony: {
          ...colony,
          oxygen: nextState.oxygen,
          power: nextState.power,
          food: nextState.food,
          ore: nextState.ore,
          electronics: nextState.electronics,
          tick: nextState.tick,
          status: 'game_over',
          last_tick_at: newLastTickAt,
        },
        buildings: nextState.buildings,
        colonists: [],
        rovers: nextState.rovers,
        oreDeposits: nextState.oreDeposits,
        bestSolsSurvived,
      };
    }

    // 8b. Update building conditions
    for (const b of nextState.buildings) {
      if (b.id && !b.id.startsWith('bld-')) {
        await client
          .from('marscolony_buildings')
          .update({
            condition: b.condition,
            repair_progress: b.repairProgress,
            dig_progress: b.digProgress,
            was_broken_before_burial: b.wasBrokenBeforeBurial ?? false,
          })
          .eq('id', b.id);
      }
    }

    // 8c. Sync living colonists idempotently without race condition duplications
    if (nextState.colonists.length > 0) {
      const existingWithId = nextState.colonists.filter((c) => c.id && !c.id.startsWith('col-'));
      const newWithoutId = nextState.colonists.filter((c) => !c.id || c.id.startsWith('col-'));

      for (const c of existingWithId) {
        await client
          .from('marscolony_colonists')
          .update({
            x: c.x,
            y: c.y,
            health: c.health,
            age: c.age,
            lifespan: c.lifespan,
            destination: c.destination,
            destination_type: c.destinationType,
            route: c.route || [],
          })
          .eq('id', c.id);
      }

      const keepIds = existingWithId.map((c) => c.id);
      if (keepIds.length > 0) {
        await client
          .from('marscolony_colonists')
          .delete()
          .eq('colony_id', colonyId)
          .not('id', 'in', `(${keepIds.join(',')})`);
      }

      if (newWithoutId.length > 0) {
        const colRows = newWithoutId.map((c) => ({
          colony_id: colonyId,
          owner: userId,
          x: c.x,
          y: c.y,
          health: c.health,
          age: c.age,
          lifespan: c.lifespan,
          destination: c.destination,
          destination_type: c.destinationType,
          route: c.route || [],
        }));
        const { data: insertedCols } = await client.from('marscolony_colonists').insert(colRows).select();
        if (insertedCols) {
          insertedCols.forEach((ic: any, idx: number) => {
            newWithoutId[idx].id = ic.id;
          });
        }
      }
    } else {
      await client
        .from('marscolony_colonists')
        .delete()
        .eq('colony_id', colonyId);
    }

    // 8d. Sync rovers idempotently
    if (nextState.rovers.length > 0) {
      const existingRoversWithId = nextState.rovers.filter((r) => r.id && !r.id.startsWith('rov-'));
      const newRoversWithoutId = nextState.rovers.filter((r) => !r.id || r.id.startsWith('rov-'));

      for (const r of existingRoversWithId) {
        await client
          .from('marscolony_rovers')
          .update({
            garage_x: r.garageX,
            garage_y: r.garageY,
            x: r.x,
            y: r.y,
            state: r.state,
            power: r.power,
            cargo: r.cargo,
            destination: r.destination,
            route: r.route || [],
          })
          .eq('id', r.id);
      }

      if (newRoversWithoutId.length > 0) {
        const rovRows = newRoversWithoutId.map((r) => ({
          colony_id: colonyId,
          owner: userId,
          garage_x: r.garageX,
          garage_y: r.garageY,
          x: r.x,
          y: r.y,
          state: r.state,
          power: r.power,
          cargo: r.cargo,
          destination: r.destination,
          route: r.route || [],
        }));
        await client.from('marscolony_rovers').insert(rovRows);
      }
    } else {
      await client
        .from('marscolony_rovers')
        .delete()
        .eq('colony_id', colonyId);
    }

    // 8e. Sync ore deposit changes
    for (const dep of nextState.oreDeposits) {
      if (dep.id) {
        await client
          .from('marscolony_ore_deposits')
          .update({ remaining: dep.remaining, updated_at: newLastTickAt })
          .eq('id', dep.id);
      }
    }

    colony.oxygen = nextState.oxygen;
    colony.power = nextState.power;
    colony.food = nextState.food;
    colony.ore = nextState.ore;
    colony.electronics = nextState.electronics;
    colony.seed = nextState.seed;
    colony.battery_cells = nextState.batteryCells;
    colony.pending_arrivals = nextState.pendingArrivals;
    colony.active_asteroid = nextState.activeAsteroid;
    colony.tick = nextState.tick;
    colony.status = nextState.status;
    colony.last_tick_at = newLastTickAt;

    return {
      colony,
      buildings: nextState.buildings,
      colonists: nextState.colonists,
      rovers: nextState.rovers,
      oreDeposits: nextState.oreDeposits,
      bestSolsSurvived,
    };
  }

  return {
    colony,
    buildings,
    colonists,
    rovers,
    oreDeposits,
    bestSolsSurvived,
  };
}

export async function executeAuthoritativeAction(
  client: SupabaseClient,
  colonyId: string,
  userId: string,
  action: SimulationAction
): Promise<{ success: boolean; reason?: string; colonyData: ColonyData }> {
  // First advance ticks up to the moment of action
  const currentData = await executeAuthoritativeTick(client, colonyId, userId);
  const colony = currentData.colony;
  const buildings = currentData.buildings;
  const rovers = currentData.rovers;
  const batteryCells = colony.battery_cells ?? [];

  if (colony.status === 'game_over' && action.type !== 'RESTART_COLONY') {
    return { success: false, reason: 'Colony is Terminated', colonyData: currentData };
  }

  switch (action.type) {
    case 'PLACE_BUILDING': {
      const { buildingType, x, y } = action;
      const cost = BUILDING_COSTS[buildingType];

      if (!isInGrid(x, y, 20)) {
        return { success: false, reason: 'Invalid Coordinates', colonyData: currentData };
      }
      if (x === 0 && y === 0) {
        return { success: false, reason: 'Tile (0, 0) is reserved for Landing Pad', colonyData: currentData };
      }
      if (buildings.some((b) => b.x === x && b.y === y)) {
        return { success: false, reason: 'Tile Occupied', colonyData: currentData };
      }
      const livingColonists = currentData.colonists.length;
      if (livingColonists === 0) {
        return { success: false, reason: 'Colonist Workforce Required', colonyData: currentData };
      }

      if (buildingType !== 'habitat') {
        const operationalBuildingsCount = buildings.filter(
          (b) => b.type !== 'habitat' && b.condition === 'operational'
        ).length;
        const maxOperationalAllowed = livingColonists * CONTRACT_RULES.workforce.operationalBuildingsPerColonist;
        if (operationalBuildingsCount >= maxOperationalAllowed) {
          const requiredColonists = Math.ceil((operationalBuildingsCount + 1) / CONTRACT_RULES.workforce.operationalBuildingsPerColonist);
          return {
            success: false,
            reason: `Workforce Shortage (Requires ${requiredColonists} Colonists for ${operationalBuildingsCount + 1} Facilities)`,
            colonyData: currentData,
          };
        }
      }

      if (colony.power < cost.power) {
        return { success: false, reason: 'Insufficient Power', colonyData: currentData };
      }
      if (colony.ore < cost.ore) {
        return { success: false, reason: 'Insufficient Ore', colonyData: currentData };
      }
      if (cost.electronics > 0 && (colony.electronics ?? 0) < cost.electronics) {
        return { success: false, reason: 'Insufficient Electronics', colonyData: currentData };
      }

      // Deduct cost server-side
      const newPower = colony.power - cost.power;
      const newOre = colony.ore - cost.ore;
      const newElectronics = Math.max(0, (colony.electronics ?? 0) - (cost.electronics ?? 0));
      const nowIso = new Date().toISOString();

      await client
        .from('marscolony_colonies')
        .update({
          power: newPower,
          ore: newOre,
          electronics: newElectronics,
          last_tick_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', colonyId)
        .eq('owner', userId);

      // Insert building
      const { data: bldRecord, error: bldErr } = await client
        .from('marscolony_buildings')
        .insert({
          colony_id: colonyId,
          owner: userId,
          type: buildingType,
          x,
          y,
          condition: 'operational',
          repair_progress: 0,
          dig_progress: 0,
          was_broken_before_burial: false,
        })
        .select()
        .single();

      if (bldErr) {
        return { success: false, reason: bldErr.message, colonyData: currentData };
      }

      const newBuilding: Building = {
        id: bldRecord.id,
        type: bldRecord.type as BuildingType,
        x: bldRecord.x,
        y: bldRecord.y,
        condition: 'operational',
        repairProgress: 0,
        digProgress: 0,
        wasBrokenBeforeBurial: false,
      };

      const updatedBuildings = [...buildings, newBuilding];
      let updatedRovers = [...rovers];

      // Spawn 2 rovers if garage placed
      if (buildingType === 'garage') {
        const roverRows = [
          {
            colony_id: colonyId,
            owner: userId,
            garage_x: x,
            garage_y: y,
            x,
            y,
            state: 'idle_at_base',
            power: CONTRACT_RULES.rovers.powerMax,
            cargo: null,
            destination: null,
            route: [],
          },
          {
            colony_id: colonyId,
            owner: userId,
            garage_x: x,
            garage_y: y,
            x,
            y,
            state: 'idle_at_base',
            power: CONTRACT_RULES.rovers.powerMax,
            cargo: null,
            destination: null,
            route: [],
          },
        ];
        const { data: insertedRovers } = await client.from('marscolony_rovers').insert(roverRows).select();
        if (insertedRovers) {
          for (const r of insertedRovers) {
            updatedRovers.push({
              id: r.id,
              garageX: r.garage_x,
              garageY: r.garage_y,
              x: r.x,
              y: r.y,
              state: r.state,
              power: r.power,
              cargo: r.cargo,
              destination: r.destination,
              onSiteTicksRemaining: 0,
              route: r.route || [],
            });
          }
        }
      }

      let updatedBatteryCells = colony.battery_cells || [];
      if (buildingType === 'garage' && updatedBatteryCells.length === 0) {
        updatedBatteryCells = [
          { id: `cell-${Date.now()}-1`, efficiency: 100 },
          { id: `cell-${Date.now()}-2`, efficiency: 100 },
        ];
        await client
          .from('marscolony_colonies')
          .update({ battery_cells: updatedBatteryCells })
          .eq('id', colonyId)
          .eq('owner', userId);
      }

      colony.power = newPower;
      colony.ore = newOre;
      colony.electronics = newElectronics;
      colony.battery_cells = updatedBatteryCells;
      colony.last_tick_at = nowIso;

      return {
        success: true,
        colonyData: {
          ...currentData,
          colony,
          buildings: updatedBuildings,
          rovers: updatedRovers,
        },
      };
    }

    case 'REFINE_CELL': {
      if (currentData.colonists.length === 0) {
        return { success: false, reason: 'Colonist Workforce Required', colonyData: currentData };
      }

      const oreCost = CONTRACT_RULES.refinery.oreCostPerCell;
      const maxCapacity = CONTRACT_RULES.refinery.maxCellCapacity;

      const hasRefinery = buildings.some((b) => b.type === 'refinery' && b.condition === 'operational');
      if (!hasRefinery) {
        return { success: false, reason: 'Refinery Offline or Missing', colonyData: currentData };
      }
      if (colony.ore < oreCost) {
        return { success: false, reason: 'Insufficient Ore (Requires 10 Ore)', colonyData: currentData };
      }
      if (batteryCells.length >= maxCapacity) {
        return { success: false, reason: 'Storage Full (20 Cells Max)', colonyData: currentData };
      }

      const newCell: BatteryCell = {
        id: `cell-${Date.now()}-${batteryCells.length + 1}`,
        efficiency: CONTRACT_RULES.refinery.initialCellEfficiency,
      };

      const updatedCells = [...batteryCells, newCell];
      const newOre = colony.ore - oreCost;
      const nowIso = new Date().toISOString();

      await client
        .from('marscolony_colonies')
        .update({
          ore: newOre,
          battery_cells: updatedCells,
          last_tick_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', colonyId)
        .eq('owner', userId);

      colony.ore = newOre;
      colony.battery_cells = updatedCells;
      colony.last_tick_at = nowIso;

      return {
        success: true,
        colonyData: {
          ...currentData,
          colony,
        },
      };
    }

    case 'DISPATCH_ROVER': {
      if (batteryCells.length === 0) {
        return { success: false, reason: 'No Battery Cells Available', colonyData: currentData };
      }

      const roverIndex = rovers.findIndex((r) => r.id === action.roverId);
      if (roverIndex < 0) {
        return { success: false, reason: 'Rover Not Found', colonyData: currentData };
      }

      const rover = rovers[roverIndex];
      if (rover.state !== 'idle_at_base') {
        return { success: false, reason: 'Rover Busy', colonyData: currentData };
      }

      let destCoord = { x: 0, y: 0 };
      let onSiteTicks = 5;

      if (action.destinationType === 'landing_zone') {
        destCoord = { x: 0, y: 0 };
        onSiteTicks = CONTRACT_RULES.rovers.landingZoneLoadTicks;
      } else if (action.destinationType === 'mining_site' && action.targetTile) {
        destCoord = action.targetTile;
        onSiteTicks = 20;
      } else if (action.destinationType === 'asteroid' && colony.active_asteroid) {
        destCoord = { x: colony.active_asteroid.x, y: colony.active_asteroid.y };
        onSiteTicks = 15;
      }

      const plannedRoute = findShortestRoute({ x: rover.x, y: rover.y }, [destCoord], new Set(), 20);
      const updatedCells = batteryCells.slice(1);

      const updatedRover: Rover = {
        ...rover,
        power: CONTRACT_RULES.rovers.powerMax,
        state: 'traveling_out',
        occupants: 1,
        destination: {
          type: action.destinationType,
          x: destCoord.x,
          y: destCoord.y,
          onSiteTicksTotal: onSiteTicks,
          targetId: action.targetArrivalId,
        },
        onSiteTicksRemaining: onSiteTicks,
        route: plannedRoute,
      };

      const updatedRovers = [...rovers];
      updatedRovers[roverIndex] = updatedRover;

      const nowIso = new Date().toISOString();

      await client
        .from('marscolony_colonies')
        .update({
          battery_cells: updatedCells,
          last_tick_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', colonyId)
        .eq('owner', userId);

      await client
        .from('marscolony_rovers')
        .update({
          power: CONTRACT_RULES.rovers.powerMax,
          state: 'traveling_out',
          destination: updatedRover.destination,
          route: plannedRoute,
        })
        .eq('id', rover.id);

      colony.battery_cells = updatedCells;
      colony.last_tick_at = nowIso;

      return {
        success: true,
        colonyData: {
          ...currentData,
          colony,
          rovers: updatedRovers,
        },
      };
    }

    case 'TOGGLE_BUILDING_POWER': {
      const bIndex = buildings.findIndex((b) => b.id === action.buildingId);
      if (bIndex < 0) {
        return { success: false, reason: 'Building Not Found', colonyData: currentData };
      }

      const bld = buildings[bIndex];
      if (bld.condition === 'broken' || bld.condition === 'buried') {
        return { success: false, reason: 'Cannot toggle broken/buried building', colonyData: currentData };
      }

      const nextCondition = bld.condition === 'deactivated' ? 'operational' : 'deactivated';
      await client
        .from('marscolony_buildings')
        .update({ condition: nextCondition })
        .eq('id', bld.id);

      const updatedBuildings = [...buildings];
      updatedBuildings[bIndex] = { ...bld, condition: nextCondition };

      return {
        success: true,
        colonyData: {
          ...currentData,
          buildings: updatedBuildings,
        },
      };
    }

    case 'MOVE_BUILDING': {
      const bIndex = buildings.findIndex((b) => b.id === action.buildingId);
      if (bIndex < 0) {
        return { success: false, reason: 'Building Not Found', colonyData: currentData };
      }

      const bld = buildings[bIndex];
      if (bld.condition === 'broken' || bld.condition === 'buried') {
        return { success: false, reason: 'Cannot move broken/buried building', colonyData: currentData };
      }
      const targetX = (action as any).targetX ?? (action as any).newX;
      const targetY = (action as any).targetY ?? (action as any).newY;

      if (targetX === undefined || targetY === undefined || !isInGrid(targetX, targetY, 20)) {
        return { success: false, reason: 'Invalid Coordinates', colonyData: currentData };
      }
      if (targetX === 0 && targetY === 0) {
        return { success: false, reason: 'Tile (0, 0) is reserved for Landing Pad', colonyData: currentData };
      }
      if (buildings.some((b) => b.x === targetX && b.y === targetY)) {
        return { success: false, reason: 'Tile Occupied', colonyData: currentData };
      }
      if (colony.power < 10) {
        return { success: false, reason: 'Insufficient Power (Requires 10 PWR)', colonyData: currentData };
      }

      const newPower = colony.power - 10;
      const nowIso = new Date().toISOString();

      await client
        .from('marscolony_colonies')
        .update({
          power: newPower,
          last_tick_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', colonyId)
        .eq('owner', userId);

      await client
        .from('marscolony_buildings')
        .update({
          x: targetX,
          y: targetY,
        })
        .eq('id', bld.id);

      const updatedBuildings = [...buildings];
      updatedBuildings[bIndex] = { ...bld, x: targetX, y: targetY };
      colony.power = newPower;
      colony.last_tick_at = nowIso;

      return {
        success: true,
        colonyData: {
          ...currentData,
          colony,
          buildings: updatedBuildings,
        },
      };
    }

    case 'ASSIGN_COLONIST_MAINTENANCE': {
      const bIndex = buildings.findIndex((b) => b.id === action.buildingId);
      if (bIndex < 0) {
        return { success: false, reason: 'Building Not Found', colonyData: currentData };
      }

      const bld = buildings[bIndex];
      if (bld.condition === 'operational' || bld.condition === 'deactivated') {
        return { success: false, reason: 'Structure does not require maintenance', colonyData: currentData };
      }

      const activeColonists = currentData.colonists;
      if (activeColonists.length === 0) {
        return { success: false, reason: 'No Living Colonists', colonyData: currentData };
      }

      if (bld.condition === 'broken') {
        const reqElectronics = CONTRACT_RULES.buildings[bld.type].repairElectronics;
        const currentElec = colony.electronics ?? 0;
        if (currentElec < reqElectronics) {
          return { success: false, reason: `Requires ${reqElectronics} Electronics (Stock: ${currentElec})`, colonyData: currentData };
        }
      }

      const sortedColonists = [...activeColonists].sort(
        (a, b) => Math.hypot(a.x - bld.x, a.y - bld.y) - Math.hypot(b.x - bld.x, b.y - bld.y)
      );
      const targetColonist = sortedColonists[0];

      const blockedTiles = new Set<string>(
        buildings.map((b) => `${b.x},${b.y}`).filter((coord) => coord !== `${bld.x},${bld.y}`)
      );
      const goalTiles = getFreeAdjacentTiles({ x: bld.x, y: bld.y }, blockedTiles, 20);
      const route = findShortestRoute(
        { x: targetColonist.x, y: targetColonist.y },
        goalTiles.length > 0 ? goalTiles : [{ x: bld.x, y: bld.y }],
        blockedTiles,
        20
      );

      const destType = bld.condition === 'buried' ? 'dig' : 'repair';

      await client
        .from('marscolony_colonists')
        .update({
          destination: { x: bld.x, y: bld.y },
          destination_type: destType,
          target_entity_id: bld.id,
          route,
        })
        .eq('id', targetColonist.id);

      const updatedColonists = activeColonists.map((c: Colonist) => {
        if (c.id === targetColonist.id) {
          return {
            ...c,
            destination: { x: bld.x, y: bld.y },
            destinationType: destType as any,
            targetEntityId: bld.id,
            route,
            moveProgress: 0,
          };
        }
        return c;
      });

      return {
        success: true,
        colonyData: {
          ...currentData,
          colonists: updatedColonists,
        },
      };
    }

    case 'DESTROY_BUILDING': {
      const bld = currentData.buildings.find((b: Building) => b.id === action.buildingId);
      if (!bld) {
        return { success: false, reason: 'Building Not Found', colonyData: currentData };
      }

      const demolishCost = CONTRACT_RULES.demolition?.costPower ?? 10;
      if (colony.power < demolishCost) {
        return { success: false, reason: `Insufficient Power (Requires ${demolishCost} PWR)`, colonyData: currentData };
      }

      const nextPower = colony.power - demolishCost;

      await Promise.all([
        client
          .from('marscolony_buildings')
          .delete()
          .eq('id', bld.id)
          .eq('owner', userId),
        client
          .from('marscolony_colonies')
          .update({
            power: nextPower,
            updated_at: new Date().toISOString(),
          })
          .eq('id', colonyId)
          .eq('owner', userId),
      ]);

      const updatedBuildings = currentData.buildings.filter((b: Building) => b.id !== bld.id);

      return {
        success: true,
        colonyData: {
          ...currentData,
          colony: { ...colony, power: nextPower },
          buildings: updatedBuildings,
        },
      };
    }

    case 'RESTART_COLONY': {
      if (colony.status !== 'game_over') {
        return { success: false, reason: 'Colony is Still Active', colonyData: currentData };
      }

      const initialSeed = generateInitialSeed();
      const prng = new SeededPRNG(initialSeed);
      const { oreDeposits: freshDeposits, miningSites: freshSites } = generateOreDistribution(prng);
      const { starting, colonists: cSpecs } = CONTRACT_RULES;
      const habX = starting.starterHabitat?.x ?? 7;
      const habY = starting.starterHabitat?.y ?? 7;
      const solX = starting.starterSolar?.x ?? 5;
      const solY = starting.starterSolar?.y ?? 7;
      const scbX = (starting as any).starterScrubber?.x ?? 9;
      const scbY = (starting as any).starterScrubber?.y ?? 7;

      await client.from('marscolony_buildings').delete().eq('colony_id', colonyId);
      await client.from('marscolony_colonists').delete().eq('colony_id', colonyId);
      await client.from('marscolony_rovers').delete().eq('colony_id', colonyId);
      await client.from('marscolony_ore_deposits').delete().eq('colony_id', colonyId);

      const depositRows = freshDeposits.map((d) => ({
        colony_id: colonyId,
        owner: userId,
        x: d.x,
        y: d.y,
        remaining: d.remaining,
      }));
      await client.from('marscolony_ore_deposits').insert(depositRows);

      // Insert starter buildings (Habitat + Solar Array + Scrubber)
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
      const { data: insertedBuildings } = await client.from('marscolony_buildings').insert(starterBuildingRows).select();
      const freshBuildings: Building[] = (insertedBuildings && insertedBuildings.length > 0)
        ? insertedBuildings.map((b) => ({
            id: b.id,
            type: b.type as BuildingType,
            x: b.x,
            y: b.y,
            condition: b.condition ?? 'operational',
            repairProgress: b.repair_progress ?? 0,
            digProgress: b.dig_progress ?? 0,
            wasBrokenBeforeBurial: b.was_broken_before_burial ?? false,
          }))
        : [
            { id: `bld-hab-${Date.now()}`, type: 'habitat', x: habX, y: habY, condition: 'operational', repairProgress: 0, digProgress: 0, wasBrokenBeforeBurial: false },
            { id: `bld-sol-${Date.now()}`, type: 'solar', x: solX, y: solY, condition: 'operational', repairProgress: 0, digProgress: 0, wasBrokenBeforeBurial: false },
            { id: `bld-scb-${Date.now()}`, type: 'scrubber', x: scbX, y: scbY, condition: 'operational', repairProgress: 0, digProgress: 0, wasBrokenBeforeBurial: false },
          ];

      // Insert starter pioneer colonists
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
      const { data: insertedColonists } = await client.from('marscolony_colonists').insert(starterColonistRows).select();
      const freshColonists: Colonist[] = (insertedColonists && insertedColonists.length > 0)
        ? insertedColonists.map((c) => ({
            id: c.id,
            x: c.x,
            y: c.y,
            health: c.health,
            age: c.age ?? 0,
            lifespan: c.lifespan ?? 8000,
            destination: c.destination,
            destinationType: c.destination_type ?? 'habitat',
            targetEntityId: null,
            route: c.route || [],
          }))
        : [
            { id: `col-p1-${Date.now()}`, x: habX, y: habY, health: 100, age: 0, lifespan: 8000, destination: { x: habX, y: habY }, destinationType: 'habitat', targetEntityId: null, route: [] },
            { id: `col-p2-${Date.now()}`, x: habX, y: habY, health: 100, age: 0, lifespan: 8000, destination: { x: habX, y: habY }, destinationType: 'habitat', targetEntityId: null, route: [] },
          ];

      const nowIso = new Date().toISOString();
      await client
        .from('marscolony_colonies')
        .update({
          oxygen: 50,
          power: 50,
          food: 50,
          ore: CONTRACT_RULES.starting.ore ?? 25,
          electronics: CONTRACT_RULES.starting.electronics ?? 2,
          seed: initialSeed,
          battery_cells: [],
          mining_sites: freshSites,
          active_asteroid: null,
          pending_arrivals: [],
          tick: 0,
          status: 'active',
          last_tick_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', colonyId)
        .eq('owner', userId);

      colony.oxygen = 50;
      colony.power = 50;
      colony.food = 50;
      colony.ore = CONTRACT_RULES.starting.ore ?? 25;
      colony.electronics = CONTRACT_RULES.starting.electronics ?? 2;
      colony.seed = initialSeed;
      colony.battery_cells = [];
      colony.mining_sites = freshSites;
      colony.active_asteroid = null;
      colony.pending_arrivals = [];
      colony.tick = 0;
      colony.status = 'active';
      colony.last_tick_at = nowIso;

      return {
        success: true,
        colonyData: {
          colony,
          buildings: freshBuildings,
          colonists: freshColonists,
          rovers: [],
          oreDeposits: freshDeposits,
          bestSolsSurvived: currentData.bestSolsSurvived,
        },
      };
    }

    default:
      return { success: false, colonyData: currentData };
  }
}
