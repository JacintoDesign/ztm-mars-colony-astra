import { ColonyState, SimulationAction, BuildingType, GridCoord } from './types';
import { CONTRACT_RULES, countsTowardWorkforceCap } from './contract-rules';

const GRID_SIZE = 20;
const POWER_RESERVE = 1;
const MIN_POWER_SURPLUS = 3;
const MAX_SOLAR = 8;
const MAX_EXTRACTORS = 1;

function occupiedTiles(state: ColonyState): Set<string> {
  const tiles = new Set<string>(['0,0']);
  for (const b of state.buildings) tiles.add(`${b.x},${b.y}`);
  return tiles;
}

function neighborCount(x: number, y: number, occupied: Set<string>): number {
  return [
    [x, y - 1],
    [x + 1, y],
    [x, y + 1],
    [x - 1, y],
  ].filter(([nx, ny]) => occupied.has(`${nx},${ny}`)).length;
}

function isProducer(type: BuildingType): boolean {
  const spec = CONTRACT_RULES.buildings[type];
  return spec.powerProduction > 0 || spec.oxygenProduction > 0 || spec.foodProduction > 0;
}

function minDistToWorkers(state: ColonyState, x: number, y: number): number {
  if (state.colonists.length === 0) return 99;
  return Math.min(
    ...state.colonists.map((c) => Math.abs(c.x - x) + Math.abs(c.y - y))
  );
}

function crowdingIfPlaced(state: ColonyState, x: number, y: number, occupied: Set<string>): number {
  let penalty = 0;
  for (const b of state.buildings) {
    if (Math.abs(b.x - x) + Math.abs(b.y - y) !== 1) continue;
    if (!isProducer(b.type)) continue;
    const existing = neighborCount(b.x, b.y, occupied);
    if (existing >= 1) penalty += 120;
  }
  return penalty;
}

function diagonalNeighborCount(x: number, y: number, occupied: Set<string>): number {
  return [
    [x - 1, y - 1],
    [x + 1, y - 1],
    [x + 1, y + 1],
    [x - 1, y + 1],
  ].filter(([nx, ny]) => occupied.has(`${nx},${ny}`)).length;
}

function findOpenTile(
  state: ColonyState,
  options: { preferOre?: boolean; nearWorkers?: boolean } = {}
): GridCoord | null {
  const occupied = occupiedTiles(state);
  const origin = CONTRACT_RULES.starting.starterHabitat;
  const { preferOre = false, nearWorkers = false } = options;

  const collect = (maxOrtho: number): Array<GridCoord & { score: number }> => {
    const candidates: Array<GridCoord & { score: number }> = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        if (occupied.has(`${x},${y}`)) continue;
        const deposit = state.oreDeposits.find((d) => d.x === x && d.y === y && d.remaining > 0);
        if (preferOre && !deposit) continue;
        const neighbors = neighborCount(x, y, occupied);
        if (neighbors > maxOrtho) continue;
        const dist = Math.abs(x - origin.x) + Math.abs(y - origin.y);
        const walk = nearWorkers ? minDistToWorkers(state, x, y) : dist;
        const orePenalty = !preferOre && deposit ? 12 : 0;
        const oreBonus = preferOre && deposit ? -deposit.remaining : 0;
        const clusterPenalty = crowdingIfPlaced(state, x, y, occupied);
        const diag = diagonalNeighborCount(x, y, occupied);
        candidates.push({
          x,
          y,
          score: neighbors * 200 + diag * 50 + walk * 8 + dist * 10 + orePenalty + oreBonus + clusterPenalty,
        });
      }
    }
    return candidates;
  };

  let candidates = collect(0);
  if (candidates.length === 0) candidates = collect(1);
  if (candidates.length === 0 && preferOre) {
    return findOpenTile(state, { ...options, preferOre: false });
  }

  candidates.sort((a, b) => a.score - b.score || a.x - b.x || a.y - b.y);
  return candidates[0] ? { x: candidates[0].x, y: candidates[0].y } : null;
}

function canAfford(state: ColonyState, type: BuildingType): boolean {
  const cost = CONTRACT_RULES.buildings[type].cost;
  return state.power - cost.power >= POWER_RESERVE && state.ore >= cost.ore;
}

function countType(state: ColonyState, type: BuildingType, operationalOnly = false): number {
  return state.buildings.filter(
    (b) => b.type === type && (!operationalOnly || b.condition === 'operational')
  ).length;
}

