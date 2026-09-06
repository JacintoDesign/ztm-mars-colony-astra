import { BuildingType } from '../simulation/types';
import { GridPoint } from '../engine/iso-math';

export type StatusLevel = 'nominal' | 'warning' | 'critical';

export interface ToolbarOptions {
  containerId?: string;
  onSelectTool: (tool: BuildingType | null) => void;
}

export class Toolbar {
  private container: HTMLElement;
  private currentTool: BuildingType | null = null;
  private currentStatus: string = 'Nominal';
  private currentStatusLevel: StatusLevel = 'nominal';
  private onSelectTool: (tool: BuildingType | null) => void;
  private isCooldown = false;
  private isActionsPaused = false;
  private hoveredTile: GridPoint | null = null;
  private hoveredTileOre: number | null = null;
  public static readonly CONTAINER_ID = 'toolbar';

  constructor(options: ToolbarOptions) {
    this.onSelectTool = options.onSelectTool;

    const existing = document.getElementById(options.containerId ?? Toolbar.CONTAINER_ID);
    if (existing) {
      this.container = existing;
    } else {
      this.container = document.createElement('div');
      this.container.id = options.containerId ?? Toolbar.CONTAINER_ID;
      document.body.appendChild(this.container);
    }

    document.addEventListener('click', () => {
      document.querySelectorAll<HTMLElement>('.custom-dropdown-drawer').forEach((d) => (d.style.display = 'none'));
      document.querySelectorAll<HTMLElement>('.custom-dropdown-trigger').forEach((t) => t.classList.remove('open'));
    });

    this.render();
  }

  public getSelectedTool(): BuildingType | null {
    return this.currentTool;
  }

  public setTool(tool: BuildingType | null): void {
    if (this.isActionsPaused) return;
    this.currentTool = tool;
    this.render();
    this.onSelectTool(this.currentTool);
  }

