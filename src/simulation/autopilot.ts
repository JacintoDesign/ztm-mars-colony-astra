import { ColonyState, SimulationAction, BuildingType, GridCoord } from './types';
import { CONTRACT_RULES, countsTowardWorkforceCap } from './contract-rules';

const GRID_SIZE = 20;

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

function findOpenTile(
  state: ColonyState,
  preferOre = false
): GridCoord | null {
  const occupied = occupiedTiles(state);
  const origin = CONTRACT_RULES.starting.starterHabitat;
  const candidates: Array<GridCoord & { score: number }> = [];

  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      if (occupied.has(`${x},${y}`)) continue;
      const deposit = state.oreDeposits.find((d) => d.x === x && d.y === y && d.remaining > 0);
      if (preferOre && !deposit) continue;
      if (!preferOre && deposit) continue;
      const neighbors = neighborCount(x, y, occupied);
      if (neighbors >= 2) continue;
      const dist = Math.abs(x - origin.x) + Math.abs(y - origin.y);
      candidates.push({ x, y, score: dist * 10 + neighbors });
    }
  }

  if (candidates.length === 0 && preferOre) {
    return findOpenTile(state, false);
  }

  candidates.sort((a, b) => a.score - b.score || a.x - b.x || a.y - b.y);
  return candidates[0] ? { x: candidates[0].x, y: candidates[0].y } : null;
}

function canAfford(state: ColonyState, type: BuildingType): boolean {
  const cost = CONTRACT_RULES.buildings[type].cost;
  // Never spend the grid to 0 — power 0 is a health-loss condition.
  return state.power - cost.power >= 1 && state.ore >= cost.ore;
}

function hasBuilding(state: ColonyState, type: BuildingType): boolean {
  return state.buildings.some((b) => b.type === type);
}

function countType(state: ColonyState, type: BuildingType, operationalOnly = false): number {
  return state.buildings.filter(
    (b) => b.type === type && (!operationalOnly || b.condition === 'operational')
  ).length;
}

function workforceRemaining(state: ColonyState): number {
  const used = state.buildings.filter(countsTowardWorkforceCap).length;
  const cap = state.colonists.length * CONTRACT_RULES.workforce.operationalBuildingsPerColonist;
  return cap - used;
}

function constructingCount(state: ColonyState): number {
  return state.buildings.filter((b) => b.condition === 'constructing').length;
}

function tryPlace(state: ColonyState, type: BuildingType, preferOre = false): SimulationAction | null {
  if (!canAfford(state, type)) return null;
  if (type !== 'habitat' && workforceRemaining(state) <= 0) return null;
  const inProgress = constructingCount(state);
  if (inProgress >= Math.max(1, state.colonists.length)) return null;
  // Rush the first farm to completion before queueing a second site.
  if (countType(state, 'farm', true) === 0 && inProgress >= 1) return null;
  const tile = findOpenTile(state, preferOre);
  if (!tile) return null;
  return { type: 'PLACE_BUILDING', buildingType: type, x: tile.x, y: tile.y };
}

/** Place `type`, or a solar first when this consumer would leave the grid unable to buy generation. */
function trySupportPlace(
  state: ColonyState,
  type: BuildingType,
  preferOre = false
): SimulationAction | null {
  if (type !== 'solar') {
    const cost = CONTRACT_RULES.buildings[type].cost;
    const specs = CONTRACT_RULES.buildings;
    const operational = state.buildings.filter((b) => b.condition === 'operational');
    const powerProd = operational.reduce((sum, b) => sum + specs[b.type].powerProduction, 0);
    const powerDraw =
      operational.reduce((sum, b) => sum + specs[b.type].powerDraw, 0) + specs[type].powerDraw;
    const solarQueued = state.buildings.some((b) => b.type === 'solar' && b.condition === 'constructing');
    const firstFarm = type === 'farm' && countType(state, 'farm') === 0;
    const urgentScrubber = type === 'scrubber' && state.oxygen < 30 && canAfford(state, type);
    if (!firstFarm && !urgentScrubber && powerProd <= powerDraw && !solarQueued && state.power - cost.power < specs.solar.cost.power) {
      const solar = tryPlace(state, 'solar');
      if (solar) return solar;
    }
    if (!canAfford(state, type)) {
      const solar = tryPlace(state, 'solar');
      if (solar) return solar;
    }
  }
  return tryPlace(state, type, preferOre);
}

