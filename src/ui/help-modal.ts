import { CONTRACT_RULES } from '../simulation/contract-rules';

export interface HelpModalOptions {
  onOpen?: () => void;
  onClose?: () => void;
}

export class HelpModal {
  private affordanceBtn: HTMLButtonElement;
  private modalOverlay: HTMLElement;
  private isOpen: boolean = false;
  private onOpenCallback?: () => void;
  private onCloseCallback?: () => void;

  public static readonly AFFORDANCE_ID = 'help-btn';
  public static readonly MODAL_ID = 'help-modal';

  constructor(options?: HelpModalOptions) {
    this.onOpenCallback = options?.onOpen;
    this.onCloseCallback = options?.onClose;

    let btn = document.getElementById(HelpModal.AFFORDANCE_ID) as HTMLButtonElement | null;
    if (!btn) {
      btn = document.createElement('button');
      btn.id = HelpModal.AFFORDANCE_ID;
      btn.className = 'help-btn';
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Open Colony Mission Help');
      btn.textContent = '?';
      document.body.appendChild(btn);
    }
    this.affordanceBtn = btn;

    let overlay = document.getElementById(HelpModal.MODAL_ID);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = HelpModal.MODAL_ID;
      overlay.className = 'help-modal-overlay';
      overlay.style.display = 'none';
      document.body.appendChild(overlay);
    }
    this.modalOverlay = overlay;

