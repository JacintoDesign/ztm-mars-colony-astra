/**
 * Authoritative Simulation Engine for Supabase Edge Functions (Deno Runtime).
 * Implements pure deterministic simulation tick calculations, actions, and authoritative persistence
 * across all 6 marscolony_ tables.
 */

export interface BuildingCost {
  power: number;
  ore: number;
  electronics: number;
}

export type BuildingType =
  | 'habitat'
  | 'solar'
  | 'scrubber'
  | 'extractor'
  | 'farm'
  | 'garage'
  | 'refinery';

export type BuildingCondition = 'operational' | 'broken' | 'buried' | 'deactivated';

export type ColonistDestinationType = 'habitat' | 'repair' | 'dig' | 'rover_recovery';

export type RoverState = 'idle_at_base' | 'traveling_out' | 'on_site' | 'traveling_back' | 'stranded';

export type RoverDestinationType = 'mining_site' | 'asteroid' | 'landing_zone';

export interface GridCoord {
  x: number;
  y: number;
}

export interface Building {
  id: string;
  type: BuildingType;
  x: number;
  y: number;
  condition: BuildingCondition;
  repairProgress: number;
  digProgress: number;
  wasBrokenBeforeBurial?: boolean;
}

export interface Colonist {
  id: string;
  x: number;
  y: number;
  health: number;
  age: number;
  lifespan: number;
  moveProgress?: number;
  destination: GridCoord | null;
  destinationType: ColonistDestinationType | null;
  targetEntityId: string | null;
  route: GridCoord[];
}

export type RoverCargo =
  | { type: 'ore'; amount: number }
  | { type: 'arrival'; arrivalId: string; electronics: number }
  | null;

export interface RoverDestination {
  type: RoverDestinationType;
  x: number;
  y: number;
  onSiteTicksTotal: number;
  targetId?: string;
}

export interface Rover {
  id: string;
  garageX: number;
  garageY: number;
  x: number;
  y: number;
  state: RoverState;
  power: number;
  cargo: RoverCargo;
  destination: RoverDestination | null;
  onSiteTicksRemaining: number;
  route: GridCoord[];
  occupants?: number;
}

export interface OreDeposit {
  id?: string;
  x: number;
  y: number;
  remaining: number;
}

export interface PendingArrival {
  id: string;
  landedAtTick: number;
  electronics: number;
  ticksRemaining: number;
}

export interface BatteryCell {
  id: string;
  efficiency: number;
}

export interface MiningSite {
  id: string;
  x: number;
  y: number;
  yield: number;
  remaining: number;
}

export interface Asteroid {
  id: string;
  x: number;
  y: number;
  yield: number;
  expiresAtTick: number;
}

export type ColonyStatus = 'active' | 'game_over';

export interface ColonyState {
  colonyId?: string;
  tick: number;
  oxygen: number;
  power: number;
  food: number;
  ore: number;
  electronics: number;
  seed: number;
  oreDeposits: OreDeposit[];
  buildings: Building[];
  colonists: Colonist[];
  pendingArrivals: PendingArrival[];
  rovers: Rover[];
  batteryCells: BatteryCell[];
  miningSites: MiningSite[];
  activeAsteroid: Asteroid | null;
  signedInAccount: string;
  colonyOwner: string;
  status: ColonyStatus;
  bestSolsSurvived: number;
  lastAppliedTick: string;
}

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

export type SimulationAction =
  | { type: 'PLACE_BUILDING'; buildingType: BuildingType; x: number; y: number }
  | { type: 'REFINE_CELL' }
  | { type: 'DISPATCH_ROVER'; roverId: string; destinationType: RoverDestinationType; targetTile?: GridCoord; targetArrivalId?: string }
  | { type: 'RESTART_COLONY' }
  | { type: 'TOGGLE_BUILDING_POWER'; buildingId: string }
  | { type: 'MOVE_BUILDING'; buildingId: string; targetX: number; targetY: number };

