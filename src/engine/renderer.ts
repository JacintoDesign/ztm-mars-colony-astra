import { IsoConfig, GridPoint } from './iso-math';
import { ColonyScene } from './colony-scene';
import { ColonyStore } from '../simulation/store';
import { Building, BuildingType, ColonyState } from '../simulation/types';
import { StatusLevel } from '../ui/toolbar';

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  store: ColonyStore;
  gridSize?: number;
  onHoverTile?: (tile: GridPoint | null) => void;
  onStatusChange?: (message: string, level: StatusLevel) => void;
  onSelectBuilding?: (buildingId: string | null) => void;
  onToolDeselect?: () => void;
}

export class IsometricRenderer {
  private previewState: ColonyState | null = null;
  public setPreviewState(state: ColonyState | null): void {
    this.previewState = state;
    this.requestRender();
  }
  private canvas: HTMLCanvasElement;
  private scene: ColonyScene;
  private unsubscribe?: () => void;
  private store: ColonyStore;
  private config: IsoConfig;
  private hoveredTile: GridPoint | null = null;
  private selectedTool: BuildingType | null = null;
  private selectedBuildingId: string | null = null;
  private relocatingBuildingId: string | null = null;
  private onHoverTile?: (tile: GridPoint | null) => void;
  private onStatusChange?: (message: string, level: StatusLevel) => void;
  private onSelectBuilding?: (buildingId: string | null) => void;
  private onToolDeselect?: () => void;
  private animationFrameId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  // Zoom and Pan Navigation for Mobile and Desktop
  private zoomLevel: number = 1.0;
  private panOffsetX: number = 0;
  private panOffsetY: number = 0;
  private mouseDrag: { x: number; y: number; moved: boolean } | null = null;
  private suppressClick = false;
  private handlePointerDown = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    this.mouseDrag = { x: e.clientX, y: e.clientY, moved: false };
    this.canvas.setPointerCapture(e.pointerId);
  };
  private handlePointerMove = (e: PointerEvent): void => {
    if (!this.mouseDrag) return;
    const dx = e.clientX - this.mouseDrag.x, dy = e.clientY - this.mouseDrag.y;
    if (!this.mouseDrag.moved && Math.hypot(dx, dy) < 5) return;
    this.mouseDrag.moved = true;
    this.panOffsetX += dx; this.panOffsetY += dy;
    this.mouseDrag.x = e.clientX; this.mouseDrag.y = e.clientY;
    this.handleResize();
  };
  private handlePointerUp = (): void => {
    this.suppressClick = this.mouseDrag?.moved ?? false;
    this.mouseDrag = null;
  };
  private touchStartDistance: number = 0;
  private touchStartZoom: number = 1.0;
  private touchStartX: number = 0;
  private touchStartY: number = 0;
  private touchStartPanX: number = 0;
  private touchStartPanY: number = 0;
  private hasMovedSignificantly: boolean = false;

  constructor(options: RendererOptions) {
    this.canvas = options.canvas;
    this.scene = new ColonyScene(this.canvas, options.gridSize ?? 20);
    this.store = options.store;
    this.onHoverTile = options.onHoverTile;
    this.onStatusChange = options.onStatusChange;
    this.onSelectBuilding = options.onSelectBuilding;
    this.onToolDeselect = options.onToolDeselect;

    const gridSize = options.gridSize ?? 20;

    this.config = {
      gridSize,
      tileWidth: 64,
      tileHeight: 32,
      originX: 0,
      originY: 0,
    };

    this.handleResize = this.handleResize.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseLeave = this.handleMouseLeave.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.handleTouchEnd = this.handleTouchEnd.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
    this.render = this.render.bind(this);

    this.setupEvents();
    this.handleResize();
    this.unsubscribe = this.store.subscribe(() => {
      this.updateStatus();
      this.requestRender();
    });
    this.requestRender();

    requestAnimationFrame(() => this.handleResize());
  }

  public getZoomLevel(): number {
    return this.zoomLevel;
  }

  public setZoomLevel(zoom: number): void {
    this.zoomLevel = Math.max(1.0, Math.min(3.5, zoom));
    if (this.zoomLevel === 1.0) {
      this.panOffsetX = 0;
      this.panOffsetY = 0;
    }
    this.handleResize();
  }

  public resetZoomAndPan(): void {
    this.zoomLevel = 1.0;
    this.panOffsetX = 0;
    this.panOffsetY = 0;
    this.handleResize();
  }

  public setSelectedTool(tool: BuildingType | null): void {
    this.selectedTool = tool;
    this.relocatingBuildingId = null;
    this.updateStatus();
    this.requestRender();
  }

  public getSelectedTool(): BuildingType | null {
    return this.selectedTool;
  }

  public getSelectedBuildingId(): string | null {
    return this.selectedBuildingId;
  }

  public setSelectedBuildingId(id: string | null): void {
    if (this.selectedBuildingId === id) return;
    this.selectedBuildingId = id;
    if (this.onSelectBuilding) {
      this.onSelectBuilding(id);
    }
    this.requestRender();
  }

  public startRelocateBuilding(buildingId?: string): boolean {
    const targetId = buildingId ?? this.selectedBuildingId ?? this.store.getState().buildings.find((b) => b.type === 'extractor')?.id;
    if (!targetId) {
      if (this.onStatusChange) this.onStatusChange('No building selected to move', 'warning');
      return false;
    }
    this.selectedTool = null;
    this.relocatingBuildingId = targetId;
    this.selectedBuildingId = targetId;
    if (this.onStatusChange) {
      this.onStatusChange('Select target tile to relocate structure (Cost: 10 Power)', 'nominal');
    }
    this.requestRender();
    return true;
  }

  public toggleBuildingPower(buildingId?: string): boolean {
    const targetId = buildingId ?? this.selectedBuildingId ?? this.store.getState().buildings.find((b) => b.type === 'extractor')?.id;
    if (!targetId) {
      if (this.onStatusChange) this.onStatusChange('No building selected to toggle', 'warning');
      return false;
    }
    const res = this.store.dispatch({
      type: 'TOGGLE_BUILDING_POWER',
      buildingId: targetId,
    });
    if (res.success) {
      const b = this.store.getState().buildings.find((bld) => bld.id === targetId);
      const conditionStr = b?.condition === 'deactivated' ? 'Deactivated (0 PWR)' : 'Activated';
      if (this.onStatusChange) this.onStatusChange(`Building ${conditionStr}`, 'nominal');
    } else {
      if (this.onStatusChange) this.onStatusChange(res.reason ? `Toggle Failed: ${res.reason}` : 'Toggle Failed', 'warning');
    }
    this.requestRender();
    return res.success;
  }

  public destroy(): void {
    this.unsubscribe?.();
    this.scene.destroy();
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    window.removeEventListener('resize', this.handleResize);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerUp);
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('mouseleave', this.handleMouseLeave);
    this.canvas.removeEventListener('click', this.handleClick);
    this.canvas.removeEventListener('touchstart', this.handleTouchStart);
    this.canvas.removeEventListener('touchmove', this.handleTouchMove);
    this.canvas.removeEventListener('touchend', this.handleTouchEnd);
    this.canvas.removeEventListener('touchcancel', this.handleTouchEnd);
    this.canvas.removeEventListener('wheel', this.handleWheel);
  }

  private setupEvents(): void {
    window.addEventListener('resize', this.handleResize);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointercancel', this.handlePointerUp);
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('mouseleave', this.handleMouseLeave);
    this.canvas.addEventListener('click', this.handleClick);
    this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', this.handleTouchEnd, { passive: false });
    this.canvas.addEventListener('touchcancel', this.handleTouchEnd, { passive: false });
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });

    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(() => {
        this.handleResize();
      });
      this.resizeObserver.observe(this.canvas);
      if (this.canvas.parentElement) {
        this.resizeObserver.observe(this.canvas.parentElement);
      }
      this.resizeObserver.observe(document.body);
    }
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const zoomDelta = -e.deltaY * 0.0025;
    const prevZoom = this.zoomLevel;
    this.zoomLevel = Math.max(1.0, Math.min(3.5, this.zoomLevel + zoomDelta));
    if (this.zoomLevel === 1.0) {
      this.panOffsetX = 0;
      this.panOffsetY = 0;
    } else if (prevZoom !== this.zoomLevel) {
      const ratio = this.zoomLevel / prevZoom;
      this.panOffsetX *= ratio;
      this.panOffsetY *= ratio;
    }
    this.handleResize();
  }

  private handleTouchStart(e: TouchEvent): void {
    if (e.touches.length === 1) {
      this.touchStartX = e.touches[0].clientX;
      this.touchStartY = e.touches[0].clientY;
      this.touchStartPanX = this.panOffsetX;
      this.touchStartPanY = this.panOffsetY;
      this.hasMovedSignificantly = false;
    } else if (e.touches.length === 2) {
      e.preventDefault();
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      this.touchStartDistance = d;
      this.touchStartZoom = this.zoomLevel;
      this.touchStartPanX = this.panOffsetX;
      this.touchStartPanY = this.panOffsetY;
      this.hasMovedSignificantly = true;
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    if (e.touches.length === 1) {
      const dx = e.touches[0].clientX - this.touchStartX;
      const dy = e.touches[0].clientY - this.touchStartY;
      if (Math.hypot(dx, dy) > 8) {
        this.hasMovedSignificantly = true;
      }
      if (this.hasMovedSignificantly || this.zoomLevel > 1.05) {
        e.preventDefault();
        this.panOffsetX = this.touchStartPanX + dx;
        this.panOffsetY = this.touchStartPanY + dy;
        this.handleResize();
      }
    } else if (e.touches.length === 2) {
      e.preventDefault();
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (this.touchStartDistance > 0) {
        const scaleRatio = d / this.touchStartDistance;
        this.zoomLevel = Math.max(1.0, Math.min(3.5, this.touchStartZoom * scaleRatio));
        this.hasMovedSignificantly = true;
        this.handleResize();
      }
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    e.preventDefault();
    if (e.type !== 'touchcancel' && !this.hasMovedSignificantly && e.changedTouches.length > 0) {
      const touch = e.changedTouches[0];
      this.handleClick(new MouseEvent('click', { clientX: touch.clientX, clientY: touch.clientY }));
    }
  }

  public handleResize(): void {
    const width = Math.max(window.innerWidth, document.documentElement.clientWidth || 0);
    const height = Math.max(window.innerHeight, document.documentElement.clientHeight || 0);

    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';

    // Compute scale so the 20x20 isometric board stays centered and fills the screen smoothly
    const baseTileW = 64;
    const baseTileH = 32;
    const totalW = this.config.gridSize * baseTileW; // 1280
    const totalH = this.config.gridSize * baseTileH; // 640

    // On mobile, headers/telemetry can take more vertical space
    const topMargin = width <= 680 ? 120 : 64;
    const bottomMargin = width <= 680 ? 100 : 64;
    const availableW = Math.max(200, width - 16);
    const availableH = Math.max(200, height - topMargin - bottomMargin);
    const baseScale = Math.max(0.35, Math.min(availableW / totalW, availableH / (totalH + 40)));
    const effectiveScale = baseScale * this.zoomLevel;

    const tileW = Math.floor(baseTileW * effectiveScale);
    const tileH = Math.floor(baseTileH * effectiveScale);
    this.config.tileWidth = tileW;
    this.config.tileHeight = tileH;

    this.config.originX = Math.floor(width / 2) + this.panOffsetX;
    const totalGridH = this.config.gridSize * tileH;
    const baseOriginY = Math.max(10, Math.floor(topMargin + (availableH - totalGridH) / 2));
    this.config.originY = baseOriginY + this.panOffsetY;

    this.render();
  }

  private getCanvasCoords(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  public findBuildingAtScreen(screenX: number, screenY: number): Building | null {
    const id = this.scene.buildingAt(screenX, screenY);
    return this.store.getState().buildings.find(b => b.id === id) ?? null;
  }

  private handleMouseMove(e: MouseEvent): void {
    const { x, y } = this.getCanvasCoords(e);
    const tile = this.scene.tileAt(x, y);

    // Update cursor style
    if (this.selectedTool || this.relocatingBuildingId) {
      this.canvas.style.cursor = 'crosshair';
    } else {
      const bldUnderCursor = this.findBuildingAtScreen(x, y);
      this.canvas.style.cursor = bldUnderCursor ? 'pointer' : 'default';
    }

    if (!this.hoveredTile && !tile) return;
    if (this.hoveredTile && tile && this.hoveredTile.x === tile.x && this.hoveredTile.y === tile.y) return;

    this.hoveredTile = tile;
    if (this.onHoverTile) {
      this.onHoverTile(tile);
    }
    this.updateStatus();
    this.requestRender();
  }

  private handleMouseLeave(): void {
    if (this.hoveredTile !== null) {
      this.hoveredTile = null;
      if (this.onHoverTile) {
        this.onHoverTile(null);
      }
      this.updateStatus();
      this.requestRender();
    }
  }

  private handleClick(e: MouseEvent): void {
    if (this.previewState) return;
    if (this.suppressClick) { this.suppressClick = false; return; }
    const { x, y } = this.getCanvasCoords(e);
    const tile = this.scene.tileAt(x, y);

    // 1. Selection Mode: Test 3D building sprite first
    const clickedBuilding = this.findBuildingAtScreen(x, y);
    if (clickedBuilding) {
      if (this.selectedTool) {
        this.selectedTool = null;
        if (this.onToolDeselect) this.onToolDeselect();
      }
      this.relocatingBuildingId = null;
      this.setSelectedBuildingId(clickedBuilding.id);
      const neighbors = this.store.getState().buildings.filter(
        (other) => other.id !== clickedBuilding.id && Math.abs(clickedBuilding.x - other.x) + Math.abs(clickedBuilding.y - other.y) === 1
      ).length;
      const spacingInfo = neighbors > 1 ? `Crowded (-${neighbors - 1} output)` : 'Optimal Spacing (100%)';
      if (this.onStatusChange) {
        this.onStatusChange(
          `[${clickedBuilding.type.toUpperCase()}] ${clickedBuilding.condition.toUpperCase()} | Neighbors: ${neighbors} (${spacingInfo})`,
          neighbors > 1 ? 'warning' : 'nominal'
        );
      }
      this.requestRender();
      return;
    }

    // 2. Test Landing Pad / Transport Capsule at (0, 0)
    if (tile && tile.x === 0 && tile.y === 0) {
      if (this.selectedTool) {
        this.selectedTool = null;
        if (this.onToolDeselect) this.onToolDeselect();
      }
      this.relocatingBuildingId = null;
      this.setSelectedBuildingId('landing_pad');
      if (this.onStatusChange) {
        const hasArrival = this.store.getState().pendingArrivals.length > 0;
        this.onStatusChange(
          hasArrival ? 'Landing Pad: Supply Transport On-Site (1 Colonist + 2 Electronics)' : 'Landing Pad: Clear (Awaiting Next Transport)',
          hasArrival ? 'warning' : 'nominal'
        );
      }
      this.requestRender();
      return;
    }

    // 3. If in tool placement mode, place building at empty tile
    if (this.selectedTool) {
      if (tile) {
        this.handleTileAction(tile);
      }
      return;
    }

    // 4. If in relocation mode, relocate to empty tile
    if (this.relocatingBuildingId) {
      if (tile) {
        this.handleTileAction(tile);
      }
      return;
    }

    // 5. Clicked empty terrain without tool or relocation: clear selection
    this.setSelectedBuildingId(null);
    if (tile) {
      this.handleTileAction(tile);
    }
  }

  private handleTileAction(tile: GridPoint): void {
    // 1. Relocation Mode Active
    if (this.relocatingBuildingId) {
      const result = this.store.dispatch({
        type: 'MOVE_BUILDING',
        buildingId: this.relocatingBuildingId,
        targetX: tile.x,
        targetY: tile.y,
      });

      if (result.success) {
        if (this.onStatusChange) this.onStatusChange('Building Relocated (10 Power)', 'nominal');
        this.relocatingBuildingId = null;
      } else {
        if (this.onStatusChange) {
          const level: StatusLevel = result.reason === 'Tile Occupied' ? 'warning' : 'critical';
          this.onStatusChange(result.reason ? `Relocation Blocked: ${result.reason}` : 'Relocation Failed', level);
        }
      }
      this.requestRender();
      return;
    }

    // 2. Building Placement Mode Active
    if (this.selectedTool) {
      const result = this.store.dispatch({
        type: 'PLACE_BUILDING',
        buildingType: this.selectedTool,
        x: tile.x,
        y: tile.y,
      });

      if (!result.success && this.onStatusChange) {
        const level: StatusLevel = result.reason === 'Tile Occupied' ? 'warning' : 'critical';
        this.onStatusChange(result.reason ?? 'Placement Rejected', level);
      } else if (result.success && this.onStatusChange) {
        this.onStatusChange('Building Placed', 'nominal');
      }
      this.requestRender();
      return;
    }

    // 3. Selection Mode (No tool active)
    const building = this.store.getState().buildings.find((b) => b.x === tile.x && b.y === tile.y);
    if (building) {
      this.setSelectedBuildingId(building.id);
      const neighbors = this.store.getState().buildings.filter(
        (other) => other.id !== building.id && Math.abs(building.x - other.x) + Math.abs(building.y - other.y) === 1
      ).length;
      const spacingInfo = neighbors > 1 ? `Crowded (-${neighbors - 1} output)` : 'Optimal Spacing (100%)';
      if (this.onStatusChange) {
        this.onStatusChange(
          `[${building.type.toUpperCase()}] ${building.condition.toUpperCase()} | Neighbors: ${neighbors} (${spacingInfo})`,
          neighbors > 1 ? 'warning' : 'nominal'
        );
      }
    } else {
      this.setSelectedBuildingId(null);
    }
    this.requestRender();
  }

  public requestRender(): void {
    if (this.animationFrameId === null) {
      this.animationFrameId = requestAnimationFrame(this.render);
    }
  }

  private render(): void {
    this.animationFrameId = null;
    const state = this.previewState ?? this.store.getState();
    const tile = this.previewState ? null : this.hoveredTile;
    const canPlace = !!tile && (this.selectedTool
      ? this.store.checkPlacement(this.selectedTool, tile.x, tile.y).canPlace
      : !state.buildings.some(b => b.x === tile.x && b.y === tile.y) && !(tile.x === 0 && tile.y === 0) && state.power >= 10);
    const config = { ...this.config };
    if (this.previewState) {
      config.tileWidth = Math.min(window.innerWidth / 24, window.innerHeight / 14) * 1.35;
      config.tileHeight = config.tileWidth / 2;
      config.originX = window.innerWidth / 2;
      config.originY = window.innerHeight * .52 - config.tileWidth * 5;
    }
    this.scene.render(config, state, tile, this.selectedTool, this.selectedBuildingId, canPlace, !!this.relocatingBuildingId);
  }

  private updateStatus(): void {
    if (!this.onStatusChange) return;

    if (this.relocatingBuildingId) {
      if (!this.hoveredTile) {
        this.onStatusChange('Select target tile to relocate structure (Cost: 10 Power)', 'nominal');
        return;
      }
      const isOccupied = this.store.getState().buildings.some((b) => b.x === this.hoveredTile!.x && b.y === this.hoveredTile!.y);
      const isReserved = this.hoveredTile.x === 0 && this.hoveredTile.y === 0;
      if (isOccupied) {
        this.onStatusChange('Tile Occupied', 'warning');
      } else if (isReserved) {
        this.onStatusChange('Tile (0, 0) Reserved', 'warning');
      } else if (this.store.getState().power < 10) {
        this.onStatusChange('Insufficient Power (Requires 10 PWR)', 'critical');
      } else {
        this.onStatusChange('Click tile to place relocated structure (Cost: 10 Power)', 'nominal');
      }
      return;
    }

    if (!this.selectedTool) {
      if (this.hoveredTile) {
        const b = this.store.getState().buildings.find((bld) => bld.x === this.hoveredTile!.x && bld.y === this.hoveredTile!.y);
        if (b) {
          const neighbors = this.store.getState().buildings.filter(
            (other) => other.id !== b.id && Math.abs(b.x - other.x) + Math.abs(b.y - other.y) === 1
          ).length;
          const spacingInfo = neighbors > 1 ? `Crowded (-${neighbors - 1} output)` : 'Optimal Spacing (100%)';
          this.onStatusChange(
            `[${b.type.toUpperCase()}] ${b.condition.toUpperCase()} | Neighbors: ${neighbors} (${spacingInfo})`,
            neighbors > 1 ? 'warning' : 'nominal'
          );
          return;
        }

        const depositOre = this.store.getTileOre(this.hoveredTile.x, this.hoveredTile.y);
        if (depositOre > 0) {
          this.onStatusChange(`[SURFACE] Deposit: ${depositOre} Ore`, 'nominal');
          return;
        }
      }
      this.onStatusChange('Nominal', 'nominal');
      return;
    }

    if (!this.hoveredTile) {
      this.onStatusChange('Select Tile', 'nominal');
      return;
    }

    const check = this.store.checkPlacement(this.selectedTool, this.hoveredTile.x, this.hoveredTile.y);
    const depositOre = this.store.getTileOre(this.hoveredTile.x, this.hoveredTile.y);
    const depositPrefix = this.selectedTool === 'extractor' ? `Deposit: ${depositOre} Ore | ` : '';

    if (!check.canPlace) {
      const level: StatusLevel = check.reason === 'Tile Occupied' ? 'warning' : 'critical';
      this.onStatusChange(`${depositPrefix}${check.reason ?? 'Placement Blocked'}`, level);
    } else {
      const cost = check.cost;
      const costStr = cost.ore > 0 ? `${cost.power} Power, ${cost.ore} Ore` : `${cost.power} Power`;
      this.onStatusChange(`${depositPrefix}Ready (Cost: ${costStr})`, 'nominal');
    }
  }
}
