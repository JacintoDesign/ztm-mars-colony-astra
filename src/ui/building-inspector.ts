import { BuildingType } from '../simulation/types';
import { ColonyStore } from '../simulation/store';
import { CONTRACT_RULES } from '../simulation/contract-rules';

export interface BuildingInspectorOptions {
  containerId?: string;
  store: ColonyStore;
  onTogglePower: (buildingId: string) => void;
  onRelocate: (buildingId: string) => void;
  onDispatchMaintenance?: (buildingId: string) => void;
  onRefineCell?: () => void;
  onDispatchEscort?: () => void;
  onDispatchMining?: () => void;
  onDemolish?: (buildingId: string) => void;
  onClose?: () => void;
}

export class BuildingInspector {
  private container: HTMLElement;
  private store: ColonyStore;
  private selectedBuildingId: string | null = null;
  private onTogglePower: (buildingId: string) => void;
  private onRelocate: (buildingId: string) => void;
  private onDispatchMaintenance?: (buildingId: string) => void;
  private onRefineCell?: () => void;
  private onDispatchEscort?: () => void;
  private onDispatchMining?: () => void;
  private onDemolish?: (buildingId: string) => void;
  private onClose?: () => void;

  public static readonly CONTAINER_ID = 'building-inspector';

  constructor(options: BuildingInspectorOptions) {
    this.store = options.store;
    this.onTogglePower = options.onTogglePower;
    this.onRelocate = options.onRelocate;
    this.onDispatchMaintenance = options.onDispatchMaintenance;
    this.onRefineCell = options.onRefineCell;
    this.onDispatchEscort = options.onDispatchEscort;
    this.onDispatchMining = options.onDispatchMining;
    this.onDemolish = options.onDemolish;
    this.onClose = options.onClose;

    const existing = document.getElementById(options.containerId ?? BuildingInspector.CONTAINER_ID);
    if (existing) {
      this.container = existing;
    } else {
      this.container = document.createElement('div');
      this.container.id = options.containerId ?? BuildingInspector.CONTAINER_ID;
      this.container.className = 'building-inspector-container';
      this.container.style.display = 'none';
      document.body.appendChild(this.container);
    }

    this.store.subscribe(() => {
      if (this.selectedBuildingId) {
        this.render();
      }
    });

    // Keyboard shortcuts: P or Space to toggle power, M to relocate, Escape to close
    window.addEventListener('keydown', (e) => {
      if (!this.selectedBuildingId || this.container.style.display === 'none') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'p' || e.key === 'P' || e.key === ' ') {
        e.preventDefault();
        this.handleToggle();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        this.handleRelocate();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.hide();
      }
    });
  }

  public showBuilding(buildingId: string): void {
    this.selectedBuildingId = buildingId;
    this.render();
    this.container.style.display = 'block';
  }

  public hide(): void {
    if (this.selectedBuildingId === null && this.container.style.display === 'none') {
      return;
    }
    this.selectedBuildingId = null;
    this.container.style.display = 'none';
    if (this.onClose) this.onClose();
  }

  public getSelectedBuildingId(): string | null {
    return this.selectedBuildingId;
  }

  private handleToggle(): void {
    if (!this.selectedBuildingId || this.selectedBuildingId === 'landing_pad') return;
    this.onTogglePower(this.selectedBuildingId);
    this.render();
  }

  private handleRelocate(): void {
    if (!this.selectedBuildingId || this.selectedBuildingId === 'landing_pad') return;
    this.onRelocate(this.selectedBuildingId);
  }

  private handleMaintenance(): void {
    if (!this.selectedBuildingId || this.selectedBuildingId === 'landing_pad') return;
    if (this.onDispatchMaintenance) {
      this.onDispatchMaintenance(this.selectedBuildingId);
    }
    this.render();
  }

  private getBuildingTitle(type: BuildingType): string {
    switch (type) {
      case 'habitat': return 'HABITAT MODULE';
      case 'solar': return 'SOLAR ARRAY';
      case 'scrubber': return 'OXYGEN SCRUBBER';
      case 'extractor': return 'ORE EXTRACTOR';
      case 'farm': return 'HYDROPONIC FARM';
      case 'garage': return 'ROVER GARAGE';
      case 'refinery': return 'ORE REFINERY';
      default: return 'STRUCTURE';
    }
  }

  private render(): void {
    if (!this.selectedBuildingId) {
      this.container.style.display = 'none';
      return;
    }

    const state = this.store.getState();

    // Special inspection for Landing Pad (0, 0)
    if (this.selectedBuildingId === 'landing_pad') {
      const hasArrival = state.pendingArrivals.length > 0;
      const arrival = hasArrival ? state.pendingArrivals[0] : null;

      this.container.innerHTML = `
        <div class="inspector-card">
          <div class="inspector-header">
            <div class="inspector-title-group">
              <span class="inspector-type-title">LANDING PAD</span>
              <span class="inspector-coords">[0, 0]</span>
            </div>
            <button type="button" class="inspector-close-btn" id="inspector-close" title="Close [Esc]">✕</button>
          </div>

          <div class="inspector-status-badge ${hasArrival ? 'inspector-status-deactivated' : 'inspector-status-operational'}">
            <span class="inspector-pulse-indicator"></span>
            <span>${hasArrival ? 'TRANSPORT ON-SITE' : 'PAD CLEAR (READY)'}</span>
          </div>

          <div class="inspector-body">
            <div class="inspector-stats-box">
              <div class="inspector-stat-row">
                <span>Supply Transport:</span>
                <span class="${hasArrival ? 'inspector-val-pos' : 'inspector-val-optimal'}">${hasArrival ? '1 Colonist + 2 Electronics' : 'Awaiting Next Landing'}</span>
              </div>
              ${
                hasArrival && arrival
                  ? `<div class="inspector-stat-row">
                      <span>Escort Window:</span>
                      <span class="${arrival.ticksRemaining < 40 ? 'inspector-val-neg' : 'inspector-val-optimal'}">${arrival.ticksRemaining} Ticks</span>
                    </div>`
                  : `<div class="inspector-stat-row">
                      <span>Landing Cycle:</span>
                      <span>Every 300 ticks</span>
                    </div>`
              }
            </div>

            <div class="inspector-actions">
              ${
                hasArrival
                  ? `<button type="button" class="inspector-btn inspector-btn-escort" id="inspector-dispatch-escort">
                      <span class="btn-icon">🚀</span> DISPATCH ROVER ESCORT
                     </button>`
                  : ''
              }
            </div>
          </div>
        </div>
      `;

      const closeBtn = this.container.querySelector<HTMLButtonElement>('#inspector-close');
      closeBtn?.addEventListener('click', () => this.hide());

      const escortBtn = this.container.querySelector<HTMLButtonElement>('#inspector-dispatch-escort');
      escortBtn?.addEventListener('click', () => {
        if (this.onDispatchEscort) this.onDispatchEscort();
      });
      return;
    }

    const building = state.buildings.find((b) => b.id === this.selectedBuildingId);
    if (!building) {
      this.hide();
      return;
    }

    const specs = CONTRACT_RULES.buildings[building.type];
    const powerDraw = specs.powerDraw ?? 0;
    const powerProd = specs.powerProduction ?? 0;
    const o2Prod = specs.oxygenProduction ?? 0;
    const foodProd = specs.foodProduction ?? 0;
    const oreProd = specs.oreProduction ?? 0;
    const reqElectronics = specs.repairElectronics ?? 1;

    // Spacing calculation
    const neighbors = state.buildings.filter(
      (o) => o.id !== building.id && Math.abs(building.x - o.x) + Math.abs(building.y - o.y) === 1
    ).length;
    const isCrowded = neighbors > 1;
    const crowdingPenalty = Math.max(0, neighbors - 1);

    let conditionBadgeClass = 'inspector-status-operational';
    let conditionText = 'OPERATIONAL';
    if (building.condition === 'deactivated') {
      conditionBadgeClass = 'inspector-status-deactivated';
      conditionText = 'POWER OFF (STANDBY)';
    } else if (building.condition === 'broken') {
      conditionBadgeClass = 'inspector-status-broken';
      conditionText = 'BROKEN (NEEDS REPAIR)';
    } else if (building.condition === 'buried') {
      conditionBadgeClass = 'inspector-status-buried';
      conditionText = 'BURIED (NEEDS EXCAVATION)';
    }

    let statsHtml = '';
    if (powerProd > 0) {
      const netProd = building.condition === 'operational' ? Math.max(0, powerProd - crowdingPenalty) : 0;
      statsHtml += `<div class="inspector-stat-row"><span>Power Generation:</span><span class="inspector-val-pos">+${netProd} PWR/tick</span></div>`;
    }
    if (powerDraw > 0) {
      const netDraw = building.condition === 'operational' ? powerDraw : 0;
      statsHtml += `<div class="inspector-stat-row"><span>Power Draw:</span><span class="${netDraw > 0 ? 'inspector-val-neg' : 'inspector-val-zero'}">${netDraw > 0 ? `-${netDraw}` : '0'} PWR/tick</span></div>`;
    }
    if (o2Prod > 0) {
      const netO2 = building.condition === 'operational' ? Math.max(0, o2Prod - crowdingPenalty) : 0;
      statsHtml += `<div class="inspector-stat-row"><span>Oxygen Output:</span><span class="inspector-val-pos">+${netO2} O2/tick</span></div>`;
    }
    if (foodProd > 0) {
      const netFood = building.condition === 'operational' ? Math.max(0, foodProd - crowdingPenalty) : 0;
      statsHtml += `<div class="inspector-stat-row"><span>Food Output:</span><span class="inspector-val-pos">+${netFood} Food/tick</span></div>`;
    }
    if (oreProd > 0) {
      const deposit = state.oreDeposits.find((d) => d.x === building.x && d.y === building.y);
      const remaining = deposit?.remaining ?? 0;
      statsHtml += `<div class="inspector-stat-row"><span>Tile Ore Remaining:</span><span class="inspector-val-ore">${remaining} Ore</span></div>`;
    }

    // Garage and Refinery specific info
    if (building.type === 'garage') {
      const roversInBay = state.rovers.filter((r) => r.state === 'idle_at_base').length;
      statsHtml += `<div class="inspector-stat-row"><span>Garage Bays:</span><span>${roversInBay}/2 Idle Rovers</span></div>`;
    }
    if (building.type === 'refinery') {
      statsHtml += `<div class="inspector-stat-row"><span>Stockpile Ore:</span><span>${state.ore} Ore (10 Ore / Cell)</span></div>`;
    }

    const isDeactivated = building.condition === 'deactivated';
    const isOperational = building.condition === 'operational';
    const isBroken = building.condition === 'broken';
    const isBuried = building.condition === 'buried';
    const canToggle = isOperational || isDeactivated;
    const hasEnoughElec = state.electronics >= reqElectronics;

    let maintenanceActionHtml = '';
    if (isBroken) {
      if (hasEnoughElec) {
        maintenanceActionHtml = `
          <button type="button" class="inspector-btn inspector-btn-repair" id="inspector-dispatch-maintenance">
            <span class="btn-icon">🔧</span> DISPATCH REPAIR (${reqElectronics} ELEC)
          </button>
        `;
      } else {
        maintenanceActionHtml = `
          <div class="inspector-alert-box">
            <span>⚠ REQUIRES ${reqElectronics} ELECTRONICS</span>
            <small>Stock: ${state.electronics} | Escort supply ships to acquire</small>
          </div>
        `;
      }
    } else if (isBuried) {
      maintenanceActionHtml = `
        <button type="button" class="inspector-btn inspector-btn-dig" id="inspector-dispatch-maintenance">
          <span class="btn-icon">⛏</span> DISPATCH EXCAVATION (40 TICKS)
        </button>
      `;
    }

    // Facility specific dispatch actions
    let facilityActionHtml = '';
    if (isOperational) {
      if (building.type === 'garage') {
        facilityActionHtml = `
          <button type="button" class="inspector-btn inspector-btn-escort" id="inspector-dispatch-escort" ${state.pendingArrivals.length === 0 ? 'disabled' : ''}>
            <span class="btn-icon">🚀</span> DISPATCH ROVER ESCORT (0,0)
          </button>
          <button type="button" class="inspector-btn inspector-btn-mining" id="inspector-dispatch-mining">
            <span class="btn-icon">⛏</span> DISPATCH MINING EXPEDITION
          </button>
        `;
      } else if (building.type === 'refinery') {
        facilityActionHtml = `
          <button type="button" class="inspector-btn inspector-btn-refine" id="inspector-refine-cell" ${state.ore < 10 || state.power < 5 ? 'disabled' : ''}>
            <span class="btn-icon">🔋</span> REFINE BATTERY CELL (10 ORE)
          </button>
        `;
      }
    }

    this.container.innerHTML = `
      <div class="inspector-card">
        <div class="inspector-header">
          <div class="inspector-title-group">
            <span class="inspector-type-title">${this.getBuildingTitle(building.type)}</span>
            <span class="inspector-coords">[${building.x}, ${building.y}]</span>
          </div>
          <button type="button" class="inspector-close-btn" id="inspector-close" title="Close [Esc]">✕</button>
        </div>

        <div class="inspector-status-badge ${conditionBadgeClass}">
          <span class="inspector-pulse-indicator"></span>
          <span>${conditionText}</span>
        </div>

        <div class="inspector-body">
          <div class="inspector-stats-box">
            ${statsHtml}
            <div class="inspector-stat-row inspector-spacing-row">
              <span>Neighbors:</span>
              <span class="${isCrowded ? 'inspector-val-crowded' : 'inspector-val-optimal'}">${neighbors} (${isCrowded ? `-${crowdingPenalty} Overcrowded` : 'Optimal 100%'})</span>
            </div>
          </div>

          <div class="inspector-actions">
            ${maintenanceActionHtml}
            ${facilityActionHtml}

            ${
              canToggle
                ? `<button type="button" class="inspector-btn ${isDeactivated ? 'inspector-btn-activate' : 'inspector-btn-deactivate'}" id="inspector-toggle-power">
                    <span class="btn-icon">⚡</span> ${isDeactivated ? 'RESTORE POWER (ON)' : 'TURN OFF POWER (0 PWR)'}
                    <span class="btn-shortcut">[P]</span>
                   </button>`
                : ''
            }

            <button type="button" class="inspector-btn inspector-btn-relocate" id="inspector-relocate" ${state.power < 10 || isBroken || isBuried ? 'disabled' : ''}>
              <span class="btn-icon">✥</span> RELOCATE (10 PWR)
              <span class="btn-shortcut">[M]</span>
            </button>

            <button type="button" class="inspector-btn inspector-btn-demolish" id="inspector-demolish" ${state.power < 10 ? 'disabled' : ''}>
              <span class="btn-icon">💥</span> DEMOLISH STRUCTURE (10 PWR)
            </button>
          </div>
        </div>
      </div>
    `;

    const closeBtn = this.container.querySelector<HTMLButtonElement>('#inspector-close');
    closeBtn?.addEventListener('click', () => this.hide());

    const toggleBtn = this.container.querySelector<HTMLButtonElement>('#inspector-toggle-power');
    toggleBtn?.addEventListener('click', () => this.handleToggle());

    const relocateBtn = this.container.querySelector<HTMLButtonElement>('#inspector-relocate');
    relocateBtn?.addEventListener('click', () => this.handleRelocate());

    const demolishBtn = this.container.querySelector<HTMLButtonElement>('#inspector-demolish');
    demolishBtn?.addEventListener('click', () => {
      if (this.selectedBuildingId && this.selectedBuildingId !== 'landing_pad') {
        const id = this.selectedBuildingId;
        this.hide();
        if (this.onDemolish) this.onDemolish(id);
      }
    });

    const maintenanceBtn = this.container.querySelector<HTMLButtonElement>('#inspector-dispatch-maintenance');
    maintenanceBtn?.addEventListener('click', () => this.handleMaintenance());

    const escortBtn = this.container.querySelector<HTMLButtonElement>('#inspector-dispatch-escort');
    escortBtn?.addEventListener('click', () => {
      if (this.onDispatchEscort) this.onDispatchEscort();
    });

    const miningBtn = this.container.querySelector<HTMLButtonElement>('#inspector-dispatch-mining');
    miningBtn?.addEventListener('click', () => {
      if (this.onDispatchMining) this.onDispatchMining();
    });

    const refineBtn = this.container.querySelector<HTMLButtonElement>('#inspector-refine-cell');
    refineBtn?.addEventListener('click', () => {
      if (this.onRefineCell) this.onRefineCell();
    });
  }
}

