import { ColonyStore } from '../simulation/store';
import { ColonyState } from '../simulation/types';

export interface AdvisorPrompt {
  id: string;
  level: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  priority: number; // 1 = most urgent
}

export class MissionAdvisor {
  private container: HTMLElement;
  private store: ColonyStore;
  private dismissedIds = new Set<string>();
  private currentPrompt: AdvisorPrompt | null = null;
  public static readonly CONTAINER_ID = 'mission-advisor';

  constructor(store: ColonyStore) {
    this.store = store;

    let el = document.getElementById(MissionAdvisor.CONTAINER_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = MissionAdvisor.CONTAINER_ID;
      el.className = 'mission-advisor-container';
      document.body.appendChild(el);
    }
    this.container = el;

    this.store.subscribe((state) => {
      this.evaluateState(state);
    });

    this.evaluateState(this.store.getState());
  }

  public dismissCurrent(): void {
    if (this.currentPrompt) {
      this.dismissedIds.add(this.currentPrompt.id);
      this.currentPrompt = null;
      this.evaluateState(this.store.getState());
    }
  }

  public resetDismissals(): void {
    this.dismissedIds.clear();
    this.evaluateState(this.store.getState());
  }

  private evaluateState(state: ColonyState): void {
    if (state.status !== 'active') {
      this.container.style.display = 'none';
      return;
    }

    const prompts = this.generatePrompts(state);
    const activePrompts = prompts.filter((p) => !this.dismissedIds.has(p.id));

    if (activePrompts.length === 0) {
      this.currentPrompt = null;
      this.container.style.display = 'none';
      this.container.innerHTML = '';
      return;
    }

    // Pick the highest priority prompt (lowest priority number)
    activePrompts.sort((a, b) => a.priority - b.priority);
    const topPrompt = activePrompts[0];

    if (!this.currentPrompt || this.currentPrompt.id !== topPrompt.id) {
      this.currentPrompt = topPrompt;
      this.render();
    }
  }