export const CONTRACT_RULES = {
  ticksPerSol: 1000,
  maxCatchUpTicks: 28800,
  starting: {
    oxygen: 50,
    power: 50,
    food: 50,
    ore: 25,
    electronics: 2,
    totalOreDistribution: 500,
    starterHabitat: { x: 7, y: 7 },
    starterSolar: { x: 5, y: 7 },
    starterScrubber: { x: 9, y: 7 },
    starterColonistsCount: 2,
  },
  pools: {
    oxygenMin: 0,
    oxygenBaseMax: 100,
    oxygenPerScrubber: 5,
    powerMin: 0,
    powerMax: 100,
    foodMin: 0,
    foodMax: 100,
  },
  arrivals: {
    intervalTicks: 300,
    colonistsPerShip: 1,
    electronicsPerShip: 2,
    escortWindowTicks: 150,
    urgentCountdownTicks: 30,
    landingTile: { x: 0, y: 0 },
  },
  colonists: {
    ticksPerTile: 5,
    oxygenConsumptionPerTick: 3,
    foodConsumptionPerTick: 3,
    healthDamagePerTick: 2,
    healthRecoveryPerTick: 1,
    maxHealth: 100,
    minLifespanTicks: 6000,
    maxLifespanTicks: 10000,
    agingVisualThresholdFraction: 0.75,
  },
  maintenance: {
    breakageChancePerTick: 1 / 4000,
    repairDurationTicks: 50,
    scrubberRepairDurationTicks: 30,
    minDustStormTick: 2500,
    dustStormWindowTicks: 1500,
    dustStormChance: 0.30,
    maxBuriedPerStorm: 2,
    digOutDurationTicks: 40,
  },
  spacing: {
    maxAdjacentForFullEfficiency: 1,
    crowdingPenaltyPerNeighbor: 1,
  },
  rovers: {
    speedTilesPerTick: 1,
    powerMax: 150,
    powerDrainPerTick: 1.5,
    rechargeRatePerTick: 5,
    landingZoneLoadTicks: 5,
    maxRoversPerGarage: 2,
  },
  refinery: {
    oreCostPerCell: 10,
    maxCellCapacity: 20,
    cellDecayPerTick: 1,
    initialCellEfficiency: 100,
  },
  asteroids: {
    spawnWindowTicks: 5000,
    spawnChance: 0.5,
    lifetimeTicks: 200,
    minYield: 60,
    maxYield: 120,
  },
  workforce: {
    operationalBuildingsPerColonist: 4,
  },
  demolition: {
    costPower: 10,
  },
  buildings: {
    habitat: {
      type: 'habitat' as BuildingType,
      name: 'Habitat',
      capacity: 2,
      powerDraw: 2,
      powerProduction: 0,
      oxygenProduction: 0,
      foodProduction: 0,
      oreProduction: 0,
      cost: { power: 20, ore: 10, electronics: 0 },
      repairLabor: 1,
      repairElectronics: 1,
    },
    solar: {
      type: 'solar' as BuildingType,
      name: 'Solar Array',
      capacity: 0,
      powerDraw: 0,
      powerProduction: 5,
      oxygenProduction: 0,
      foodProduction: 0,
      oreProduction: 0,
      cost: { power: 15, ore: 0, electronics: 0 },
      repairLabor: 1,
      repairElectronics: 1,
    },
    scrubber: {
      type: 'scrubber' as BuildingType,
      name: 'Scrubber',
      capacity: 0,
      powerDraw: 3,
      powerProduction: 0,
      oxygenProduction: 5,
      foodProduction: 0,
      oreProduction: 0,
      cost: { power: 15, ore: 5, electronics: 0 },
      repairLabor: 1,
      repairElectronics: 1,
    },
    extractor: {
      type: 'extractor' as BuildingType,
      name: 'Extractor',
      capacity: 0,
      powerDraw: 1,
      powerProduction: 0,
      oxygenProduction: 0,
      foodProduction: 0,
      oreProduction: 1,
      ticksPerExtraction: 5,
      cost: { power: 25, ore: 0, electronics: 0 },
      repairLabor: 2,
      repairElectronics: 2,
    },
    farm: {
      type: 'farm' as BuildingType,
      name: 'Hydroponic Farm',
      capacity: 0,
      powerDraw: 2,
      powerProduction: 0,
      oxygenProduction: 0,
      foodProduction: 5,
      oreProduction: 0,
      cost: { power: 20, ore: 5, electronics: 0 },
      repairLabor: 1,
      repairElectronics: 1,
    },
    garage: {
      type: 'garage' as BuildingType,
      name: 'Rover Garage',
      capacity: 0,
      powerDraw: 1,
      powerProduction: 0,
      oxygenProduction: 0,
      foodProduction: 0,
      oreProduction: 0,
      cost: { power: 30, ore: 10, electronics: 0 },
      repairLabor: 2,
      repairElectronics: 2,
    },
    refinery: {
      type: 'refinery' as BuildingType,
      name: 'Refinery',
      capacity: 0,
      powerDraw: 5,
      powerProduction: 0,
      oxygenProduction: 0,
      foodProduction: 0,
      oreProduction: 0,
      cost: { power: 25, ore: 15, electronics: 0 },
      repairLabor: 2,
      repairElectronics: 2,
    },
  },
} as const;

export const BUILDING_COSTS: Record<BuildingType, BuildingCost> = {
  habitat: { ...CONTRACT_RULES.buildings.habitat.cost },
  solar: { ...CONTRACT_RULES.buildings.solar.cost },
  scrubber: { ...CONTRACT_RULES.buildings.scrubber.cost },
  extractor: { ...CONTRACT_RULES.buildings.extractor.cost },
  farm: { ...CONTRACT_RULES.buildings.farm.cost },
  garage: { ...CONTRACT_RULES.buildings.garage.cost },
  refinery: { ...CONTRACT_RULES.buildings.refinery.cost },
};

export class SeededPRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) {
      this.state = 133742;
    }
  }

  public getState(): number {
    return this.state;
  }

  public nextFloat(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public nextInt(min: number, max: number): number {
    const f = this.nextFloat();
    return Math.floor(f * (max - min + 1)) + min;
  }

  public chance(probability: number): boolean {
    return this.nextFloat() < probability;
  }

  public pick<T>(array: readonly T[]): T | undefined {
    if (array.length === 0) return undefined;
    const idx = this.nextInt(0, array.length - 1);
    return array[idx];
  }
}

export function generateInitialSeed(): number {
  const t = Date.now();
  const r = (Math.random() * 0xffffffff) >>> 0;
  return (t ^ r) >>> 0 || 424242;
}

export function isInsideGrid(x: number, y: number, gridSize = 20): boolean {
  return x >= 0 && x < gridSize && y >= 0 && y < gridSize;
}

export function getFreeAdjacentTiles(
  target: GridCoord,
  blockedTiles: Set<string>,
  gridSize = 20
): GridCoord[] {
  const directions: GridCoord[] = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
  ];

  const validAdjacent: GridCoord[] = [];
  for (const dir of directions) {
    const ax = target.x + dir.x;
    const ay = target.y + dir.y;
    if (isInsideGrid(ax, ay, gridSize) && !blockedTiles.has(`${ax},${ay}`)) {
      validAdjacent.push({ x: ax, y: ay });
    }
  }
  return validAdjacent;
}