  public setStatus(message: string, level: StatusLevel = 'nominal'): void {
    this.currentStatus = message;
    this.currentStatusLevel = level;
    const statusEl = this.container.querySelector<HTMLElement>('#toolbar-status');
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.className = `toolbar-status-val status-${level}`;
    }
  }

  public setHoveredTile(coords: GridPoint | null, oreRemaining: number | null = null): void {
    this.hoveredTile = coords;
    this.hoveredTileOre = oreRemaining;
  }

  public getHoveredTile(): GridPoint | null {
    return this.hoveredTile;
  }

  public getHoveredTileOre(): number | null {
    return this.hoveredTileOre;
  }

  public setActionsPaused(paused: boolean): void {
    this.isActionsPaused = paused;
    if (paused) {
      this.currentTool = null;
      this.onSelectTool(null);
    }
    this.render();
  }

  /**
   * Triggers visual cooldown indicator on action bar and throttles inputs.
   */
  public triggerCooldown(durationMs = 600): void {
    if (this.isCooldown) return;
    this.isCooldown = true;

    this.container.classList.add('toolbar-cooldown-active');
    const cooldownBar = this.container.querySelector<HTMLElement>('.toolbar-cooldown-bar');
    if (cooldownBar) {
      cooldownBar.style.transition = `width ${durationMs}ms linear`;
      cooldownBar.style.width = '100%';
    }

    setTimeout(() => {
      this.isCooldown = false;
      this.container.classList.remove('toolbar-cooldown-active');
      if (cooldownBar) {
        cooldownBar.style.transition = 'none';
        cooldownBar.style.width = '0%';
      }
    }, durationMs);
  }

  private render(): void {
    this.container.innerHTML = '';

    // Cooldown progress indicator overlay
    const cooldownBar = document.createElement('div');
    cooldownBar.className = 'toolbar-cooldown-bar';
    this.container.appendChild(cooldownBar);

    const tools: Array<{ type: BuildingType; name: string; cost: string }> = [
      { type: 'habitat', name: 'Habitat', cost: '20 PWR, 10 Ore' },
      { type: 'solar', name: 'Solar', cost: '15 PWR' },
      { type: 'scrubber', name: 'Scrubber', cost: '15 PWR, 5 Ore' },
      { type: 'extractor', name: 'Extractor', cost: '25 PWR' },
      { type: 'farm', name: 'Farm', cost: '20 PWR, 5 Ore' },
      { type: 'garage', name: 'Garage', cost: '30 PWR, 10 Ore' },
      { type: 'refinery', name: 'Refinery', cost: '25 PWR, 15 Ore' },
    ];

    // 1. Tool selection group (All 7 buildings)
    const toolsGroup = document.createElement('div');
    toolsGroup.className = 'toolbar-group';

    const label = document.createElement('span');
    label.className = 'toolbar-label';
    label.textContent = 'BUILD:';
    toolsGroup.appendChild(label);

    // 1a. Buttons View (Wide screens)
    const buttonsView = document.createElement('div');
    buttonsView.className = 'toolbar-buttons-view';

    for (const tool of tools) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `toolbar-btn ${this.currentTool === tool.type ? 'active' : ''}`;
      btn.id = `tool-${tool.type}`;
      btn.textContent = tool.name;
      btn.disabled = this.isActionsPaused;

      btn.addEventListener('click', () => {
        if (this.isActionsPaused || this.isCooldown) return;
        if (this.currentTool === tool.type) {
          this.setTool(null);
          this.setStatus('Nominal', 'nominal');
        } else {
          this.setTool(tool.type);
        }
      });

      buttonsView.appendChild(btn);
    }
    toolsGroup.appendChild(buttonsView);

    // 1b. Dropdown View (Narrow / Compact screens)
    const dropdownView = document.createElement('div');
    dropdownView.className = 'toolbar-dropdown-view';

    const buildDropdownItems = tools.map((tool) => ({
      value: tool.type,
      label: `${tool.name} (${tool.cost})`,
      active: this.currentTool === tool.type,
    }));

    const buildCustomDropdown = this.createCustomDropdown({
      id: 'toolbar-build-dropdown',
      placeholder: '[ BUILD STRUCTURE... ]',
      items: buildDropdownItems,
      disabled: this.isActionsPaused,
      onSelect: (val) => {
        if (this.isActionsPaused || this.isCooldown) return;
        if (this.currentTool === val) {
          this.setTool(null);
          this.setStatus('Nominal', 'nominal');
        } else {
          this.setTool(val as BuildingType);
        }
      },
    });

    dropdownView.appendChild(buildCustomDropdown);
    toolsGroup.appendChild(dropdownView);

    this.container.appendChild(toolsGroup);

    // 2. Status message / coordinates readout
    const statusGroup = document.createElement('div');
    statusGroup.className = 'toolbar-group toolbar-status-group';

    const statusLabel = document.createElement('span');
    statusLabel.className = 'toolbar-label';
    statusLabel.textContent = 'STATUS:';
    statusGroup.appendChild(statusLabel);

    const statusVal = document.createElement('span');
    statusVal.className = `toolbar-status-val status-${this.currentStatusLevel}`;
    statusVal.id = 'toolbar-status';
    statusVal.textContent = this.currentStatus;
    statusGroup.appendChild(statusVal);

    this.container.appendChild(statusGroup);
  }

  private createCustomDropdown(options: {
    id: string;
    placeholder: string;
    items: Array<{ value: string; label: string; active?: boolean }>;
    disabled?: boolean;
    onSelect: (value: string) => void;
  }): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-dropdown';
    wrapper.id = `${options.id}-wrapper`;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'custom-dropdown-trigger';
    trigger.id = options.id;
    trigger.disabled = Boolean(options.disabled);

    const activeItem = options.items.find((i) => i.active);
    const triggerText = document.createElement('span');
    triggerText.className = 'custom-dropdown-text';
    triggerText.textContent = activeItem ? activeItem.label : options.placeholder;
    trigger.appendChild(triggerText);

    const arrow = document.createElement('span');
    arrow.className = 'custom-dropdown-arrow';
    arrow.textContent = '▼';
    trigger.appendChild(arrow);

    const drawer = document.createElement('div');
    drawer.className = 'custom-dropdown-drawer';
    drawer.style.display = 'none';

    for (const item of options.items) {
      const itemEl = document.createElement('div');
      itemEl.className = `custom-dropdown-item ${item.active ? 'active' : ''}`;
      itemEl.textContent = item.label;
      itemEl.dataset.value = item.value;

      itemEl.addEventListener('click', (e) => {
        e.stopPropagation();
        drawer.style.display = 'none';
        trigger.classList.remove('open');
        options.onSelect(item.value);
      });

      drawer.appendChild(itemEl);
    }

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (options.disabled) return;
      const isOpen = drawer.style.display === 'block';
      document.querySelectorAll<HTMLElement>('.custom-dropdown-drawer').forEach((d) => {
        if (d !== drawer) d.style.display = 'none';
      });
      document.querySelectorAll<HTMLElement>('.custom-dropdown-trigger').forEach((t) => {
        if (t !== trigger) t.classList.remove('open');
      });

      if (isOpen) {
        drawer.style.display = 'none';
        trigger.classList.remove('open');
      } else {
        drawer.style.display = 'block';
        trigger.classList.add('open');
      }
    });

    wrapper.appendChild(trigger);
    wrapper.appendChild(drawer);
    return wrapper;
  }
}
