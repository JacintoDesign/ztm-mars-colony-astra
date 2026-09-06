import {
  ColonyState,
  Colonist,
  Building,
  Rover,
  OreDeposit,
  PendingArrival,
  BatteryCell,
  Asteroid,
} from './types';
import { CONTRACT_RULES } from './contract-rules';
import { SeededPRNG } from './prng';
import {
  findNearestAvailableHabitat,
  findShortestRoute,
  getFreeAdjacentTiles,
} from './pathfinding';

/**
 * Pure function to apply a single simulation tick.
 * Strictly adheres to CONTRACT.md Tier 3 specifications, seeded determinism,
 * order of operations, and constraints.
 */
export function applySingleTick(state: ColonyState): ColonyState {
  // If colony is already game_over, no further ticks are applied
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

  // 3. Active Asteroid lifecycle (~5,000 ticks roll, 200 ticks expiry)
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

  // 4. Colonist Arrivals & Pending Arrivals Queue
  // Ship lands every 300 ticks if population < total habitat capacity
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

  // 5. Battery Cells Decay (-1 efficiency/tick while stored in refinery)
  const updatedBatteryCells: BatteryCell[] = state.batteryCells.map((c) => ({
    ...c,
    efficiency: Math.max(0, c.efficiency - refSpecs.cellDecayPerTick),
  }));

  // 6. Blocked tiles map for obstacle avoidance
  const blockedTiles = new Set<string>();
  for (const b of updatedBuildings) {
    blockedTiles.add(`${b.x},${b.y}`);
  }

  // 7. Rover Simulation Loop (1 tile/tick, power drain, landing zone pickup, mining cargo)
  let currentOre = state.ore;
  let currentElectronics = state.electronics;
  const newlyArrivedColonists: Colonist[] = [];

  let updatedRovers: Rover[] = state.rovers.map((r) => {
    let rover = { ...r };

    // Idle at base: recharges 5 power/tick
    if (rover.state === 'idle_at_base') {
      rover.power = Math.min(rSpecs.powerMax, rover.power + rSpecs.rechargeRatePerTick);
      return rover;
    }

    // Traveling or On-site: drains 2 power/tick
    rover.power = Math.max(0, rover.power - rSpecs.powerDrainPerTick);

    // If power hits 0, rover becomes stranded
    if (rover.power === 0) {
      rover.state = 'stranded';
      rover.cargo = null;
      rover.destination = null;
      rover.route = [];
      return rover;
    }

    // Moving along route (1 tile/tick per CONTRACT.md)
    if (rover.state === 'traveling_out' || rover.state === 'traveling_back') {
      const stepsToTake = Math.min(rSpecs.speedTilesPerTick, rover.route.length);
      for (let s = 0; s < stepsToTake; s++) {
        if (rover.route.length > 0) {
          const nextStep = rover.route.shift()!;
          rover.x = nextStep.x;
          rover.y = nextStep.y;
        }
      }

      // Check if finished traveling out
      if (rover.state === 'traveling_out' && rover.destination && rover.x === rover.destination.x && rover.y === rover.destination.y) {
        rover.state = 'on_site';
        rover.onSiteTicksRemaining = rover.destination.onSiteTicksTotal;
      }

      // Check if finished traveling back to garage
      if (rover.state === 'traveling_back' && rover.x === rover.garageX && rover.y === rover.garageY) {
        // Deliver cargo
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

    // On-site loading / mining
    if (rover.state === 'on_site' && rover.destination) {
      rover.onSiteTicksRemaining -= 1;
      if (rover.onSiteTicksRemaining <= 0) {
        // Collect cargo on departure
        if (rover.destination.type === 'landing_zone') {
          // Take the oldest pending arrival
          if (updatedPendingArrivals.length > 0) {
            const pickedArrival = updatedPendingArrivals.shift()!;
            rover.cargo = {
              type: 'arrival',
              arrivalId: pickedArrival.id,
              electronics: pickedArrival.electronics,
            };
            rover.occupants = 2; // Driver + rescued colonist
          }
        } else if (rover.destination.type === 'mining_site') {
          // Mine from mining site
          const site = state.miningSites.find((s) => s.x === rover.destination!.x && s.y === rover.destination!.y);
          if (site && site.remaining > 0) {
            const mined = Math.min(site.yield * 10, site.remaining);
            site.remaining -= mined;
            rover.cargo = { type: 'ore', amount: mined };
          }
          rover.occupants = 1; // Single driver/operator
        } else if (rover.destination.type === 'asteroid' && currentAsteroid) {
          const mined = currentAsteroid.yield;
          currentAsteroid = null;
          rover.cargo = { type: 'ore', amount: mined };
          rover.occupants = 1; // Single driver/operator
        }

        // Plan return path to garage
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

  // 8. Pending Arrivals 150-tick Escort Window countdown
  // Decrease time for arrivals not currently being loaded by a rover
  const roversLoadingArrival = updatedRovers.some(
    (r) => r.state === 'on_site' && r.destination?.type === 'landing_zone'
  );
  if (!roversLoadingArrival) {
    updatedPendingArrivals = updatedPendingArrivals
      .map((arr) => ({ ...arr, ticksRemaining: arr.ticksRemaining - 1 }))
      .filter((arr) => arr.ticksRemaining > 0); // Discard unescorted arrivals after 150 ticks
  }

  // 9. Colonist Labor, Navigation, Digging Out, Repairs, and Recoveries
  let currentColonists: Colonist[] = [...state.colonists, ...newlyArrivedColonists];
  const updatedOreDeposits: OreDeposit[] = state.oreDeposits.map((d) => ({ ...d }));

  // Find maintenance targets
  const buriedBuildings = updatedBuildings.filter((b) => b.condition === 'buried');
  const brokenBuildings = updatedBuildings.filter((b) => b.condition === 'broken');
  const strandedRovers = updatedRovers.filter((r) => r.state === 'stranded');

  currentColonists = currentColonists.map((c) => {
    let colonist = { ...c };

    // Aging: increment age
    colonist.age += 1;

    // Check if colonist needs an automated assignment
    const isEngagedInMaintenance =
      (colonist.destinationType === 'dig' || colonist.destinationType === 'repair' || colonist.destinationType === 'rover_recovery') &&
      colonist.targetEntityId !== null;

    if (!isEngagedInMaintenance) {
      // 1. Digging out buried buildings (find nearest)
      if (buriedBuildings.length > 0) {
        const sortedBuried = [...buriedBuildings].sort(
          (a, b) => Math.hypot(a.x - colonist.x, a.y - colonist.y) - Math.hypot(b.x - colonist.x, b.y - colonist.y)
        );
        const target = sortedBuried[0];
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
      }
      // 2. Repairing broken buildings (find nearest affordable)
      else if (brokenBuildings.length > 0) {
        const affordableBroken = brokenBuildings.filter(
          (b) => currentElectronics >= bSpecs[b.type].repairElectronics
        );
        if (affordableBroken.length > 0) {
          const sortedBroken = [...affordableBroken].sort(
            (a, b) => Math.hypot(a.x - colonist.x, a.y - colonist.y) - Math.hypot(b.x - colonist.x, b.y - colonist.y)
          );
          const target = sortedBroken[0];
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
      }
      // 3. Recovering stranded rovers (find nearest)
      else if (strandedRovers.length > 0) {
        const sortedStranded = [...strandedRovers].sort(
          (a, b) => Math.hypot(a.x - colonist.x, a.y - colonist.y) - Math.hypot(b.x - colonist.x, b.y - colonist.y)
        );
        const target = sortedStranded[0];
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
      }
      // 4. Habitat home assignment
      else if (colonist.destinationType !== 'habitat' || !colonist.destination) {
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

    // Advance 1 step along route every 5 ticks (0.2 tiles/tick)
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

    // Helper for labor reach (colonist is adjacent or directly on destination tile)
    const isAdjacentOrOnSite = (cx: number, cy: number, tx: number, ty: number) => {
      return Math.abs(cx - tx) + Math.abs(cy - ty) <= 1;
    };

    // Colonist labor on site
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

  // 10. Production & Consumption (Only OPERATIONAL buildings produce / consume; Spacing rules apply)
  // Industrial & life support structures (Scrubbers, Extractors, Farms) require living colonist workforce
  const hasWorkforce = currentColonists.length > 0;
  let powerProduced = 0;
  let powerDrawn = 0;
  let oxygenProduced = 0;
  let foodProduced = 0;

  for (const b of updatedBuildings) {
    if (b.condition !== 'operational') continue;

    // Check adjacent orthogonal buildings for spacing / overcrowding penalty
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

    if (hasWorkforce) {
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
  }

  // Living colonists consume 3 Oxygen and 2 Food per tick
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

  // 12. Colonist Mortality (Health == 0 OR Age >= Lifespan)
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

/**
 * Applies N ticks in one pure batch.
 */
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