    this.bindEvents();
    this.render();
  }

  public isModalOpen(): boolean {
    return this.isOpen;
  }

  public handleUserSession(userId: string | null): boolean {
    if (!userId) return false;

    const storageKey = `marscolony_help_seen_${userId}`;
    const hasSeen = localStorage.getItem(storageKey);
    if (!hasSeen) {
      this.open();
      localStorage.setItem(storageKey, 'true');
      return true;
    }
    return false;
  }

  public open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.modalOverlay.style.display = 'flex';
    this.affordanceBtn.classList.add('active');
    if (this.onOpenCallback) {
      this.onOpenCallback();
    }
  }

  public close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.modalOverlay.style.display = 'none';
    this.affordanceBtn.classList.remove('active');
    if (this.onCloseCallback) {
      this.onCloseCallback();
    }
  }

  public toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  private bindEvents(): void {
    this.affordanceBtn.addEventListener('click', () => {
      this.toggle();
    });

    this.modalOverlay.addEventListener('click', (e) => {
      if (e.target === this.modalOverlay) {
        this.close();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  private render(): void {
    const { buildings } = CONTRACT_RULES;

    this.modalOverlay.innerHTML = `
      <div class="help-modal-panel">
        <div class="help-modal-header">
          <div>
            <div class="help-modal-title">// MISSION OPERATIONS MANUAL</div>
            <div class="help-modal-subtitle">CONTRACT TELEMETRY DIRECTIVES & SPECIFICATIONS</div>
          </div>
          <button type="button" class="help-modal-close-btn" id="help-close-btn" aria-label="Close Manual">[X] DISMISS</button>
        </div>

        <div class="help-modal-content">
          <!-- Section 1: Survival Goal -->
          <div class="help-section">
            <div class="help-section-title">1. SURVIVAL & LIFE SUPPORT</div>
            <div class="help-section-body">
              <p>• <strong>Starting Colony:</strong> 1 Starter Habitat at (7, 7), 1 Solar Array at (5, 7), 1 Scrubber at (9, 7), 2 Pioneer Colonists, 50 O2, 50 Power, 50 Food, 25 Ore, 2 Electronics (Emergency Spare Parts Kit), and 500 Ore across Martian terrain deposits.</p>
              <p>• <strong>Workforce Capacity:</strong> Each living colonist supports up to <strong>4 operational structures</strong> (Habitats exempt). Expanding beyond 8 operational facilities requires recruiting more colonists via transport escorts.</p>
              <p>• <strong>Consumption:</strong> Each colonist consumes <strong>3 O2</strong> and <strong>3 Food</strong> per tick.</p>
              <p>• <strong>Oxygen Storage:</strong> 100 base capacity + <strong>5 Max O2 per operational Scrubber</strong>.</p>
              <p>• <strong>Life Support Failure:</strong> If Oxygen, Power, or Food reaches 0, colonists lose <strong>-2 HP/tick</strong> (50-tick survival window). Recovers <strong>+1 HP/tick</strong> when all pools are positive.</p>
              <p>• <strong>Game Over:</strong> Mission terminates if all colonists perish. 1 Sol = 1,000 ticks.</p>
            </div>
          </div>

          <!-- Section 2: Building Specs & Costs -->
          <div class="help-section">
            <div class="help-section-title">2. STRUCTURES & COSTS</div>
            <div class="help-buildings-grid">
              
              <div class="help-building-card">
                <div class="help-building-header">
                  <span class="help-b-name">${buildings.habitat.name.toUpperCase()}</span>
                  <span class="help-b-cost">${buildings.habitat.cost.power} PWR, ${buildings.habitat.cost.ore} ORE</span>
                </div>
                <div class="help-b-desc">Houses 2 colonists.</div>
                <div class="help-b-specs">
                  <div class="help-spec-line"><span class="spec-k">DRAW:</span> <span class="spec-v">-${buildings.habitat.powerDraw} PWR/tick</span></div>
                  <div class="help-spec-line"><span class="spec-k">REPAIR:</span> <span class="spec-v">1 Colonist, 1 Electronics (50t)</span></div>
                </div>
              </div>

              <div class="help-building-card">
                <div class="help-building-header">
                  <span class="help-b-name">${buildings.solar.name.toUpperCase()}</span>
                  <span class="help-b-cost">${buildings.solar.cost.power} PWR</span>
                </div>
                <div class="help-b-desc">Generates solar electricity.</div>
                <div class="help-b-specs">
                  <div class="help-spec-line"><span class="spec-k">OUTPUT:</span> <span class="spec-v">+${buildings.solar.powerProduction} PWR/tick</span></div>
                  <div class="help-spec-line"><span class="spec-k">REPAIR:</span> <span class="spec-v">1 Colonist, 1 Electronics (50t)</span></div>
                </div>
              </div>

              <div class="help-building-card">
                <div class="help-building-header">
                  <span class="help-b-name">${buildings.scrubber.name.toUpperCase()}</span>
                  <span class="help-b-cost">${buildings.scrubber.cost.power} PWR, ${buildings.scrubber.cost.ore} ORE</span>
                </div>
                <div class="help-b-desc">Generates breathable oxygen.</div>
                <div class="help-b-specs">
                  <div class="help-spec-line"><span class="spec-k">OUTPUT:</span> <span class="spec-v">+${buildings.scrubber.oxygenProduction} O2/tick (+5 Max Cap)</span></div>
                  <div class="help-spec-line"><span class="spec-k">DRAW:</span> <span class="spec-v">-${buildings.scrubber.powerDraw} PWR/tick</span></div>
                  <div class="help-spec-line"><span class="spec-k">REPAIR:</span> <span class="spec-v">1 Colonist, 1 Electronics (30t)</span></div>
                </div>
              </div>

              <div class="help-building-card">
                <div class="help-building-header">
                  <span class="help-b-name">${buildings.farm.name.toUpperCase()}</span>
                  <span class="help-b-cost">${buildings.farm.cost.power} PWR, ${buildings.farm.cost.ore} ORE</span>
                </div>
                <div class="help-b-desc">Produces hydroponic food rations.</div>
                <div class="help-b-specs">
                  <div class="help-spec-line"><span class="spec-k">OUTPUT:</span> <span class="spec-v">+${buildings.farm.foodProduction} Food/tick</span></div>
                  <div class="help-spec-line"><span class="spec-k">DRAW:</span> <span class="spec-v">-${buildings.farm.powerDraw} PWR/tick</span></div>
                  <div class="help-spec-line"><span class="spec-k">REPAIR:</span> <span class="spec-v">1 Colonist, 1 Electronics (50t)</span></div>
                </div>
              </div>

              <div class="help-building-card">
                <div class="help-building-header">
                  <span class="help-b-name">${buildings.extractor.name.toUpperCase()}</span>
                  <span class="help-b-cost">${buildings.extractor.cost.power} PWR</span>
                </div>
                <div class="help-b-desc">Extracts ore from ground deposits.</div>
                <div class="help-b-specs">
                  <div class="help-spec-line"><span class="spec-k">OUTPUT:</span> <span class="spec-v">+${buildings.extractor.oreProduction} Ore/tick</span></div>
                  <div class="help-spec-line"><span class="spec-k">DRAW:</span> <span class="spec-v">-${buildings.extractor.powerDraw} PWR/tick</span></div>
                  <div class="help-spec-line"><span class="spec-k">REPAIR:</span> <span class="spec-v">2 Colonists, 2 Electronics (50t)</span></div>
                </div>
              </div>

              <div class="help-building-card">
                <div class="help-building-header">
                  <span class="help-b-name">${buildings.garage.name.toUpperCase()}</span>
                  <span class="help-b-cost">${buildings.garage.cost.power} PWR, ${buildings.garage.cost.ore} ORE</span>
                </div>
                <div class="help-b-desc">Houses up to 2 surface rovers.</div>
                <div class="help-b-specs">
                  <div class="help-spec-line"><span class="spec-k">CAPACITY:</span> <span class="spec-v">2 Surface Rovers</span></div>
                  <div class="help-spec-line"><span class="spec-k">DRAW:</span> <span class="spec-v">-${buildings.garage.powerDraw} PWR/tick</span></div>
                  <div class="help-spec-line"><span class="spec-k">REPAIR:</span> <span class="spec-v">2 Colonists, 2 Electronics (50t)</span></div>
                </div>
              </div>

              <div class="help-building-card">
                <div class="help-building-header">
                  <span class="help-b-name">${buildings.refinery.name.toUpperCase()}</span>
                  <span class="help-b-cost">${buildings.refinery.cost.power} PWR, ${buildings.refinery.cost.ore} ORE</span>
                </div>
                <div class="help-b-desc">Refines 10 Ore into 1 Battery Cell.</div>
                <div class="help-b-specs">
                  <div class="help-spec-line"><span class="spec-k">CAPACITY:</span> <span class="spec-v">20 Stored Cells</span></div>
                  <div class="help-spec-line"><span class="spec-k">DRAW:</span> <span class="spec-v">-${buildings.refinery.powerDraw} PWR/tick</span></div>
                  <div class="help-spec-line"><span class="spec-k">REPAIR:</span> <span class="spec-v">2 Colonists, 2 Electronics (50t)</span></div>
                </div>
              </div>

            </div>
          </div>

          <!-- Section 3: Maintenance & Weather -->
          <div class="help-section">
            <div class="help-section-title">3. MAINTENANCE & WEATHER</div>
            <div class="help-section-body">
              <p>• <strong>Breakage:</strong> 1-in-4,000 tick chance. Broken buildings produce/draw 0 until repaired by adjacent colonist labor + Electronics (Scrubbers: 30t; Others: 50t).</p>
              <p>• <strong>Dust Storms:</strong> 30% chance every 1,500 ticks starting Sol 2.5, burying up to 2 buildings. Requires 40 ticks adjacent colonist digging (0 resource cost).</p>
            </div>
          </div>

          <!-- Section 4: Colonist Aging -->
          <div class="help-section">
            <div class="help-section-title">4. COLONIST LIFESPAN</div>
            <div class="help-section-body">
              <p>• Colonists have individual lifespans between 6,000–10,000 ticks (6–10 Sols) and age out naturally.</p>
            </div>
          </div>

          <!-- Section 5: Escorted Arrivals & Electronics -->
          <div class="help-section">
            <div class="help-section-title">5. ARRIVALS & ELECTRONICS</div>
            <div class="help-section-body">
              <p>• Ships land at (0, 0) every 300 ticks delivering 1 colonist + 2 Electronics (if habitat capacity allows).</p>
              <p>• Dispatch a rover escort within 150 ticks to rescue the arrival, or they are lost.</p>
            </div>
          </div>

          <!-- Section 6: Rovers & Batteries -->
          <div class="help-section">
            <div class="help-section-title">6. ROVERS & MINING</div>
            <div class="help-section-body">
              <p>• Rovers travel at 1 tile/tick, draining 1.5 PWR/tick. Dispatch fuels rover to full charge using 1 Battery Cell.</p>
              <p>• Stored battery cells decay at -1 efficiency/tick. Rovers harvest distant mining sites and timed asteroid strikes.</p>
            </div>
          </div>

          <!-- Section 7: Spacing Buffers & Structure Management -->
          <div class="help-section">
            <div class="help-section-title">7. SPACING & CONTROLS</div>
            <div class="help-section-body">
              <p>• <strong>Spacing:</strong> Buildings with &le; 1 adjacent neighbor run at 100% output. Overcrowded buildings (&ge; 2 neighbors) suffer -1 output per extra neighbor.</p>
              <p>• <strong>Extractor Controls:</strong> Click <strong>Toggle Power</strong> to deactivate dry extractors (0 PWR draw). Click <strong>Move Extractor (10 PWR)</strong> to relocate to new deposits.</p>
              <p>• <strong>Automated Labor:</strong> Idle colonists automatically pathfind adjacent to broken/buried structures to perform repairs or dig-outs.</p>
            </div>
          </div>
        </div>
      </div>
    `;

    const closeBtn = this.modalOverlay.querySelector<HTMLButtonElement>('#help-close-btn');
    closeBtn?.addEventListener('click', () => {
      this.close();
    });
  }
}