export function findShortestRoute(
  start: GridCoord,
  goalTiles: GridCoord[],
  blockedTiles: Set<string>,
  gridSize = 20
): GridCoord[] {
  if (goalTiles.length === 0) return [];

  const goalKeys = new Set(goalTiles.map((g) => `${g.x},${g.y}`));
  if (goalKeys.has(`${start.x},${start.y}`)) {
    return [];
  }

  const queue: GridCoord[] = [start];
  const visited = new Set<string>([`${start.x},${start.y}`]);
  const parentMap = new Map<string, GridCoord>();

  const directions: GridCoord[] = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
  ];

  let reachedGoal: GridCoord | null = null;

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentKey = `${current.x},${current.y}`;

    if (goalKeys.has(currentKey)) {
      reachedGoal = current;
      break;
    }

    for (const dir of directions) {
      const nextX = current.x + dir.x;
      const nextY = current.y + dir.y;
      const nextKey = `${nextX},${nextY}`;

      if (
        isInsideGrid(nextX, nextY, gridSize) &&
        !visited.has(nextKey) &&
        !blockedTiles.has(nextKey)
      ) {
        visited.add(nextKey);
        parentMap.set(nextKey, current);
        queue.push({ x: nextX, y: nextY });
      }
    }
  }

  if (!reachedGoal) {
    return [];
  }

  const path: GridCoord[] = [];
  let curr: GridCoord | undefined = reachedGoal;
  while (curr && (curr.x !== start.x || curr.y !== start.y)) {
    path.unshift(curr);
    curr = parentMap.get(`${curr.x},${curr.y}`);
  }

  return path;
}

export function findNearestAvailableHabitat(
  origin: GridCoord,
  buildings: Building[],
  currentColonists: Colonist[]
): Building | null {
  const habitats = buildings.filter((b) => b.type === 'habitat');
  if (habitats.length === 0) return null;

  const claims = new Map<string, number>();
  for (const c of currentColonists) {
    if (c.destination) {
      const key = `${c.destination.x},${c.destination.y}`;
      claims.set(key, (claims.get(key) || 0) + 1);
    }
  }

  const availableHabitats = habitats.filter((h) => {
    const key = `${h.x},${h.y}`;
    return (claims.get(key) || 0) < 2;
  });

  if (availableHabitats.length === 0) {
    return null;
  }

  availableHabitats.sort((a, b) => {
    const distA = Math.abs(a.x - origin.x) + Math.abs(a.y - origin.y);
    const distB = Math.abs(b.x - origin.x) + Math.abs(b.y - origin.y);
    if (distA !== distB) return distA - distB;
    if (a.x !== b.x) return a.x - b.x;
    if (a.y !== b.y) return a.y - b.y;
    return a.id.localeCompare(b.id);
  });

  return availableHabitats[0];
}

export function generateOreDistribution(prng: SeededPRNG, gridSize = 20): {
  oreDeposits: OreDeposit[];
  miningSites: MiningSite[];
} {
  const numDeposits = prng.nextInt(15, 25);
  const totalOreToDistribute = 500;
  const depositMap = new Map<string, number>();
  const reservedTiles = new Set<string>(['0,0']);

  const miningSiteTiles: Array<{ x: number; y: number }> = [];
  while (miningSiteTiles.length < 3) {
    const x = prng.nextInt(10, gridSize - 1);
    const y = prng.nextInt(10, gridSize - 1);
    const key = `${x},${y}`;
    if (!reservedTiles.has(key) && !depositMap.has(key)) {
      miningSiteTiles.push({ x, y });
      depositMap.set(key, 0);
    }
  }

  const normalTiles: Array<{ x: number; y: number }> = [];
  while (normalTiles.length < numDeposits - 3) {
    const x = prng.nextInt(0, gridSize - 1);
    const y = prng.nextInt(0, gridSize - 1);
    const key = `${x},${y}`;
    if (!reservedTiles.has(key) && !depositMap.has(key)) {
      normalTiles.push({ x, y });
      depositMap.set(key, 0);
    }
  }

  let remainingOre = totalOreToDistribute;
  const siteAmounts: number[] = [];
  for (let i = 0; i < 3; i++) {
    const amt = prng.nextInt(75, 95);
    siteAmounts.push(amt);
    remainingOre -= amt;
  }

  const tinyTile = normalTiles[0];
  depositMap.set(`${tinyTile.x},${tinyTile.y}`, 1);
  remainingOre -= 1;

  const otherTiles = normalTiles.slice(1);
  for (let i = 0; i < otherTiles.length; i++) {
    const isLast = i === otherTiles.length - 1;
    let amt = 0;
    if (isLast) {
      amt = Math.max(1, remainingOre);
    } else {
      const avg = Math.floor(remainingOre / (otherTiles.length - i));
      amt = Math.max(1, prng.nextInt(Math.max(1, avg - 8), avg + 8));
      amt = Math.min(amt, remainingOre - (otherTiles.length - i - 1));
    }
    remainingOre -= amt;
    depositMap.set(`${otherTiles[i].x},${otherTiles[i].y}`, amt);
  }

  for (let i = 0; i < 3; i++) {
    depositMap.set(`${miningSiteTiles[i].x},${miningSiteTiles[i].y}`, siteAmounts[i]);
  }

  const oreDeposits: OreDeposit[] = [];
  depositMap.forEach((remaining, key) => {
    const [xStr, yStr] = key.split(',');
    oreDeposits.push({
      id: `dep-${key}`,
      x: parseInt(xStr, 10),
      y: parseInt(yStr, 10),
      remaining,
    });
  });

  const miningSites: MiningSite[] = miningSiteTiles.map((tile, idx) => {
    const yieldPerTick = 4 + idx;
    return {
      id: `site-${idx + 1}`,
      x: tile.x,
      y: tile.y,
      yield: yieldPerTick,
      remaining: depositMap.get(`${tile.x},${tile.y}`) ?? 80,
    };
  });

  return { oreDeposits, miningSites };
}

