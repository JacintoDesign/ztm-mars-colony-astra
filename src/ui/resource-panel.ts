import { ColonyState } from '../simulation/types';
import { CONTRACT_RULES } from '../simulation/contract-rules';

export interface ResourcePanelData {
  oxygen: number;
  maxOxygen?: number;
  power: number;
  food: number;
  ore: number;
  electronics: number;
  colonistHealthAvg: number;
  colonistCount: number;
  batteryCellsCount: number;
  roversCount: number;
  roversIdleCount: number;
  pendingArrivalsCountdown: number | null;
  tick: number;
  lastAppliedTick: string;
}

export class ResourcePanel {
  private container: HTMLElement;
  public static readonly CONTAINER_ID = 'resource-panel';

  constructor() {
    let el = document.getElementById(ResourcePanel.CONTAINER_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = ResourcePanel.CONTAINER_ID;
      el.className = 'resource-panel';
      document.body.appendChild(el);
    }
    this.container = el;
    this.render({
      oxygen: 50,
      maxOxygen: 100,
      power: 50,
      food: 50,
      ore: 0,
      electronics: 0,
      colonistHealthAvg: 100,
      colonistCount: 0,
      batteryCellsCount: 0,
      roversCount: 0,
      roversIdleCount: 0,
      pendingArrivalsCountdown: null,
      tick: 0,
      lastAppliedTick: 'Never',
    });
  }

  public updateFromState(state: ColonyState): void {
    const totalColonists = state.colonists.length;
    const avgHealth =
      totalColonists > 0
        ? Math.round(state.colonists.reduce((acc, c) => acc + c.health, 0) / totalColonists)
        : 0;

    const idleRovers = state.rovers.filter((r) => r.state === 'idle_at_base').length;
    const arrivalCountdown =
      state.pendingArrivals.length > 0 ? state.pendingArrivals[0].ticksRemaining : null;

    const operationalScrubbers = state.buildings.filter(
      (b) => b.type === 'scrubber' && b.condition === 'operational'
    ).length;
    const maxOxygen = (CONTRACT_RULES.pools.oxygenBaseMax ?? 100) + operationalScrubbers * (CONTRACT_RULES.pools.oxygenPerScrubber ?? 5);

    this.render({
      oxygen: state.oxygen,
      maxOxygen,
      power: state.power,
      food: state.food,
      ore: state.ore,
      electronics: state.electronics,
      colonistHealthAvg: avgHealth,
      colonistCount: totalColonists,
      batteryCellsCount: state.batteryCells.length,
      roversCount: state.rovers.length,
      roversIdleCount: idleRovers,
      pendingArrivalsCountdown: arrivalCountdown,
      tick: state.tick,
      lastAppliedTick: state.lastAppliedTick || 'Never',
    });
  }

  private getResourceLevel(value: number): 'nominal' | 'warning' | 'critical' {
    if (value <= 0) return 'critical';
    if (value <= 25) return 'warning';
    return 'nominal';
  }

  private render(data: ResourcePanelData): void {
    const maxO2 = data.maxOxygen ?? 100;
    const o2Pct = Math.max(0, Math.min(100, Math.round((data.oxygen / maxO2) * 100)));
    const pwrVal = Math.max(0, Math.min(100, Math.round(data.power)));
    const foodVal = Math.max(0, Math.min(100, Math.round(data.food)));
    const hpVal = Math.max(0, Math.min(100, Math.round(data.colonistHealthAvg)));

    const o2Level = this.getResourceLevel(o2Pct);
    const pwrLevel = this.getResourceLevel(pwrVal);
    const foodLevel = this.getResourceLevel(foodVal);
    const hpLevel = this.getResourceLevel(hpVal);

    const arrivalWarning =
      data.pendingArrivalsCountdown !== null && data.pendingArrivalsCountdown <= 30;

    this.container.innerHTML = `
      <div class="resource-panel-header">
        <span class="resource-header-title">// LIFE SUPPORT TELEMETRY</span>
        <span class="resource-header-telemetry">
          TICK: <strong id="resource-val-tick" class="resource-tick-num">${data.tick}</strong>
          <span class="resource-tick-time">(${data.lastAppliedTick})</span>
        </span>
      </div>
      
      <div class="resource-row">
        <div class="resource-meta">
          <span class="resource-label">OXYGEN</span>
          <span class="resource-val resource-val-${o2Level}" id="resource-val-oxygen">${o2Pct}% (${Math.round(data.oxygen)}/${maxO2})</span>
        </div>
        <div class="resource-track">
          <div class="resource-bar resource-bar-${o2Level}" style="width: ${o2Pct}%;"></div>
        </div>
      </div>

      <div class="resource-row">
        <div class="resource-meta">
          <span class="resource-label">POWER</span>
          <span class="resource-val resource-val-${pwrLevel}" id="resource-val-power">${pwrVal}%</span>
        </div>
        <div class="resource-track">
          <div class="resource-bar resource-bar-${pwrLevel}" style="width: ${pwrVal}%;"></div>
        </div>
      </div>

      <div class="resource-row">
        <div class="resource-meta">
          <span class="resource-label">FOOD</span>
          <span class="resource-val resource-val-${foodLevel}" id="resource-val-food">${foodVal}%</span>
        </div>
        <div class="resource-track">
          <div class="resource-bar resource-bar-${foodLevel}" style="width: ${foodVal}%;"></div>
        </div>
      </div>

      <div class="resource-row">
        <div class="resource-meta">
          <span class="resource-label">COLONIST HEALTH</span>
          <span class="resource-val resource-val-${hpLevel}" id="resource-val-health">${hpVal}% (${data.colonistCount} POP)</span>
        </div>
        <div class="resource-track">
          <div class="resource-bar resource-bar-${hpLevel}" style="width: ${hpVal}%;"></div>
        </div>
      </div>

      <div class="telemetry-stockpiles">
        <div class="telemetry-item">
          <span class="telemetry-tag">ORE:</span> <span class="telemetry-num" id="telemetry-val-ore">${data.ore}</span>
        </div>
        <div class="telemetry-item">
          <span class="telemetry-tag">ELECTRONICS:</span> <span class="telemetry-num" id="telemetry-val-electronics">${data.electronics}</span>
        </div>
        <div class="telemetry-item">
          <span class="telemetry-tag">BATTERIES:</span> <span class="telemetry-num" id="telemetry-val-batteries">${data.batteryCellsCount}/20</span>
        </div>
        <div class="telemetry-item">
          <span class="telemetry-tag">ROVERS:</span> <span class="telemetry-num" id="telemetry-val-rovers">${data.roversIdleCount}/${data.roversCount} IDLE</span>
        </div>
        ${
          data.pendingArrivalsCountdown !== null
            ? `<div class="telemetry-item">
                <span class="telemetry-tag">ESCORT:</span> <span class="telemetry-num ${arrivalWarning ? 'telemetry-alert' : ''}">${data.pendingArrivalsCountdown}s</span>
               </div>`
            : ''
        }
      </div>
    `;
  }
}
