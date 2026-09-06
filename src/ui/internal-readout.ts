import { ColonyState } from '../simulation/types';

export class InternalReadout {
  private container: HTMLElement | null = null;
  public static readonly CONTAINER_ID = 'internal-readout';

  constructor() {
    // Only render if URL includes ?debug=true per DESIGN.md
    const urlParams = new URLSearchParams(window.location.search);
    const isDebug = urlParams.get('debug') === 'true';

    if (!isDebug) {
      const existing = document.getElementById(InternalReadout.CONTAINER_ID);
      if (existing) {
        existing.remove();
      }
      return;
    }

    this.container = document.getElementById(InternalReadout.CONTAINER_ID);
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = InternalReadout.CONTAINER_ID;
      this.container.className = 'internal-readout';
      document.body.appendChild(this.container);
    }
  }

  public update(state: ColonyState): void {
    if (!this.container) return;

    const signedIn = state.signedInAccount ?? 'none';
    const owner = state.colonyOwner ?? 'none';
    const lastTick = state.lastAppliedTick ?? 'Never';
    const colonists = state.colonists ?? [];

    let colonistStr = 'none';
    if (colonists.length > 0) {
      const avgHealth = Math.round(
        colonists.reduce((acc, c) => acc + c.health, 0) / colonists.length
      );
      const avgAge = Math.round(
        colonists.reduce((acc, c) => acc + c.age, 0) / colonists.length
      );
      colonistStr = `${avgHealth}% health, avg age ${avgAge} ticks (pop: ${colonists.length})`;
    }

    const pendingCount = state.pendingArrivals?.length ?? 0;
    const pendingCountdown =
      pendingCount > 0 ? `${state.pendingArrivals[0].ticksRemaining} ticks remaining` : 'none';

    const rovers = state.rovers ?? [];
    const roversStr =
      rovers.length > 0
        ? `${rovers.length} total (${rovers.filter((r) => r.state === 'idle_at_base').length} idle)`
        : 'none';

    const batteryStr = `${state.batteryCells?.length ?? 0}/20 cells stored`;

    let buildingsHtml: string;
    if (!state.buildings || state.buildings.length === 0) {
      buildingsHtml = '<div class="readout-buildings-title">buildings: none</div>';
    } else {
      const rows = state.buildings
        .map((b) => `<div class="readout-building-item"> - ${b.type} (${b.x}, ${b.y}) [${b.condition}]</div>`)
        .join('');
      buildingsHtml = `<div class="readout-buildings-title">buildings:</div><div class="readout-buildings-list">${rows}</div>`;
    }

    this.container.innerHTML = `
      <div class="readout-session-block">
        <div>signed-in account: ${signedIn}</div>
        <div>colony owner: ${owner}</div>
      </div>
      <div class="readout-divider"></div>
      <div class="readout-state-block">
        <div>tick: ${state.tick}</div>
        <div>oxygen: ${state.oxygen}</div>
        <div>power: ${state.power}</div>
        <div>food: ${state.food}</div>
        <div>ore: ${state.ore}</div>
        <div>electronics: ${state.electronics}</div>
        <div>colonists: ${colonistStr}</div>
        <div>pending arrivals: ${pendingCountdown}</div>
        <div>rovers: ${roversStr}</div>
        <div>battery cells: ${batteryStr}</div>
        ${buildingsHtml}
        <div>last applied tick: ${lastTick}</div>
      </div>
    `;
  }
}
