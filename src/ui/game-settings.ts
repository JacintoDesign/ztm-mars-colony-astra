export type SimulationSpeed = 1 | 2 | 3;

export interface GameSettingsState {
  alwaysPassTime: boolean;
  autopilot: boolean;
  speed: SimulationSpeed;
}

export interface GameSettingsOptions {
  onOpenHelp: () => void;
  onOpen?: () => void;
  onClose?: () => void;
  onChange?: (state: GameSettingsState) => void;
}

const STORAGE_KEY = 'marscolony_game_settings';
const DEFAULTS: GameSettingsState = {
  alwaysPassTime: false,
  autopilot: false,
  speed: 1,
};

function loadSettings(): GameSettingsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<GameSettingsState>;
    const speed = parsed.speed === 2 || parsed.speed === 3 ? parsed.speed : 1;
    return {
      alwaysPassTime: parsed.alwaysPassTime === true,
      autopilot: parsed.autopilot === true,
      speed,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export class GameSettings {
  public static readonly BUTTON_ID = 'settings-btn';
  public static readonly SPEED_ID = 'speed-btn';
  public static readonly MODAL_ID = 'settings-modal';

  private state: GameSettingsState;
  private settingsBtn: HTMLButtonElement;
  private speedBtn: HTMLButtonElement;
  private overlay: HTMLElement;
  private isOpen = false;
  private controlsVisible = false;
  private onOpenHelp: () => void;
  private onOpen?: () => void;
  private onClose?: () => void;
  private onChange?: (state: GameSettingsState) => void;

  constructor(options: GameSettingsOptions) {
    this.state = loadSettings();
    this.onOpenHelp = options.onOpenHelp;
    this.onOpen = options.onOpen;
    this.onClose = options.onClose;
    this.onChange = options.onChange;

    this.settingsBtn = this.ensureButton(
      GameSettings.BUTTON_ID,
      'settings-btn',
      'Open colony settings [S]',
      this.renderCogSvg()
    );
    this.speedBtn = this.ensureButton(
      GameSettings.SPEED_ID,
      'speed-btn',
      'Cycle simulation speed [.]',
      ''
    );
    this.overlay = this.ensureOverlay();
    this.bindEvents();
    this.renderSpeedButton();
    this.renderModal();
    this.hideControls();
  }

  public getState(): GameSettingsState {
    return { ...this.state };
  }

  public isModalOpen(): boolean {
    return this.isOpen;
  }

  public open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.overlay.style.display = 'flex';
    this.settingsBtn.classList.add('active');
    this.renderModal();
    this.onOpen?.();
  }

  public close(options?: { silent?: boolean }): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.overlay.style.display = 'none';
    this.settingsBtn.classList.remove('active');
    if (!options?.silent) this.onClose?.();
  }

  public showControls(): void {
    this.controlsVisible = true;
    this.settingsBtn.style.display = 'flex';
    this.speedBtn.style.display = 'flex';
  }

  public hideControls(): void {
    this.controlsVisible = false;
    this.close({ silent: true });
    this.settingsBtn.style.display = 'none';
    this.speedBtn.style.display = 'none';
  }

  public toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  public cycleSpeed(): SimulationSpeed {
    const next: SimulationSpeed = this.state.speed === 1 ? 2 : this.state.speed === 2 ? 3 : 1;
    this.update({ speed: next });
    return next;
  }

  private update(partial: Partial<GameSettingsState>): void {
    this.state = { ...this.state, ...partial };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    this.renderSpeedButton();
    if (this.isOpen) this.renderModal();
    this.onChange?.(this.getState());
  }

  private ensureButton(
    id: string,
    className: string,
    ariaLabel: string,
    html: string
  ): HTMLButtonElement {
    let btn = document.getElementById(id) as HTMLButtonElement | null;
    if (!btn) {
      btn = document.createElement('button');
      btn.id = id;
      btn.type = 'button';
      document.body.appendChild(btn);
    }
    btn.className = className;
    btn.setAttribute('aria-label', ariaLabel);
    btn.title = ariaLabel;
    if (html) btn.innerHTML = html;
    return btn;
  }

  private ensureOverlay(): HTMLElement {
    let overlay = document.getElementById(GameSettings.MODAL_ID);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = GameSettings.MODAL_ID;
      overlay.className = 'settings-modal-overlay';
      overlay.style.display = 'none';
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  private renderCogSvg(): string {
    return `<svg class="settings-cog-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.59.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.83 14.16a.5.5 0 0 0-.12.64l1.92 3.32c.13.23.4.32.6.22l2.39-.96c.5.39 1.04.7 1.63.94l.36 2.54c.05.24.26.42.49.42h3.8c.24 0 .44-.18.49-.42l.36-2.54c.59-.24 1.13-.55 1.63-.94l2.39.96c.22.1.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/>
    </svg>`;
  }

  private renderSpeedButton(): void {
    this.speedBtn.textContent = `${this.state.speed}×`;
    this.speedBtn.setAttribute(
      'aria-label',
      `Simulation speed ${this.state.speed}×. Click or press period to cycle.`
    );
  }

  private renderModal(): void {
    const { alwaysPassTime, autopilot, speed } = this.state;
    this.overlay.innerHTML = `
      <div class="settings-modal-panel">
        <div class="settings-modal-header">
          <div>
            <div class="settings-modal-title">// OPERATOR SETTINGS</div>
            <div class="settings-modal-subtitle">LOCAL SESSION CONTROLS — NOT AUTHORITATIVE COLONY STATE</div>
          </div>
          <button type="button" class="help-modal-close-btn" id="settings-close-btn" aria-label="Close Settings">[X] DISMISS</button>
        </div>

        <div class="settings-modal-content">
          <div class="settings-row">
            <div class="settings-row-copy">
              <div class="settings-row-title">TIME PASSES WHILE AWAY</div>
              <div class="settings-row-hint">Off by default. When off, ticks freeze if this page is closed or hidden. When on, catch-up continues up to the 8-hour ceiling.</div>
            </div>
            <button type="button" class="settings-toggle ${alwaysPassTime ? 'is-on' : ''}" id="settings-toggle-time" aria-pressed="${alwaysPassTime}">
              ${alwaysPassTime ? 'ON' : 'OFF'}
            </button>
          </div>

          <div class="settings-row">
            <div class="settings-row-copy">
              <div class="settings-row-title">AUTOPILOT</div>
              <div class="settings-row-hint">Restored from this browser. When on, the colony places structures, escorts arrivals, and dispatches rovers on its own — including on a new colony.</div>
            </div>
            <button type="button" class="settings-toggle ${autopilot ? 'is-on' : ''}" id="settings-toggle-autopilot" aria-pressed="${autopilot}">
              ${autopilot ? 'ON' : 'OFF'}
            </button>
          </div>

          <div class="settings-row settings-row-speed">
            <div class="settings-row-copy">
              <div class="settings-row-title">SIMULATION SPEED</div>
              <div class="settings-row-hint">Applies while this page is open and is written to the colony on each server sync. Default 1×. Time away from the page still catches up at 1× (when enabled).</div>
            </div>
            <div class="settings-speed-group" role="group" aria-label="Simulation speed">
              ${([1, 2, 3] as SimulationSpeed[])
                .map(
                  (value) => `
                    <button type="button" class="settings-speed-opt ${speed === value ? 'active' : ''}" data-speed="${value}">
                      ${value}×
                    </button>`
                )
                .join('')}
            </div>
          </div>

          <div class="settings-shortcuts">
            <div class="settings-row-title">KEYBOARD SHORTCUTS</div>
            <div class="settings-shortcut-line"><kbd>.</kbd> Cycle speed 1× → 2× → 3×</div>
            <div class="settings-shortcut-line"><kbd>S</kbd> Open / close this settings panel</div>
            <div class="settings-shortcut-line"><kbd>Esc</kbd> Close open panel</div>
          </div>

          <button type="button" class="settings-help-link" id="settings-open-help">
            OPEN MISSION MANUAL
          </button>
        </div>
      </div>
    `;

    this.overlay.querySelector('#settings-close-btn')?.addEventListener('click', () => this.close());
    this.overlay.querySelector('#settings-toggle-time')?.addEventListener('click', () => {
      this.update({ alwaysPassTime: !this.state.alwaysPassTime });
    });
    this.overlay.querySelector('#settings-toggle-autopilot')?.addEventListener('click', () => {
      this.update({ autopilot: !this.state.autopilot });
    });
    this.overlay.querySelectorAll<HTMLButtonElement>('.settings-speed-opt').forEach((btn) => {
      btn.addEventListener('click', () => {
        const value = Number(btn.dataset.speed) as SimulationSpeed;
        if (value === 1 || value === 2 || value === 3) this.update({ speed: value });
      });
    });
    this.overlay.querySelector('#settings-open-help')?.addEventListener('click', () => {
      this.close({ silent: true });
      this.onOpenHelp();
    });
  }

  private bindEvents(): void {
    this.settingsBtn.addEventListener('click', () => this.toggle());
    this.speedBtn.addEventListener('click', () => this.cycleSpeed());

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    window.addEventListener('keydown', (e) => {
      if (!this.controlsVisible) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape' && this.isOpen) {
        e.preventDefault();
        this.close();
        return;
      }

      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        this.toggle();
        return;
      }

      if (e.key === '.' || e.code === 'Period') {
        e.preventDefault();
        this.cycleSpeed();
      }
    });
  }
}