function constructingOf(state: ColonyState, type: BuildingType): number {
  return state.buildings.filter((b) => b.type === type && b.condition === 'constructing').length;
}

function constructingCount(state: ColonyState): number {
  return state.buildings.filter((b) => b.condition === 'constructing').length;
}

function workforceRemaining(state: ColonyState): number {
  const used = state.buildings.filter(countsTowardWorkforceCap).length;
  const cap = state.colonists.length * CONTRACT_RULES.workforce.operationalBuildingsPerColonist;
  return cap - used;
}

function livePower(state: ColonyState): { prod: number; draw: number; net: number } {
  return powerBalance(state, false);
}

function projectedPower(state: ColonyState): { prod: number; draw: number; net: number } {
  return powerBalance(state, true);
}

function powerBalance(state: ColonyState, includeQueued: boolean): { prod: number; draw: number; net: number } {
  const specs = CONTRACT_RULES.buildings;
  const relevant = state.buildings.filter(
    (b) => b.condition === 'operational' || (includeQueued && b.condition === 'constructing')
  );
  const prod = relevant.reduce((sum, b) => sum + specs[b.type].powerProduction, 0);
  const draw = relevant.reduce((sum, b) => sum + specs[b.type].powerDraw, 0);
  return { prod, draw, net: prod - draw };
}

function adjacentBuildingCount(state: ColonyState, x: number, y: number): number {
  return state.buildings.filter((other) => Math.abs(other.x - x) + Math.abs(other.y - y) === 1).length;
}

function outputOf(
  state: ColonyState,
  type: 'scrubber' | 'farm',
  field: 'oxygenProduction' | 'foodProduction',
  includeQueued: boolean
): number {
  const spec = CONTRACT_RULES.buildings[type];
  const maxFree = CONTRACT_RULES.spacing.maxAdjacentForFullEfficiency;
  const penaltyRate = CONTRACT_RULES.spacing.crowdingPenaltyPerNeighbor;
  return state.buildings
    .filter(
      (b) =>
        b.type === type &&
        (b.condition === 'operational' || (includeQueued && b.condition === 'constructing'))
    )
    .reduce((sum, b) => {
      const crowding = Math.max(0, adjacentBuildingCount(state, b.x, b.y) - maxFree) * penaltyRate;
      return sum + Math.max(0, spec[field] - crowding);
    }, 0);
}

function tryPlace(
  state: ColonyState,
  type: BuildingType,
  options: { preferOre?: boolean; nearWorkers?: boolean } = {}
): SimulationAction | null {
  if (!canAfford(state, type)) return null;
  if (type !== 'habitat' && workforceRemaining(state) <= 0) return null;
  if (constructingCount(state) >= Math.max(1, state.colonists.length)) return null;
  const tile = findOpenTile(state, {
    preferOre: options.preferOre,
    nearWorkers: options.nearWorkers ?? (type === 'farm' || type === 'scrubber' || type === 'solar'),
  });
  if (!tile) return null;
  return { type: 'PLACE_BUILDING', buildingType: type, x: tile.x, y: tile.y };
}

function stillNeedsExtractorOre(state: ColonyState): boolean {
  const farmCost = CONTRACT_RULES.buildings.farm.cost.ore;
  const habitatCost = CONTRACT_RULES.buildings.habitat.cost.ore;
  const scrubberCost = CONTRACT_RULES.buildings.scrubber.cost.ore;
  const garageCost = CONTRACT_RULES.buildings.garage.cost.ore;
  if (countType(state, 'garage') === 0 && state.ore < garageCost) return true;
  if (countType(state, 'habitat') < 2 && state.ore < habitatCost) return true;
  if (countType(state, 'farm') < 4 && state.ore < farmCost) return true;
  if (countType(state, 'habitat') >= 2 && countType(state, 'scrubber') < 4 && state.ore < scrubberCost) {
    return true;
  }
  return false;
}

function tryPlaceExtractorOnOre(state: ColonyState): SimulationAction | null {
  if (countType(state, 'extractor') >= MAX_EXTRACTORS || constructingOf(state, 'extractor') > 0) return null;
  const extractor = trySolarThen(state, 'extractor');
  if (extractor?.type === 'PLACE_BUILDING' && extractor.buildingType === 'extractor') {
    const tile = findOpenTile(state, { preferOre: true, nearWorkers: true });
    if (tile) return { type: 'PLACE_BUILDING', buildingType: 'extractor', x: tile.x, y: tile.y };
  }
  return extractor;
}

