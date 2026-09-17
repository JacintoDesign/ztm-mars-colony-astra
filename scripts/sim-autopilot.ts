import { ColonyStore } from '../src/simulation/store';
import { nextAutopilotAction } from '../src/simulation/autopilot';
import { CONTRACT_RULES } from '../src/simulation/contract-rules';

const TARGET_TICKS = 2000;

function runSeed(seed: number, logActions = false): void {
  const store = new ColonyStore({ seed, electronics: CONTRACT_RULES.starting.electronics ?? 2 });
  let lastAutopilotTick = -3;
  let minO2 = 999;
  let minPwr = 999;
  let minFood = 999;
  let minHp = 999;
  const events: string[] = [];

  for (let i = 0; i < TARGET_TICKS; i++) {
    const state = store.getState();
    if (state.status !== 'active') break;

    minO2 = Math.min(minO2, state.oxygen);
    minPwr = Math.min(minPwr, state.power);
    minFood = Math.min(minFood, state.food);
    if (state.colonists.length) {
      minHp = Math.min(minHp, Math.min(...state.colonists.map((c) => c.health)));
    }

    const urgent = state.food < 20 || state.oxygen < 20 || state.power < 15;
    if (urgent || state.tick - lastAutopilotTick >= 3) {
      const action = nextAutopilotAction(state);
      if (action) {
        lastAutopilotTick = state.tick;
        const result = store.dispatch(action);
        if (logActions && events.length < 20) {
          events.push(
            `t=${state.tick} ${action.type}${
              action.type === 'PLACE_BUILDING' ? ` ${action.buildingType}` : ''
            } pwr=${state.power} food=${state.food} o2=${state.oxygen} ${result.success ? 'ok' : result.reason}`
          );
        }
      }
    }
    if (logActions && (state.tick === 30 || state.tick === 40 || state.tick === 60 || state.tick === 80)) {
      const constructing = state.buildings
        .filter((b) => b.condition === 'constructing')
        .map((b) => `${b.type}@${b.x},${b.y} p=${b.repairProgress}`)
        .join('; ');
      const workers = state.colonists
        .map(
          (c) =>
            `${c.x},${c.y} ${c.destinationType}->${c.destination ? `${c.destination.x},${c.destination.y}` : ''} r=${c.route.length}`
        )
        .join(' | ');
      events.push(`t=${state.tick} sites[${constructing}] workers[${workers}]`);
    }
    store.advanceTicks(1);
  }

  const s = store.getState();
  const types = s.buildings.map((b) => `${b.type}:${b.condition[0]}`).join(',');
  console.log(
    `seed=${seed} tick=${s.tick} ${s.status} minO2=${minO2} minPWR=${minPwr} minFOOD=${minFood} minHP=${minHp} ` +
      `now O2=${s.oxygen} PWR=${s.power} FOOD=${s.food} ORE=${s.ore} pop=${s.colonists.length} ` +
      `arrivals=${s.pendingArrivals.length} rovers=${s.rovers.length} cells=${s.batteryCells.length} | ${types}`
  );
  if (logActions) for (const e of events) console.log(' ', e);
}

runSeed(133742, true);
for (const seed of [1, 42, 99, 2026, 7, 77, 1234]) runSeed(seed);