/**
 * Pure next-action chooser for unattended play. Callers must dispatch the result
 * through the store — this function never mutates colony state.
 */
export function nextAutopilotAction(state: ColonyState): SimulationAction | null {
  if (state.status !== 'active' || state.colonists.length === 0) return null;

  const specs = CONTRACT_RULES.buildings;
  const operational = state.buildings.filter((b) => b.condition === 'operational');
  const powerProd = operational.reduce((sum, b) => sum + specs[b.type].powerProduction, 0);
  const powerDraw = operational.reduce((sum, b) => sum + specs[b.type].powerDraw, 0);
  const o2Need = state.colonists.length * CONTRACT_RULES.colonists.oxygenConsumptionPerTick;
  const foodNeed = state.colonists.length * CONTRACT_RULES.colonists.foodConsumptionPerTick;

  const idleRover = state.rovers.find((r) => r.state === 'idle_at_base');
  const hasBattery = state.batteryCells.length > 0;
  const hasRefinery = operational.some((b) => b.type === 'refinery');

  if (state.pendingArrivals.length > 0 && idleRover) {
    if (!hasBattery && hasRefinery && state.ore >= CONTRACT_RULES.refinery.oreCostPerCell) {
      return { type: 'REFINE_CELL' };
    }
    if (hasBattery) {
      return {
        type: 'DISPATCH_ROVER',
        roverId: idleRover.id,
        destinationType: 'landing_zone',
      };
    }
  }

  const buried = state.buildings.find((b) => b.condition === 'buried');
  if (buried) return { type: 'ASSIGN_COLONIST_MAINTENANCE', buildingId: buried.id };

  const broken = state.buildings.find((b) => {
    if (b.condition !== 'broken') return false;
    return state.electronics >= specs[b.type].repairElectronics;
  });
  if (broken) return { type: 'ASSIGN_COLONIST_MAINTENANCE', buildingId: broken.id };

  const queuedO2 = state.buildings
    .filter((b) => b.type === 'scrubber' && (b.condition === 'operational' || b.condition === 'constructing'))
    .reduce((sum, b) => sum + specs[b.type].oxygenProduction, 0);
  const queuedFood = state.buildings
    .filter((b) => b.type === 'farm' && (b.condition === 'operational' || b.condition === 'constructing'))
    .reduce((sum, b) => sum + specs[b.type].foodProduction, 0);

  // Opening move: get one farm in the ground immediately.
  if (countType(state, 'farm') === 0) {
    const farm = tryPlace(state, 'farm');
    if (farm) return farm;
  }

  // A non-positive power balance must be fixed before more consumers.
  if (powerProd <= powerDraw) {
    const solar = tryPlace(state, 'solar');
    if (solar) return solar;
  }

  if (queuedFood < foodNeed) {
    const farm = tryPlace(state, 'farm');
    if (farm) return farm;
    if (powerProd > powerDraw && state.power < CONTRACT_RULES.buildings.farm.cost.power + 1) {
      return null;
    }
  }

  if (queuedO2 < o2Need || (state.oxygen < 25 && queuedO2 <= o2Need)) {
    const scrubber = tryPlace(state, 'scrubber');
    if (scrubber) return scrubber;
  }

  if (powerProd <= powerDraw + 4 || state.power < 20) {
    const solar = tryPlace(state, 'solar');
    if (solar) return solar;
  }

  if (!hasBuilding(state, 'garage')) {
    const garage = trySupportPlace(state, 'garage');
    if (garage) return garage;
  }

  if (hasBuilding(state, 'garage') && !hasBuilding(state, 'refinery')) {
    const refinery = trySupportPlace(state, 'refinery');
    if (refinery) return refinery;
  }

  const habitatCapacity =
    countType(state, 'habitat') * CONTRACT_RULES.buildings.habitat.capacity;
  if (state.colonists.length + state.pendingArrivals.length >= habitatCapacity) {
    const habitat = trySupportPlace(state, 'habitat');
    if (habitat) return habitat;
  }

  if (state.ore < 20 || countType(state, 'extractor') < 2) {
    const extractor = trySupportPlace(state, 'extractor', true);
    if (extractor) return extractor;
  }

  if (idleRover && hasBattery && state.pendingArrivals.length === 0) {
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

  if (hasRefinery && state.batteryCells.length < 2 && state.ore >= CONTRACT_RULES.refinery.oreCostPerCell) {
    return { type: 'REFINE_CELL' };
  }

  return null;
}
