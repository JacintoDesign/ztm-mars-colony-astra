export interface GameOverModalStats {
  oxygen?: number;
  power?: number;
  food?: number;
  ore?: number;
  electronics?: number;
  buildingsCount?: number;
  tick?: number;
}

export interface GameOverModalHandlers {
  onRestart: () => Promise<void>;
}

export class GameOverModal {
  private container: HTMLElement;
  private handlers: GameOverModalHandlers;

  constructor(handlers: GameOverModalHandlers) {
    this.handlers = handlers;
    this.container = document.createElement('div');
    this.container.id = 'game-over-screen';
    this.container.className = 'game-over-screen';
    this.container.style.display = 'none';
    document.body.appendChild(this.container);
  }

  public show(solsSurvived: number, bestSolsSurvived: number, reason?: string, stats?: GameOverModalStats): void {
    this.container.style.display = 'flex';
    this.render(solsSurvived, bestSolsSurvived, reason, stats);
  }

  public hide(): void {
    this.container.style.display = 'none';
    this.container.innerHTML = '';
  }

  private render(solsSurvived: number, bestSolsSurvived: number, reason?: string, stats?: GameOverModalStats): void {
    const defaultReason = 'CRITICAL LIFE SUPPORT COLLAPSE — Colony life support depleted to zero';
    const failureCause = reason || defaultReason;

    let statsDossierHtml = '';
    if (stats) {
      statsDossierHtml = `
        <div class="game-over-dossier-grid">
          <div class="dossier-item"><span>FINAL OXYGEN:</span><span class="${(stats.oxygen ?? 0) === 0 ? 'dossier-crit' : ''}">${stats.oxygen ?? 0}%</span></div>
          <div class="dossier-item"><span>FINAL POWER:</span><span class="${(stats.power ?? 0) === 0 ? 'dossier-crit' : ''}">${stats.power ?? 0}%</span></div>
          <div class="dossier-item"><span>FINAL FOOD:</span><span class="${(stats.food ?? 0) === 0 ? 'dossier-crit' : ''}">${stats.food ?? 0}%</span></div>
          <div class="dossier-item"><span>ORE STOCK:</span><span>${stats.ore ?? 0}</span></div>
          <div class="dossier-item"><span>ELECTRONICS:</span><span>${stats.electronics ?? 0}</span></div>
          <div class="dossier-item"><span>STRUCTURES:</span><span>${stats.buildingsCount ?? 0}</span></div>
        </div>
      `;
    }

    this.container.innerHTML = `
      <div class="game-over-panel">
        <div class="game-over-header">// MISSION TERMINATED — COLONY CASUALTY REPORT</div>
        <div class="game-over-sub">TELEMETRY BLACK BOX ARCHIVE RECORDED</div>

        <div class="game-over-reason-box">
          <div class="reason-label">PRIMARY FAILURE CAUSE:</div>
          <div class="reason-text">${failureCause}</div>
        </div>

        <div class="game-over-metrics">
          <div class="game-over-metric-row">
            <span class="game-over-metric-label">SOLS SURVIVED THIS RUN:</span>
            <span class="game-over-metric-val" id="sols-this-run">${solsSurvived} SOLS</span>
          </div>
          <div class="game-over-metric-row">
            <span class="game-over-metric-label">ACCOUNT PERSONAL BEST:</span>
            <span class="game-over-metric-val" id="best-sols-survived">${bestSolsSurvived} SOLS</span>
          </div>
        </div>

        ${statsDossierHtml}

        <button type="button" id="restart-colony-btn" class="game-over-restart-btn">
          START NEW COLONY
        </button>
      </div>
    `;

    const restartBtn = this.container.querySelector<HTMLButtonElement>('#restart-colony-btn');
    restartBtn?.addEventListener('click', async () => {
      if (restartBtn) restartBtn.disabled = true;
      await this.handlers.onRestart();
    });
  }
}