function tryRelocateExhaustedExtractor(state: ColonyState): SimulationAction | null {
  if (state.ore >= 25 && !stillNeedsExtractorOre(state)) return null;
  const extractor = state.buildings.find(
    (b) =>
      b.type === 'extractor' &&
      b.condition !== 'broken' &&
      b.condition !== 'buried' &&
      b.condition !== 'constructing'
  );
  if (!extractor) return null;
  const deposit = state.oreDeposits.find((d) => d.x === extractor.x && d.y === extractor.y);
  if (deposit && deposit.remaining > 0) return null;
  if (state.power < 10 + POWER_RESERVE) return null;
  const tile = findOpenTile(state, { preferOre: true, nearWorkers: true });
  if (!tile) return null;
  const fresh = state.oreDeposits.find((d) => d.x === tile.x && d.y === tile.y && d.remaining > 0);
  if (!fresh) return null;
  return { type: 'MOVE_BUILDING', buildingId: extractor.id, targetX: tile.x, targetY: tile.y };
}

function tryPauseNonEssential(state: ColonyState): SimulationAction | null {
  if (stillNeedsExtractorOre(state)) return null;
  const pauseable = state.buildings.find(
    (b) =>
      (b.type === 'extractor' || b.type === 'refinery') &&
      b.condition === 'operational'
  );
  if (!pauseable) return null;
  return { type: 'TOGGLE_BUILDING_POWER', buildingId: pauseable.id };
}

function trySolarThen(state: ColonyState, type: BuildingType, nearWorkers = true): SimulationAction | null {
  const extraDraw = CONTRACT_RULES.buildings[type].powerDraw;
  const extraProd = CONTRACT_RULES.buildings[type].powerProduction;
  const projected = projectedPower(state);
  const solarQueued = constructingOf(state, 'solar') > 0;
  const cost = CONTRACT_RULES.buildings[type].cost;
  const opening = type === 'farm' && countType(state, 'farm') === 0;
  const wouldNet = projected.net + extraProd - extraDraw;

  if (!opening && wouldNet < 1 && !solarQueued && countType(state, 'solar') < MAX_SOLAR) {
    const solar = tryPlace(state, 'solar', { nearWorkers: true });
    if (solar) return solar;
    const pause = tryPauseNonEssential(state);
    if (pause && workforceRemaining(state) <= 0) return pause;
  }

  if (!canAfford(state, type)) {
    if (!opening && state.ore >= cost.ore && projected.net <= 0 && !solarQueued) {
      return tryPlace(state, 'solar', { nearWorkers: true });
    }
    return null;
  }

  const placed = tryPlace(state, type, { nearWorkers });
  if (placed) return placed;
  if (type !== 'habitat' && workforceRemaining(state) <= 0) {
    return tryPauseNonEssential(state);
  }
  return null;
}

/**
 * Pure next-action chooser for unattended play. Callers must dispatch the result
 * through the store — this function never mutates colony state.
 */