export function applySingleTick(state: ColonyState): ColonyState {
  if (state.status === 'game_over') {
    return state;
  }

  const nextTick = state.tick + 1;
  const prng = new SeededPRNG(state.seed);
  const { buildings: bSpecs, arrivals: aSpecs, colonists: cSpecs, maintenance: mSpecs, rovers: rSpecs, pools, ticksPerSol, refinery: refSpecs, asteroids: astSpecs } = CONTRACT_RULES;

  // 1. Weather / Dust Storms (Buries operational, deactivated, or broken buildings)
  let updatedBuildings: Building[] = state.buildings.map((b) => ({ ...b }));
  if (nextTick >= (mSpecs.minDustStormTick ?? 2500) && nextTick % mSpecs.dustStormWindowTicks === 0) {
    if (prng.chance(mSpecs.dustStormChance)) {
      const unburiedBuildings = updatedBuildings.filter((b) => b.condition !== 'buried');
      const numToBury = Math.min(mSpecs.maxBuriedPerStorm, unburiedBuildings.length);
      for (let i = 0; i < numToBury; i++) {
        const target = prng.pick(updatedBuildings.filter((b) => b.condition !== 'buried'));
        if (target) {
          target.wasBrokenBeforeBurial = target.condition === 'broken' || Boolean(target.wasBrokenBeforeBurial);
          target.condition = 'buried';
          target.digProgress = 0;
        }
      }
    }
  }

  // 2. Building Breakage (Applies to operational & deactivated structures after initial 500-tick grace period)
  if (nextTick >= 500) {
    for (const b of updatedBuildings) {
      if (b.condition === 'operational' || b.condition === 'deactivated') {
        if (prng.chance(mSpecs.breakageChancePerTick)) {
          b.condition = 'broken';
          b.repairProgress = 0;
        }
      }
    }
  }

  // 3. Active Asteroid
  let currentAsteroid: Asteroid | null = state.activeAsteroid ? { ...state.activeAsteroid } : null;
  if (currentAsteroid && nextTick >= currentAsteroid.expiresAtTick) {
    currentAsteroid = null;
  }
  if (!currentAsteroid && nextTick % astSpecs.spawnWindowTicks === 0) {
    if (prng.chance(astSpecs.spawnChance)) {
      const candidateX = prng.nextInt(12, 19);
      const candidateY = prng.nextInt(12, 19);
      currentAsteroid = {
        id: `ast-${nextTick}`,
        x: candidateX,
        y: candidateY,
        yield: prng.nextInt(astSpecs.minYield, astSpecs.maxYield),
        expiresAtTick: nextTick + astSpecs.lifetimeTicks,
      };
    }
  }

  // 4. Colonist Arrivals
  let updatedPendingArrivals: PendingArrival[] = state.pendingArrivals.map((p) => ({ ...p }));
  const totalHabitats = updatedBuildings.filter((b) => b.type === 'habitat').length;
  const totalHabitatCapacity = totalHabitats * bSpecs.habitat.capacity;
  const totalPopulation = state.colonists.length + updatedPendingArrivals.length;

  if (nextTick % aSpecs.intervalTicks === 0 && totalPopulation < totalHabitatCapacity) {
    updatedPendingArrivals.push({
      id: `arr-${nextTick}`,
      landedAtTick: nextTick,
      electronics: aSpecs.electronicsPerShip,
      ticksRemaining: aSpecs.escortWindowTicks,
    });
  }

  // 5. Battery Cells Decay
  const updatedBatteryCells: BatteryCell[] = state.batteryCells.map((c) => ({
    ...c,
    efficiency: Math.max(0, c.efficiency - refSpecs.cellDecayPerTick),
  }));

  // 6. Blocked tiles
  const blockedTiles = new Set<string>();
  for (const b of updatedBuildings) {
    blockedTiles.add(`${b.x},${b.y}`);
  }

  // 7. Rover Simulation
  let currentOre = state.ore;
  let currentElectronics = state.electronics;
  const newlyArrivedColonists: Colonist[] = [];

  let updatedRovers: Rover[] = state.rovers.map((r) => {
    let rover = { ...r };

    if (rover.state === 'idle_at_base') {
      rover.power = Math.min(rSpecs.powerMax, rover.power + rSpecs.rechargeRatePerTick);
      return rover;
    }

    rover.power = Math.max(0, rover.power - rSpecs.powerDrainPerTick);

    if (rover.power === 0) {
      rover.state = 'stranded';
      rover.cargo = null;
      rover.destination = null;
      rover.route = [];
      return rover;
    }

    if (rover.state === 'traveling_out' || rover.state === 'traveling_back') {
      const stepsToTake = Math.min(rSpecs.speedTilesPerTick, rover.route.length);
      for (let s = 0; s < stepsToTake; s++) {
        if (rover.route.length > 0) {
          const nextStep = rover.route.shift()!;
          rover.x = nextStep.x;
          rover.y = nextStep.y;
        }
      }

      if (rover.state === 'traveling_out' && rover.destination && rover.x === rover.destination.x && rover.y === rover.destination.y) {
        rover.state = 'on_site';
        rover.onSiteTicksRemaining = rover.destination.onSiteTicksTotal;
      }

      if (rover.state === 'traveling_back' && rover.x === rover.garageX && rover.y === rover.garageY) {
        if (rover.cargo) {
          if (rover.cargo.type === 'ore') {
            currentOre += rover.cargo.amount;
          } else if (rover.cargo.type === 'arrival') {
            currentElectronics += rover.cargo.electronics;
            newlyArrivedColonists.push({
              id: `col-${nextTick}-${state.colonists.length + newlyArrivedColonists.length + 1}`,
              x: rover.garageX,
              y: rover.garageY,
              health: cSpecs.maxHealth,
              age: 0,
              lifespan: prng.nextInt(cSpecs.minLifespanTicks, cSpecs.maxLifespanTicks),
              destination: null,
              destinationType: 'habitat',
              targetEntityId: null,
              route: [],
            });
          }
        }
        rover.state = 'idle_at_base';
        rover.occupants = 0;
        rover.cargo = null;
        rover.destination = null;
        rover.route = [];
      }

      return rover;
    }

    if (rover.state === 'on_site' && rover.destination) {
      rover.onSiteTicksRemaining -= 1;
      if (rover.onSiteTicksRemaining <= 0) {
        if (rover.destination.type === 'landing_zone') {
          if (updatedPendingArrivals.length > 0) {
            const pickedArrival = updatedPendingArrivals.shift()!;
            rover.cargo = {
              type: 'arrival',
              arrivalId: pickedArrival.id,
              electronics: pickedArrival.electronics,
            };
            rover.occupants = 2;
          }
        } else if (rover.destination.type === 'mining_site') {
          const site = state.miningSites.find((s) => s.x === rover.destination!.x && s.y === rover.destination!.y);
          if (site && site.remaining > 0) {
            const mined = Math.min(site.yield * 10, site.remaining);
            site.remaining -= mined;
            rover.cargo = { type: 'ore', amount: mined };
          }
          rover.occupants = 1;
        } else if (rover.destination.type === 'asteroid' && currentAsteroid) {
          const mined = currentAsteroid.yield;
          currentAsteroid = null;
          rover.cargo = { type: 'ore', amount: mined };
          rover.occupants = 1;
        }

        const returnGoal = [{ x: rover.garageX, y: rover.garageY }];
        rover.route = findShortestRoute({ x: rover.x, y: rover.y }, returnGoal, new Set(), 20);
        rover.state = 'traveling_back';
      }
      return rover;
    }

    return rover;
  });

  // Enforce rover cap: rovers cannot exceed total garage capacity (2 per garage)
  const totalGarages = updatedBuildings.filter((b) => b.type === 'garage').length;
  const maxRoversAllowed = totalGarages * rSpecs.maxRoversPerGarage;
  if (updatedRovers.length > maxRoversAllowed) {
    updatedRovers = updatedRovers.slice(0, maxRoversAllowed);
  }

  // 8. Pending arrivals countdown
  const roversLoadingArrival = updatedRovers.some(
    (r) => r.state === 'on_site' && r.destination?.type === 'landing_zone'
  );
  if (!roversLoadingArrival) {
    updatedPendingArrivals = updatedPendingArrivals
      .map((arr) => ({ ...arr, ticksRemaining: arr.ticksRemaining - 1 }))
      .filter((arr) => arr.ticksRemaining > 0);
  }

  // 9. Colonist Labor and Movement
  let currentColonists: Colonist[] = [...state.colonists, ...newlyArrivedColonists];
  const updatedOreDeposits: OreDeposit[] = state.oreDeposits.map((d) => ({ ...d }));

  const buriedBuildings = updatedBuildings.filter((b) => b.condition === 'buried');
  const brokenBuildings = updatedBuildings.filter((b) => b.condition === 'broken');
  const strandedRovers = updatedRovers.filter((r) => r.state === 'stranded');

  currentColonists = currentColonists.map((c) => {
    let colonist = { ...c };
    colonist.age += 1;

    const isEngagedInMaintenance =
      (colonist.destinationType === 'dig' || colonist.destinationType === 'repair' || colonist.destinationType === 'rover_recovery') &&
      colonist.targetEntityId !== null;

    if (!isEngagedInMaintenance) {
      if (buriedBuildings.length > 0) {
        const target = buriedBuildings[0];
        const goalTiles = getFreeAdjacentTiles({ x: target.x, y: target.y }, blockedTiles, 20);
        colonist.destination = { x: target.x, y: target.y };
        colonist.destinationType = 'dig';
        colonist.targetEntityId = target.id;
        colonist.route = findShortestRoute(
          { x: colonist.x, y: colonist.y },
          goalTiles.length > 0 ? goalTiles : [{ x: target.x, y: target.y }],
          blockedTiles,
          20
        );
      } else if (brokenBuildings.length > 0) {
        const target = brokenBuildings[0];
        const reqElectronics = bSpecs[target.type].repairElectronics;
        if (currentElectronics >= reqElectronics) {
          const goalTiles = getFreeAdjacentTiles({ x: target.x, y: target.y }, blockedTiles, 20);
          colonist.destination = { x: target.x, y: target.y };
          colonist.destinationType = 'repair';
          colonist.targetEntityId = target.id;
          colonist.route = findShortestRoute(
            { x: colonist.x, y: colonist.y },
            goalTiles.length > 0 ? goalTiles : [{ x: target.x, y: target.y }],
            blockedTiles,
            20
          );
        }
      } else if (strandedRovers.length > 0) {
        const target = strandedRovers[0];
        const goalTiles = getFreeAdjacentTiles({ x: target.x, y: target.y }, blockedTiles, 20);
        colonist.destination = { x: target.x, y: target.y };
        colonist.destinationType = 'rover_recovery';
        colonist.targetEntityId = target.id;
        colonist.route = findShortestRoute(
          { x: colonist.x, y: colonist.y },
          goalTiles.length > 0 ? goalTiles : [{ x: target.x, y: target.y }],
          blockedTiles,
          20
        );
      } else if (colonist.destinationType !== 'habitat' || !colonist.destination) {
        const targetHabitat = findNearestAvailableHabitat({ x: colonist.x, y: colonist.y }, updatedBuildings, currentColonists);
        if (targetHabitat) {
          const dest = { x: targetHabitat.x, y: targetHabitat.y };
          const goalTiles = getFreeAdjacentTiles(dest, blockedTiles, 20);
          colonist.destination = dest;
          colonist.destinationType = 'habitat';
          colonist.targetEntityId = targetHabitat.id;
          colonist.route = findShortestRoute({ x: colonist.x, y: colonist.y }, goalTiles, blockedTiles, 20);
        }
      }
    }

    if (colonist.route.length > 0) {
      colonist.moveProgress = (colonist.moveProgress ?? 0) + 1;
      if (colonist.moveProgress >= cSpecs.ticksPerTile) {
        colonist.moveProgress = 0;
        const nextStep = colonist.route[0];
        if (!blockedTiles.has(`${nextStep.x},${nextStep.y}`)) {
          colonist.x = nextStep.x;
          colonist.y = nextStep.y;
          colonist.route = colonist.route.slice(1);

          // If colonist is towing a stranded rover back to garage, update rover position alongside colonist
          if (colonist.destinationType === 'rover_recovery' && colonist.targetEntityId) {
            const r = updatedRovers.find((rov) => rov.id === colonist.targetEntityId);
            if (r && r.state === 'stranded' && colonist.destination && (colonist.destination.x === r.garageX && colonist.destination.y === r.garageY)) {
              r.x = colonist.x;
              r.y = colonist.y;
            }
          }
        }
      }
    } else {
      colonist.moveProgress = 0;
    }

    const isAdjacentOrOnSite = (cx: number, cy: number, tx: number, ty: number) => {
      return Math.abs(cx - tx) + Math.abs(cy - ty) <= 1;
    };

    if (colonist.destination) {
      if (colonist.destinationType === 'dig' && colonist.targetEntityId) {
        const b = updatedBuildings.find((bld) => bld.id === colonist.targetEntityId);
        if (b && b.condition === 'buried') {
          if (isAdjacentOrOnSite(colonist.x, colonist.y, b.x, b.y)) {
            b.digProgress += 1;
            if (b.digProgress >= mSpecs.digOutDurationTicks) {
              if (b.wasBrokenBeforeBurial) {
                b.condition = 'broken';
                b.wasBrokenBeforeBurial = false;
                b.repairProgress = 0;
              } else {
                b.condition = 'operational';
              }
              b.digProgress = 0;
              colonist.destination = null;
              colonist.destinationType = null;
              colonist.targetEntityId = null;
            }
          }
        } else {
          colonist.destination = null;
          colonist.destinationType = null;
          colonist.targetEntityId = null;
        }
      } else if (colonist.destinationType === 'repair' && colonist.targetEntityId) {
        const b = updatedBuildings.find((bld) => bld.id === colonist.targetEntityId);
        if (b && b.condition === 'broken') {
          if (isAdjacentOrOnSite(colonist.x, colonist.y, b.x, b.y)) {
            b.repairProgress += 1;
            const requiredRepairTicks = b.type === 'scrubber' ? (mSpecs.scrubberRepairDurationTicks ?? 30) : mSpecs.repairDurationTicks;
            if (b.repairProgress >= requiredRepairTicks) {
              const reqElectronics = bSpecs[b.type].repairElectronics;
              if (currentElectronics >= reqElectronics) {
                currentElectronics -= reqElectronics;
                b.condition = 'operational';
                b.repairProgress = 0;
                colonist.destination = null;
                colonist.destinationType = null;
                colonist.targetEntityId = null;
              }
            }
          }
        } else {
          colonist.destination = null;
          colonist.destinationType = null;
          colonist.targetEntityId = null;
        }
      } else if (colonist.destinationType === 'rover_recovery' && colonist.targetEntityId) {
        const r = updatedRovers.find((rov) => rov.id === colonist.targetEntityId);
        if (r && r.state === 'stranded') {
          const isTowingToGarage = colonist.destination && colonist.destination.x === r.garageX && colonist.destination.y === r.garageY;

          if (isTowingToGarage) {
            // Towing phase: check if reached garage
            if (isAdjacentOrOnSite(colonist.x, colonist.y, r.garageX, r.garageY)) {
              r.state = 'idle_at_base';
              r.x = r.garageX;
              r.y = r.garageY;
              r.power = 0;
              colonist.destination = null;
              colonist.destinationType = null;
              colonist.targetEntityId = null;
              colonist.route = [];
            }
          } else {
            // Outbound phase: check if reached stranded rover
            if (isAdjacentOrOnSite(colonist.x, colonist.y, r.x, r.y)) {
              // Begin towing back to garage
              const dest = { x: r.garageX, y: r.garageY };
              const goalTiles = getFreeAdjacentTiles(dest, blockedTiles, 20);
              colonist.destination = dest;
              colonist.route = findShortestRoute(
                { x: colonist.x, y: colonist.y },
                goalTiles.length > 0 ? goalTiles : [dest],
                blockedTiles,
                20
              );

              if (isAdjacentOrOnSite(colonist.x, colonist.y, r.garageX, r.garageY)) {
                r.state = 'idle_at_base';
                r.x = r.garageX;
                r.y = r.garageY;
                r.power = 0;
                colonist.destination = null;
                colonist.destinationType = null;
                colonist.targetEntityId = null;
                colonist.route = [];
              }
            }
          }
        } else {
          colonist.destination = null;
          colonist.destinationType = null;
          colonist.targetEntityId = null;
          colonist.route = [];
        }
      }
    }

    return colonist;
  });

  // 10. Production & Consumption
  let powerProduced = 0;
  let powerDrawn = 0;
  let oxygenProduced = 0;
  let foodProduced = 0;

  for (const b of updatedBuildings) {
    if (b.condition !== 'operational') continue;

    let adjacentNeighbors = 0;
    for (const other of updatedBuildings) {
      if (other.id !== b.id && Math.abs(b.x - other.x) + Math.abs(b.y - other.y) === 1) {
        adjacentNeighbors += 1;
      }
    }
    const maxFree = CONTRACT_RULES.spacing?.maxAdjacentForFullEfficiency ?? 1;
    const penaltyRate = CONTRACT_RULES.spacing?.crowdingPenaltyPerNeighbor ?? 1;
    const crowdingPenalty = Math.max(0, adjacentNeighbors - maxFree) * penaltyRate;

    const spec = bSpecs[b.type];
    powerProduced += Math.max(0, spec.powerProduction - crowdingPenalty);
    powerDrawn += spec.powerDraw;
    oxygenProduced += Math.max(0, spec.oxygenProduction - crowdingPenalty);
    foodProduced += Math.max(0, spec.foodProduction - crowdingPenalty);

    // Extractor: mines ore from local tile deposit (1 ore / 5 ticks, requires colonist workforce)
    if (b.type === 'extractor') {
      const deposit = updatedOreDeposits.find((d) => d.x === b.x && d.y === b.y);
      if (deposit && deposit.remaining > 0) {
        const extractionInterval = CONTRACT_RULES.buildings.extractor.ticksPerExtraction ?? 5;
        if (nextTick % extractionInterval === 0) {
          const take = Math.min(1, deposit.remaining);
          deposit.remaining -= take;
          currentOre += take;
        }
      }
    }
  }

  const oxygenConsumed = currentColonists.length * cSpecs.oxygenConsumptionPerTick;
  const foodConsumed = currentColonists.length * cSpecs.foodConsumptionPerTick;

  const operationalScrubbers = updatedBuildings.filter((b) => b.type === 'scrubber' && b.condition === 'operational').length;
  const maxOxygen = (pools.oxygenBaseMax ?? 100) + (operationalScrubbers * (pools.oxygenPerScrubber ?? 25));

  const nextPower = Math.min(pools.powerMax, Math.max(pools.powerMin, state.power + powerProduced - powerDrawn));
  const nextOxygen = Math.min(maxOxygen, Math.max(pools.oxygenMin, state.oxygen + oxygenProduced - oxygenConsumed));
  const nextFood = Math.min(pools.foodMax, Math.max(pools.foodMin, state.food + foodProduced - foodConsumed));

  // 11. Health Rule: Colonists take damage only if a critical resource is at 0 AND demand exceeds production
  const hasOxygenDeficit = nextOxygen === pools.oxygenMin && oxygenProduced < oxygenConsumed;
  const hasPowerDeficit = nextPower === pools.powerMin && powerProduced < powerDrawn;
  const hasFoodDeficit = nextFood === pools.foodMin && foodProduced < foodConsumed;
  const isStarving = hasOxygenDeficit || hasPowerDeficit || hasFoodDeficit;
  const updatedHealthColonists = currentColonists.map((c) => {
    const newHealth = isStarving
      ? Math.max(0, c.health - cSpecs.healthDamagePerTick)
      : Math.min(cSpecs.maxHealth, c.health + cSpecs.healthRecoveryPerTick);
    return { ...c, health: newHealth };
  });

  // 12. Colonist Mortality
  const livingColonists = updatedHealthColonists.filter((c) => c.health > 0 && c.age < c.lifespan);

  let nextStatus: 'active' | 'game_over' = 'active';
  let nextBestSols = state.bestSolsSurvived;
  let nextGameOverReason: string | undefined = state.gameOverReason;

  if (livingColonists.length === 0) {
    nextStatus = 'game_over';
    const solsSurvived = Math.floor(nextTick / ticksPerSol);
    if (solsSurvived > nextBestSols) {
      nextBestSols = solsSurvived;
    }
    if (!nextGameOverReason) {
      if (hasPowerDeficit || nextPower === 0 || state.power === 0) {
        nextGameOverReason = 'POWER GRID COLLAPSE: Electrical power depleted to 0% (Life support heating shut down)';
      } else if (hasOxygenDeficit || nextOxygen === 0 || state.oxygen === 0) {
        nextGameOverReason = 'CRITICAL ASPHYXIATION: Oxygen depleted to 0% (Life support scrubbers offline)';
      } else if (hasFoodDeficit || nextFood === 0 || state.food === 0) {
        nextGameOverReason = 'COLONY STARVATION: Food reserves depleted to 0% (Agricultural supply exhausted)';
      } else {
        nextGameOverReason = 'POPULATION ATTRITION: All pioneer colonists reached maximum natural lifespan';
      }
    }
  }

  return {
    ...state,
    tick: nextTick,
    seed: prng.getState(),
    oxygen: nextOxygen,
    power: nextPower,
    food: nextFood,
    ore: currentOre,
    electronics: currentElectronics,
    oreDeposits: updatedOreDeposits,
    buildings: updatedBuildings,
    colonists: livingColonists,
    pendingArrivals: updatedPendingArrivals,
    rovers: updatedRovers,
    batteryCells: updatedBatteryCells,
    activeAsteroid: currentAsteroid,
    status: nextStatus,
    gameOverReason: nextGameOverReason,
    bestSolsSurvived: nextBestSols,
  };
}