  private generatePrompts(state: ColonyState): AdvisorPrompt[] {
    const list: AdvisorPrompt[] = [];

    // Calculate rates
    const livingColonists = state.colonists.length;
    const oxygenDemand = livingColonists * 3;
    const foodDemand = livingColonists * 3;

    let powerGen = 0;
    let powerDraw = 0;
    let oxygenGen = 0;
    let foodGen = 0;

    for (const b of state.buildings) {
      if (b.condition !== 'operational') continue;
      if (b.type === 'solar') powerGen += 5;
      if (b.type === 'scrubber') { powerDraw += 3; oxygenGen += 5; }
      if (b.type === 'farm') { powerDraw += 2; foodGen += 5; }
      if (b.type === 'extractor') powerDraw += 4;
      if (b.type === 'habitat') powerDraw += 2;
      if (b.type === 'garage') powerDraw += 1;
      if (b.type === 'refinery') powerDraw += 5;
    }

    const netPower = powerGen - powerDraw;
    const hasBroken = state.buildings.some((b) => b.condition === 'broken');
    const hasBuried = state.buildings.some((b) => b.condition === 'buried');
    const hasGarage = state.buildings.some((b) => b.type === 'garage' && b.condition === 'operational');
    const hasRefinery = state.buildings.some((b) => b.type === 'refinery' && b.condition === 'operational');
    const hasExtractor = state.buildings.some((b) => b.type === 'extractor');
    const hasArrival = state.pendingArrivals.length > 0;
    const lowestHealth = state.colonists.length > 0
      ? Math.min(...state.colonists.map((c) => c.health))
      : 100;

    // Priority 1: Imminent Life Support Threats
    if (state.power === 0 && netPower < 0) {
      list.push({
        id: 'crit-power-zero',
        level: 'critical',
        title: '⚡ POWER GRID COLLAPSE (0 PWR)',
        message: `Grid offline (-${powerDraw} PWR draw vs +${powerGen} PWR gen). Build Solar Arrays immediately or click structures to turn off non-essential power!`,
        priority: 1,
      });
    }

    if (state.oxygen === 0 && oxygenGen < oxygenDemand) {
      list.push({
        id: 'crit-oxygen-zero',
        level: 'critical',
        title: '💨 OXYGEN DEFICIT (0 O2)',
        message: `Colonists suffocating (-${oxygenDemand} O2 vs +${oxygenGen} O2). Build an Oxygen Scrubber immediately!`,
        priority: 1,
      });
    }

    if (state.food === 0 && foodGen < foodDemand) {
      list.push({
        id: 'crit-food-zero',
        level: 'critical',
        title: '🍞 STARVATION THREAT (0 FOOD)',
        message: `Food ration exhausted (-${foodDemand} Food vs +${foodGen} Food). Build a Hydroponic Farm immediately!`,
        priority: 1,
      });
    }

    if (lowestHealth < 70) {
      list.push({
        id: 'crit-colonist-hp',
        level: 'critical',
        title: `🏥 COLONIST INJURY ALERT (${lowestHealth}% HP)`,
        message: `Colonists suffering life-support damage! Check Oxygen, Power, and Food stockpiles to stabilize life support.`,
        priority: 2,
      });
    }

    // Priority 2: Transport Ship Escorts
    if (hasArrival) {
      if (!hasGarage) {
        list.push({
          id: 'warn-arrival-no-garage',
          level: 'warning',
          title: '🚀 TRANSPORT SHIP AT LANDING PAD (0,0)',
          message: `Arrival holding 1 Colonist & 2 Electronics! Build a Rover Garage (30 PWR, 10 Ore) to dispatch an escort.`,
          priority: 2,
        });
      } else {
        list.push({
          id: 'warn-arrival-dispatch',
          level: 'warning',
          title: '🚀 RESCUE ARRIVAL AT LANDING PAD (0,0)',
          message: `Click the Landing Pad (0,0) or your Garage to dispatch a Rover Escort before the 150-tick window expires!`,
          priority: 2,
        });
      }
    }

    // Priority 3: Maintenance
    if (hasBroken || hasBuried) {
      const brokenCount = state.buildings.filter((b) => b.condition === 'broken').length;
      const buriedCount = state.buildings.filter((b) => b.condition === 'buried').length;
      list.push({
        id: 'warn-maintenance',
        level: 'warning',
        title: `🔧 FACILITY MAINTENANCE REQUIRED (${brokenCount + buriedCount} Structures)`,
        message: `Structures damaged! Click on any broken/buried building to inspect and dispatch a repair/excavation crew.`,
        priority: 3,
      });
    }

    // Priority 4: Resource Warnings
    if (state.power < 20 && netPower < 0) {
      list.push({
        id: 'warn-power-draining',
        level: 'warning',
        title: `⚡ LOW POWER WARNING (${state.power} PWR)`,
        message: `Power draining (-${Math.abs(netPower)} PWR/tick). Construct a Solar Array (+5 PWR) to avoid grid shutdown.`,
        priority: 4,
      });
    }

    if (state.food < 25 && foodGen < foodDemand) {
      list.push({
        id: 'warn-food-draining',
        level: 'warning',
        title: `🍞 FOOD RATIONS DEPLETING (${state.food} Food)`,
        message: `Food reserves dropping (-${foodDemand - foodGen}/tick). Build a Hydroponic Farm (+5 Food) to secure supplies.`,
        priority: 4,
      });
    }

    // Priority 5: Expansion & Progression Guidance
    if (!hasExtractor && state.ore < 20) {
      list.push({
        id: 'info-build-extractor',
        level: 'info',
        title: '⛏ HARVEST ORE DEPOSITS',
        message: `Ore is low. Select the Extractor tool to reveal highlighted ore deposit tiles across the Martian surface.`,
        priority: 5,
      });
    } else if (!hasGarage && state.tick >= 100) {
      list.push({
        id: 'info-build-garage',
        level: 'info',
        title: '🚗 BUILD ROVER GARAGE',
        message: `Construct a Rover Garage (30 PWR, 10 Ore) to prepare for supply ship arrivals and long-range mining expeditions.`,
        priority: 6,
      });
    } else if (hasGarage && !hasRefinery && state.ore >= 25) {
      list.push({
        id: 'info-build-refinery',
        level: 'info',
        title: '🔋 BUILD ORE REFINERY',
        message: `Construct an Ore Refinery (25 PWR, 15 Ore) to convert raw ore into high-capacity Battery Cells for rovers.`,
        priority: 7,
      });
    }

    return list;
  }

  private render(): void {
    if (!this.currentPrompt) {
      this.container.style.display = 'none';
      return;
    }

    this.container.style.display = 'flex';
    const p = this.currentPrompt;
    const levelClass = `advisor-${p.level}`;

    this.container.innerHTML = `
      <div class="mission-advisor-card ${levelClass}">
        <div class="advisor-indicator"></div>
        <div class="advisor-body">
          <div class="advisor-title">${p.title}</div>
          <div class="advisor-message">${p.message}</div>
        </div>
        <button type="button" class="advisor-dismiss-btn" id="advisor-dismiss-btn" title="Dismiss Prompt">✕</button>
      </div>
    `;

    const dismissBtn = this.container.querySelector<HTMLButtonElement>('#advisor-dismiss-btn');
    dismissBtn?.addEventListener('click', () => {
      this.dismissCurrent();
    });
  }
}