export function nextAutopilotAction(state: ColonyState): SimulationAction | null {
  if (state.status !== 'active' || state.colonists.length === 0) return null;

  const specs = CONTRACT_RULES.buildings;
  const habitats = countType(state, 'habitat');
  const mouths = state.colonists.length;
  const habitatCapacity = habitats * CONTRACT_RULES.buildings.habitat.capacity;
  const plannedPop = Math.max(
    mouths + state.pendingArrivals.length,
    Math.min(habitatCapacity, 4)
  );
  const foodNeed =
    plannedPop * CONTRACT_RULES.colonists.foodConsumptionPerTick + (plannedPop >= 3 ? 5 : 0);
  const o2Need =
    plannedPop * CONTRACT_RULES.colonists.oxygenConsumptionPerTick + (plannedPop >= 3 ? 5 : 0);
  const liveFoodNeed = mouths * CONTRACT_RULES.colonists.foodConsumptionPerTick;
  const liveO2Need = mouths * CONTRACT_RULES.colonists.oxygenConsumptionPerTick;
  const live = livePower(state);
  const projected = projectedPower(state);
  const queuedFood = outputOf(state, 'farm', 'foodProduction', true);
  const liveFood = outputOf(state, 'farm', 'foodProduction', false);
  const queuedO2 = outputOf(state, 'scrubber', 'oxygenProduction', true);
  const liveO2 = outputOf(state, 'scrubber', 'oxygenProduction', false);
  const idleRover = state.rovers.find((r) => r.state === 'idle_at_base');
  const cellCount = state.batteryCells.length;
  const hasRefinery = state.buildings.some((b) => b.type === 'refinery' && b.condition === 'operational');
  const sitesOpen = constructingCount(state) < Math.max(1, state.colonists.length);
  const foodShort = queuedFood < foodNeed;
  const o2Short = queuedO2 < o2Need;
  const farms = countType(state, 'farm');
  const scrubbers = countType(state, 'scrubber');
  const solars = countType(state, 'solar');

  const escortsEnRoute = state.rovers.filter(
    (r) =>
      r.destination?.type === 'landing_zone' ||
      r.cargo?.type === 'arrival' ||
      ((r.state === 'traveling_out' || r.state === 'on_site') && r.x === 0 && r.y === 0)
  ).length;
  if (state.pendingArrivals.length > escortsEnRoute && idleRover) {
    if (cellCount === 0 && hasRefinery && state.ore >= CONTRACT_RULES.refinery.oreCostPerCell) {
      return { type: 'REFINE_CELL' };
    }
    if (cellCount > 0) {
      return {
        type: 'DISPATCH_ROVER',
        roverId: idleRover.id,
        destinationType: 'landing_zone',
      };
    }
  }

  if ((live.net < 0 || projected.net < 0) && solars < MAX_SOLAR && constructingOf(state, 'solar') === 0) {
    const solar = tryPlace(state, 'solar', { nearWorkers: true });
    if (solar) return solar;
  }

  const criticalDown = state.buildings.some(
    (b) =>
      (b.condition === 'broken' || b.condition === 'buried') &&
      (b.type === 'farm' || b.type === 'scrubber' || b.type === 'solar' || b.type === 'habitat')
  );
  if (criticalDown) return null;

  const relocate = tryRelocateExhaustedExtractor(state);
  if (relocate) return relocate;

  if (!sitesOpen) return null;

  if (farms < 2 && constructingOf(state, 'farm') === 0) {
    const farm = trySolarThen(state, 'farm', true);
    if (farm) return farm;
  }

  if (scrubbers < 2 && constructingOf(state, 'scrubber') === 0) {
    const scrubber = trySolarThen(state, 'scrubber', true);
    if (scrubber) return scrubber;
  }

  if (
    habitats < 2 &&
    farms >= 2 &&
    scrubbers >= 2 &&
    constructingOf(state, 'habitat') === 0
  ) {
    const habitat = trySolarThen(state, 'habitat', true);
    if (habitat) return habitat;
  }

  if (solars < 2 && constructingOf(state, 'solar') === 0) {
    const solar = tryPlace(state, 'solar', { nearWorkers: true });
    if (solar) return solar;
  }

  const hasGarage = countType(state, 'garage') > 0;
  if (!hasGarage && constructingOf(state, 'garage') === 0) {
    if (state.ore < CONTRACT_RULES.buildings.garage.cost.ore) {
      const extractor = tryPlaceExtractorOnOre(state);
      if (extractor) return extractor;
    }
    const garage = trySolarThen(state, 'garage', true);
    if (garage) return garage;
  }

  if ((foodShort || liveFood < liveFoodNeed) && constructingOf(state, 'farm') === 0) {
    const farmBroken = state.buildings.some((b) => b.type === 'farm' && b.condition === 'broken');
    const waitForGarage = farms >= 2 && !hasGarage && liveFood >= liveFoodNeed;
    if (!farmBroken && !waitForGarage) {
      const farm = trySolarThen(state, 'farm');
      if (farm) return farm;
    }
    if (liveFood < liveFoodNeed) return null;
  }

  if (liveFood < liveFoodNeed) {
    if (projected.net < 0 || live.net < 1) {
      const solar = tryPlace(state, 'solar', { nearWorkers: true });
      if (solar) return solar;
    }
    return null;
  }

  if (o2Short && constructingOf(state, 'scrubber') === 0) {
    if (
      scrubbers >= 2 &&
      projected.net - specs.scrubber.powerDraw < 1 &&
      solars < MAX_SOLAR &&
      constructingOf(state, 'solar') === 0
    ) {
      const solar = tryPlace(state, 'solar', { nearWorkers: true });
      if (solar) return solar;
    }
    const scrubber = trySolarThen(state, 'scrubber');
    if (scrubber) return scrubber;
  }

  if ((projected.net < 0 || live.net < 1) && solars < MAX_SOLAR) {
    const solar = tryPlace(state, 'solar', { nearWorkers: true });
    if (solar) return solar;
    const pause = tryPauseNonEssential(state);
    if (pause && workforceRemaining(state) <= 0) return pause;
  }

  if (liveO2 < liveO2Need) return null;

  const needBeds = mouths + state.pendingArrivals.length >= habitatCapacity;
  const needExtractor =
    (hasGarage || stillNeedsExtractorOre(state)) &&
    countType(state, 'extractor') < MAX_EXTRACTORS &&
    constructingOf(state, 'extractor') === 0;
  if (needExtractor && (needBeds || stillNeedsExtractorOre(state) || state.ore < 10)) {
    const extractor = tryPlaceExtractorOnOre(state);
    if (extractor) return extractor;
  }

  if (
    needBeds &&
    habitatCapacity < 4 &&
    constructingOf(state, 'habitat') === 0
  ) {
    const habitat = trySolarThen(state, 'habitat', true);
    if (habitat) return habitat;
  }

  const wantBufferFarm =
    hasGarage && plannedPop >= 3 && farms < 3 && constructingOf(state, 'farm') === 0;
  if (wantBufferFarm && !state.buildings.some((b) => b.type === 'farm' && b.condition === 'broken')) {
    const farm = trySolarThen(state, 'farm');
    if (farm) return farm;
  }

  if (projected.net < MIN_POWER_SURPLUS && solars < MAX_SOLAR && habitats >= 2) {
    const keepSlotForFarm = farms < 3 && workforceRemaining(state) <= 1;
    if (!keepSlotForFarm || projected.net < 1) {
      const solar = tryPlace(state, 'solar', { nearWorkers: true });
      if (solar) return solar;
    }
  }

  if (
    hasGarage &&
    countType(state, 'extractor') < MAX_EXTRACTORS &&
    constructingOf(state, 'extractor') === 0 &&
    (farms >= 3 || state.colonists.length >= 3)
  ) {
    const extractor = tryPlaceExtractorOnOre(state);
    if (extractor) return extractor;
  }

  const extractorBld = state.buildings.find((b) => b.type === 'extractor');
  if (
    extractorBld?.condition === 'deactivated' &&
    workforceRemaining(state) > 0 &&
    (stillNeedsExtractorOre(state) || (!foodShort && !o2Short))
  ) {
    return { type: 'TOGGLE_BUILDING_POWER', buildingId: extractorBld.id };
  }

  if (
    countType(state, 'garage') > 0 &&
    countType(state, 'refinery') === 0 &&
    constructingCount(state) === 0 &&
    state.ore >= 15 &&
    farms >= 4 &&
    scrubbers >= 3 &&
    projected.net >= 8
  ) {
    const refinery = trySolarThen(state, 'refinery', true);
    if (refinery) return refinery;
  }

  const refineryBld = state.buildings.find((b) => b.type === 'refinery');
  if (refineryBld?.condition === 'operational' && cellCount >= 1 && state.pendingArrivals.length === 0) {
    return { type: 'TOGGLE_BUILDING_POWER', buildingId: refineryBld.id };
  }
  if (refineryBld?.condition === 'deactivated' && (cellCount === 0 || state.pendingArrivals.length > 0)) {
    return { type: 'TOGGLE_BUILDING_POWER', buildingId: refineryBld.id };
  }

  const escortWindowOpen =
    state.tick < CONTRACT_RULES.arrivals.intervalTicks + CONTRACT_RULES.arrivals.escortWindowTicks;
  const reserveCells =
    state.pendingArrivals.length > 0 || escortWindowOpen || countType(state, 'garage', true) > 0 ? 1 : 0;
  if (
    idleRover &&
    cellCount > reserveCells &&
    state.pendingArrivals.length === 0 &&
    !escortWindowOpen &&
    state.colonists.length > 2
  ) {
    if (state.activeAsteroid) {
      return {
        type: 'DISPATCH_ROVER',
        roverId: idleRover.id,
        destinationType: 'asteroid',
        targetTile: { x: state.activeAsteroid.x, y: state.activeAsteroid.y },
      };
    }
    if (state.miningSites.length > 0) {
      const site = state.miningSites[0];
      return {
        type: 'DISPATCH_ROVER',
        roverId: idleRover.id,
        destinationType: 'mining_site',
        targetTile: { x: site.x, y: site.y },
      };
    }
  }

  if (hasRefinery && cellCount < 1 && state.ore >= CONTRACT_RULES.refinery.oreCostPerCell) {
    return { type: 'REFINE_CELL' };
  }

  return null;
}