export function applyTicks(state: ColonyState, nTicks: number): ColonyState {
  if (nTicks <= 0 || state.status === 'game_over') {
    return state;
  }

  let current = state;
  for (let i = 0; i < nTicks; i++) {
    current = applySingleTick(current);
    if (current.status === 'game_over') {
      break;
    }
  }

  return current;
}

export async function executeAuthoritativeTick(
  client: any,
  colonyId: string,
  userId: string
): Promise<ColonyData> {
  let bestSolsSurvived = 0;
  const { data: userProfile } = await client
    .from('marscolony_users')
    .select('best_sols_survived')
    .eq('id', userId)
    .maybeSingle();

  if (userProfile) {
    bestSolsSurvived = userProfile.best_sols_survived ?? 0;
  }

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

  const { data: buildingsData } = await client
    .from('marscolony_buildings')
    .select('*')
    .eq('colony_id', colonyId)
    .order('created_at', { ascending: true });

  const buildings: Building[] = (buildingsData || []).map((b: any) => ({
    id: b.id,
    type: b.type as BuildingType,
    x: b.x,
    y: b.y,
    condition: b.condition ?? 'operational',
    repairProgress: b.repair_progress ?? 0,
    digProgress: b.dig_progress ?? 0,
    wasBrokenBeforeBurial: b.was_broken_before_burial ?? false,
  }));

  const { data: colonistsData } = await client
    .from('marscolony_colonists')
    .select('*')
    .eq('colony_id', colonyId);

  const colonists: Colonist[] = (colonistsData || []).map((c: any) => ({
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

  const { data: roversData } = await client
    .from('marscolony_rovers')
    .select('*')
    .eq('colony_id', colonyId);

  const rovers: Rover[] = (roversData || []).map((r: any) => ({
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

  const { data: depositsData } = await client
    .from('marscolony_ore_deposits')
    .select('*')
    .eq('colony_id', colonyId);

  let oreDeposits: OreDeposit[] = (depositsData || []).map((d: any) => ({
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
    const newLastTickAt = new Date().toISOString();

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

    // If colony reached game_over, wipe active sub-entities from DB
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
  client: any,
  colonyId: string,
  userId: string,
  action: SimulationAction
): Promise<{ success: boolean; reason?: string; colonyData: ColonyData }> {
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

      if (!isInsideGrid(x, y, 20)) {
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

      if (targetX === undefined || targetY === undefined || !isInsideGrid(targetX, targetY, 20)) {
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

      const updatedColonists = activeColonists.map((c: any) => {
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
        supabase
          .from('marscolony_buildings')
          .delete()
          .eq('id', bld.id)
          .eq('owner', userId),
        supabase
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
      const initialSeed = generateInitialSeed();
      const prng = new SeededPRNG(initialSeed);
      const { oreDeposits: freshDeposits, miningSites: freshSites } = generateOreDistribution(prng);
      const { starting, colonists: cSpecs } = CONTRACT_RULES;
      const habX = starting.starterHabitat?.x ?? 7;
      const habY = starting.starterHabitat?.y ?? 7;
      const solX = starting.starterSolar?.x ?? 5;
      const solY = starting.starterSolar?.y ?? 7;
      const scbX = starting.starterScrubber?.x ?? 9;
      const scbY = starting.starterScrubber?.y ?? 7;

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
        ? insertedBuildings.map((b: any) => ({
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
            { id: `bld-hab-${Date.now()}`, type: 'habitat' as BuildingType, x: habX, y: habY, condition: 'operational' as BuildingCondition, repairProgress: 0, digProgress: 0, wasBrokenBeforeBurial: false },
            { id: `bld-sol-${Date.now()}`, type: 'solar' as BuildingType, x: solX, y: solY, condition: 'operational' as BuildingCondition, repairProgress: 0, digProgress: 0, wasBrokenBeforeBurial: false },
            { id: `bld-scb-${Date.now()}`, type: 'scrubber' as BuildingType, x: scbX, y: scbY, condition: 'operational' as BuildingCondition, repairProgress: 0, digProgress: 0, wasBrokenBeforeBurial: false },
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
        ? insertedColonists.map((c: any) => ({
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
            { id: `col-p1-${Date.now()}`, x: habX, y: habY, health: 100, age: 0, lifespan: 8000, destination: { x: habX, y: habY }, destinationType: 'habitat' as any, targetEntityId: null, route: [] },
            { id: `col-p2-${Date.now()}`, x: habX, y: habY, health: 100, age: 0, lifespan: 8000, destination: { x: habX, y: habY }, destinationType: 'habitat' as any, targetEntityId: null, route: [] },
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
