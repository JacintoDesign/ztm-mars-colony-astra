import { getTileVertices, IsoConfig, GridPoint, screenToGrid } from './iso-math';
import { ColonyStore } from '../simulation/store';
import { Building, BuildingType } from '../simulation/types';
import {
  drawBuilding,
  drawColonist,
  drawRover,
  drawAsteroid,
  drawBuildingConditionOverlay,
  drawLandingCapsule,
  drawLandingPad,
} from '../assets/building-renderers';
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

function tileColorHash(gx: number, gy: number): number {
  let h = gx * 374761393 + gy * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

export class IsometricRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
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
  private dpr = 1;
  private animationFrameId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  // Zoom and Pan Navigation for Mobile and Desktop
  private zoomLevel: number = 1.0;
  private panOffsetX: number = 0;
  private panOffsetY: number = 0;
  private touchStartDistance: number = 0;
  private touchStartZoom: number = 1.0;
  private touchStartX: number = 0;
  private touchStartY: number = 0;
  private touchStartPanX: number = 0;
  private touchStartPanY: number = 0;
  private hasMovedSignificantly: boolean = false;

  constructor(options: RendererOptions) {
    this.canvas = options.canvas;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context from canvas');
    }
    this.ctx = ctx;
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
    this.store.subscribe(() => {
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
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    window.removeEventListener('resize', this.handleResize);
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
    if (!this.hasMovedSignificantly && e.changedTouches.length > 0) {
      const touch = e.changedTouches[0];
      const rect = this.canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;

      if (!this.relocatingBuildingId && !this.selectedTool) {
        const clickedBuilding = this.findBuildingAtScreen(x, y);
        if (clickedBuilding) {
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
      }

      const tile = screenToGrid(x, y, this.config);
      this.setSelectedBuildingId(null);
      if (tile) {
        this.handleTileAction(tile);
      }
    }
  }

  public handleResize(): void {
    const width = Math.max(window.innerWidth, document.documentElement.clientWidth || 0);
    const height = Math.max(window.innerHeight, document.documentElement.clientHeight || 0);

    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(width * this.dpr);
    this.canvas.height = Math.floor(height * this.dpr);
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
    const buildings = this.store.getState().buildings;
    if (buildings.length === 0) return null;

    // Sort front-to-back by isometric depth (higher x + y first) so foreground structures take precedence
    const sorted = [...buildings].sort((a, b) => {
      const depthA = a.x + a.y;
      const depthB = b.x + b.y;
      if (depthA !== depthB) return depthB - depthA;
      return b.y - a.y;
    });

    const halfW = this.config.tileWidth / 2;
    const s = halfW / 32;

    for (const b of sorted) {
      const v = getTileVertices(b.x, b.y, this.config);
      
      // Building vertical heights by type
      let heightPx = 36;
      if (b.type === 'scrubber') heightPx = 55;
      else if (b.type === 'solar') heightPx = 45;
      else if (b.type === 'refinery') heightPx = 48;
      else if (b.type === 'extractor') heightPx = 42;
      else if (b.type === 'habitat') heightPx = 38;
      else if (b.type === 'farm') heightPx = 32;
      else if (b.type === 'garage') heightPx = 32;

      const topY = v.top.y - heightPx * s;
      const bottomY = v.bottom.y + 4 * s;
      const leftX = v.center.x - halfW * 1.05;
      const rightX = v.center.x + halfW * 1.05;

      // Check if point is within the 3D visual bounding box of this building
      if (screenX >= leftX && screenX <= rightX && screenY >= topY && screenY <= bottomY) {
        return b;
      }
    }

    // Fallback: check flat ground diamond
    const tile = screenToGrid(screenX, screenY, this.config);
    if (tile) {
      return buildings.find((b) => b.x === tile.x && b.y === tile.y) ?? null;
    }

    return null;
  }

  private handleMouseMove(e: MouseEvent): void {
    const { x, y } = this.getCanvasCoords(e);
    const tile = screenToGrid(x, y, this.config);

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
    const { x, y } = this.getCanvasCoords(e);
    const tile = screenToGrid(x, y, this.config);

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
    const ctx = this.ctx;
    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;

    // Reset transform matrix and apply DPR scale
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // 1. Dark Martian background
    ctx.fillStyle = '#1a0e08';
    ctx.fillRect(0, 0, width, height);

    // 2. 3D Geological Crust Slab
    this.render3DSlab(ctx);

    // 3. 20x20 Isometric Terrain Grid
    this.renderTerrainGrid(ctx);

    // 4. Placed Buildings & Colonists sorted back-to-front
    this.renderEntities(ctx);

    // 5. Atmospheric Haze effect per DESIGN.md (tints when oxygen < 50)
    this.renderAtmosphericHaze(ctx, width, height);

    // 6. Hover Highlight & Placement Ghost Preview
    this.renderHoverHighlight(ctx);
  }

  /**
   * Renders atmospheric dusty haze over the scene as oxygen drops below 50.
   */
  private renderAtmosphericHaze(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const oxygen = this.store.getState().oxygen;
    if (oxygen < 50) {
      const severity = (50 - oxygen) / 50; // 0 at oxygen=50, 1 at oxygen=0
      const opacity = severity * 0.48; // Max 48% dusty red-orange haze
      ctx.fillStyle = `rgba(180, 80, 20, ${opacity})`;
      ctx.fillRect(0, 0, width, height);
    }
  }

  private render3DSlab(ctx: CanvasRenderingContext2D): void {
    const { gridSize, tileHeight } = this.config;
    const slabDepth = Math.max(30, Math.floor(tileHeight * 1.15));

    // Front-Left Cliff
    const gy = gridSize - 1;
    for (let gx = 0; gx < gridSize; gx++) {
      const v = getTileVertices(gx, gy, this.config);
      ctx.fillStyle = '#1e0e07';
      ctx.beginPath();
      ctx.moveTo(v.left.x, v.left.y);
      ctx.lineTo(v.bottom.x, v.bottom.y);
      ctx.lineTo(v.bottom.x, v.bottom.y + slabDepth);
      ctx.lineTo(v.left.x, v.left.y + slabDepth);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#29140b';
      ctx.beginPath();
      ctx.moveTo(v.left.x, v.left.y + slabDepth * 0.25);
      ctx.lineTo(v.bottom.x, v.bottom.y + slabDepth * 0.25);
      ctx.lineTo(v.bottom.x, v.bottom.y + slabDepth * 0.6);
      ctx.lineTo(v.left.x, v.left.y + slabDepth * 0.6);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#120703';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(v.bottom.x, v.bottom.y);
      ctx.lineTo(v.bottom.x, v.bottom.y + slabDepth);
      ctx.stroke();
    }

    // Front-Right Cliff
    const gx = gridSize - 1;
    for (let gyCurrent = gridSize - 1; gyCurrent >= 0; gyCurrent--) {
      const v = getTileVertices(gx, gyCurrent, this.config);
      ctx.fillStyle = '#2f180e';
      ctx.beginPath();
      ctx.moveTo(v.bottom.x, v.bottom.y);
      ctx.lineTo(v.right.x, v.right.y);
      ctx.lineTo(v.right.x, v.right.y + slabDepth);
      ctx.lineTo(v.bottom.x, v.bottom.y + slabDepth);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#3c2013';
      ctx.beginPath();
      ctx.moveTo(v.bottom.x, v.bottom.y + slabDepth * 0.25);
      ctx.lineTo(v.right.x, v.right.y + slabDepth * 0.25);
      ctx.lineTo(v.right.x, v.right.y + slabDepth * 0.6);
      ctx.lineTo(v.bottom.x, v.bottom.y + slabDepth * 0.6);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#1a0d06';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(v.right.x, v.right.y);
      ctx.lineTo(v.right.x, v.right.y + slabDepth);
      ctx.stroke();
    }
  }

  private renderTerrainGrid(ctx: CanvasRenderingContext2D): void {
    const { gridSize } = this.config;

    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        const v = getTileVertices(gx, gy, this.config);
        const rand = tileColorHash(gx, gy);

        ctx.beginPath();
        ctx.moveTo(v.top.x, v.top.y);
        ctx.lineTo(v.right.x, v.right.y);
        ctx.lineTo(v.bottom.x, v.bottom.y);
        ctx.lineTo(v.left.x, v.left.y);
        ctx.closePath();

        if (rand > 0.85) ctx.fillStyle = '#361c10';
        else if (rand > 0.65) ctx.fillStyle = '#30180d';
        else if (rand > 0.35) ctx.fillStyle = '#2b160c';
        else if (rand > 0.15) ctx.fillStyle = '#251208';
        else ctx.fillStyle = '#200f07';
        ctx.fill();

        ctx.strokeStyle = '#3d2417';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw Landing Pad simple circle on (0, 0) ONLY if no ship is currently landed
        if (gx === 0 && gy === 0 && this.store.getState().pendingArrivals.length === 0) {
          drawLandingPad(ctx, v.center, this.config.tileWidth / 2, this.config.tileHeight / 2);
        }
      }
    }

    // Highlight Ore Deposits when placing or relocating an Extractor (without displaying numeric amount until placed)
    const state = this.store.getState();
    const isExtractorMode = this.selectedTool === 'extractor' ||
      (this.relocatingBuildingId && state.buildings.find((b) => b.id === this.relocatingBuildingId)?.type === 'extractor');

    if (isExtractorMode) {
      for (const deposit of state.oreDeposits) {
        if (deposit.remaining > 0) {
          const v = getTileVertices(deposit.x, deposit.y, this.config);

          ctx.beginPath();
          ctx.moveTo(v.top.x, v.top.y);
          ctx.lineTo(v.right.x, v.right.y);
          ctx.lineTo(v.bottom.x, v.bottom.y);
          ctx.lineTo(v.left.x, v.left.y);
          ctx.closePath();
          ctx.fillStyle = 'rgba(78, 201, 176, 0.28)';
          ctx.fill();
          ctx.strokeStyle = '#4ec9b0';
          ctx.lineWidth = 1.8;
          ctx.stroke();

          // Subtle ore diamond badge
          ctx.fillStyle = '#7fd4e0';
          ctx.font = 'bold 9px "Orbitron", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('◆ ORE', v.center.x, v.center.y);
        }
      }
    }
  }

  /**
   * Renders placed buildings, colonists, rovers, asteroids, and landing zone pending arrivals sorted back-to-front by depth (x + y).
   */
  private renderEntities(ctx: CanvasRenderingContext2D): void {
    const state = this.store.getState();
    const isPowered = state.power > 0;
    const halfW = this.config.tileWidth / 2;
    const halfH = this.config.tileHeight / 2;

    // Combined entity list for unified depth sorting
    type RenderItem =
      | { kind: 'building'; x: number; y: number; building: typeof state.buildings[0] }
      | { kind: 'colonist'; x: number; y: number; colonist: typeof state.colonists[0] }
      | { kind: 'rover'; x: number; y: number; rover: typeof state.rovers[0] }
      | { kind: 'asteroid'; x: number; y: number; asteroid: typeof state.activeAsteroid };

    const entities: RenderItem[] = [
      ...state.buildings.map((b) => ({ kind: 'building' as const, x: b.x, y: b.y, building: b })),
      ...state.colonists.map((c) => ({ kind: 'colonist' as const, x: c.x, y: c.y, colonist: c })),
      ...state.rovers
        .filter((r) => r.state !== 'idle_at_base')
        .map((r) => ({ kind: 'rover' as const, x: r.x, y: r.y, rover: r })),
    ];

    if (state.activeAsteroid) {
      entities.push({
        kind: 'asteroid',
        x: state.activeAsteroid.x,
        y: state.activeAsteroid.y,
        asteroid: state.activeAsteroid,
      });
    }

    // Depth sort entities back-to-front by isometric distance (x + y)
    entities.sort((a, b) => {
      const depthA = a.x + a.y;
      const depthB = b.x + b.y;
      if (depthA !== depthB) {
        return depthA - depthB;
      }
      return a.y - b.y;
    });

    for (const item of entities) {
      if (item.kind === 'building') {
        const b = item.building;
        const isOperational = b.condition === 'operational';
        const tileDeposit = this.store.getTileOre(b.x, b.y);

        let isProducing = false;
        let dockedRovers = 2;

        if (b.type === 'garage') {
          dockedRovers = state.rovers.filter((r) => r.state === 'idle_at_base' && r.garageX === b.x && r.garageY === b.y).length;
        }

        if (isOperational) {
          if (b.type === 'solar') isProducing = isPowered;
          else if (b.type === 'scrubber') isProducing = state.power >= 3;
          else if (b.type === 'extractor') isProducing = tileDeposit > 0 && state.power >= 4;
          else if (b.type === 'farm') isProducing = state.power >= 2;
        }

        drawBuilding(ctx, {
          type: b.type,
          x: b.x,
          y: b.y,
          config: this.config,
          isPreview: false,
          isPowered: isPowered && isOperational,
          isProducing,
          dockedRovers,
        });

        // Condition overlay if broken or buried
        if (b.condition !== 'operational') {
          const v = getTileVertices(b.x, b.y, this.config);
          drawBuildingConditionOverlay(ctx, v.center, halfW, halfH, b.condition);
        }
      } else if (item.kind === 'colonist') {
        const c = item.colonist;
        const v = getTileVertices(c.x, c.y, this.config);
        drawColonist(ctx, v.center, c.health, c.age, c.lifespan, halfW);
      } else if (item.kind === 'rover') {
        const r = item.rover;
        const v = getTileVertices(r.x, r.y, this.config);
        const occupants = r.occupants ?? (r.state === 'idle_at_base' ? 0 : 1);
        drawRover(ctx, v.center, r.power, occupants, halfW);
      } else if (item.kind === 'asteroid') {
        const a = item.asteroid!;
        const v = getTileVertices(a.x, a.y, this.config);
        drawAsteroid(ctx, v.center, halfW, halfH);
      }
    }

    // Render Landing Zone (0, 0) pending arrivals with compact lunar/mars landing capsule
    if (state.pendingArrivals.length > 0) {
      const v0 = getTileVertices(0, 0, this.config);
      const arrival = state.pendingArrivals[0];
      drawLandingCapsule(ctx, v0.center, halfW, halfH, arrival.ticksRemaining);
    }
  }

  private renderHoverHighlight(ctx: CanvasRenderingContext2D): void {
    const state = this.store.getState();

    // 1. Draw Selection Highlight around currently selected building or Landing Pad
    if (this.selectedBuildingId) {
      if (this.selectedBuildingId === 'landing_pad') {
        const sv = getTileVertices(0, 0, this.config);
        const hasArrival = state.pendingArrivals.length > 0;
        const mainColor = hasArrival ? '#E0A030' : '#4ec9b0';
        const fillColor = hasArrival ? 'rgba(224, 160, 48, 0.25)' : 'rgba(78, 201, 176, 0.25)';

        ctx.beginPath();
        ctx.moveTo(sv.top.x, sv.top.y);
        ctx.lineTo(sv.right.x, sv.right.y);
        ctx.lineTo(sv.bottom.x, sv.bottom.y);
        ctx.lineTo(sv.left.x, sv.left.y);
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 2.2;
        ctx.stroke();
      }

      const selectedBld = state.buildings.find((b) => b.id === this.selectedBuildingId);
      if (selectedBld) {
        const sv = getTileVertices(selectedBld.x, selectedBld.y, this.config);
        const halfW = this.config.tileWidth / 2;
        const s = halfW / 32;
        const isDeact = selectedBld.condition === 'deactivated';
        const isBroken = selectedBld.condition === 'broken';
        const isBuried = selectedBld.condition === 'buried';

        const mainColor = isDeact ? '#E0A030' : isBroken ? '#D94F3D' : isBuried ? '#fbbf24' : '#4ec9b0';
        const fillColor = isDeact ? 'rgba(224, 160, 48, 0.25)' : isBroken ? 'rgba(217, 79, 61, 0.25)' : 'rgba(78, 201, 176, 0.25)';

        // Base tile highlight
        ctx.beginPath();
        ctx.moveTo(sv.top.x, sv.top.y);
        ctx.lineTo(sv.right.x, sv.right.y);
        ctx.lineTo(sv.bottom.x, sv.bottom.y);
        ctx.lineTo(sv.left.x, sv.left.y);
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 2.2;
        ctx.stroke();

        // 3D Corner Brackets around structure
        let heightPx = 36;
        if (selectedBld.type === 'scrubber') heightPx = 55;
        else if (selectedBld.type === 'solar') heightPx = 45;
        else if (selectedBld.type === 'refinery') heightPx = 48;
        else if (selectedBld.type === 'extractor') heightPx = 42;
        else if (selectedBld.type === 'habitat') heightPx = 38;
        else if (selectedBld.type === 'farm') heightPx = 32;
        else if (selectedBld.type === 'garage') heightPx = 32;

        const boxTop = sv.top.y - heightPx * s;
        const boxLeft = sv.center.x - halfW * 0.9;
        const boxRight = sv.center.x + halfW * 0.9;
        const boxBottom = sv.bottom.y;
        const bracketLen = 8 * s;

        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 1.8;

        // Top-left bracket
        ctx.beginPath();
        ctx.moveTo(boxLeft, boxTop + bracketLen);
        ctx.lineTo(boxLeft, boxTop);
        ctx.lineTo(boxLeft + bracketLen, boxTop);
        ctx.stroke();

        // Top-right bracket
        ctx.beginPath();
        ctx.moveTo(boxRight - bracketLen, boxTop);
        ctx.lineTo(boxRight, boxTop);
        ctx.lineTo(boxRight, boxTop + bracketLen);
        ctx.stroke();

        // Bottom-left bracket
        ctx.beginPath();
        ctx.moveTo(boxLeft, boxBottom - bracketLen);
        ctx.lineTo(boxLeft, boxBottom);
        ctx.lineTo(boxLeft + bracketLen, boxBottom);
        ctx.stroke();

        // Bottom-right bracket
        ctx.beginPath();
        ctx.moveTo(boxRight - bracketLen, boxBottom);
        ctx.lineTo(boxRight, boxBottom);
        ctx.lineTo(boxRight, boxBottom - bracketLen);
        ctx.stroke();

        // Floating status tag above structure
        const tagText = isDeact ? '⚡ POWER OFF' : isBroken ? '⚠ BROKEN' : isBuried ? '▼ BURIED' : '● POWER ON';
        ctx.font = `bold ${Math.max(9, Math.floor(10 * s))}px 'Share Tech Mono', monospace`;
        const textMetrics = ctx.measureText(tagText);
        const tagW = textMetrics.width + 12 * s;
        const tagH = 15 * s;
        const tagX = sv.center.x - tagW / 2;
        const tagY = boxTop - tagH - 4 * s;

        ctx.fillStyle = 'rgba(18, 9, 5, 0.9)';
        ctx.fillRect(tagX, tagY, tagW, tagH);
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(tagX, tagY, tagW, tagH);

        ctx.fillStyle = mainColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tagText, sv.center.x, tagY + tagH / 2);
      }
    }

    if (!this.hoveredTile) return;

    const { x, y } = this.hoveredTile;
    const v = getTileVertices(x, y, this.config);

    ctx.beginPath();
    ctx.moveTo(v.top.x, v.top.y);
    ctx.lineTo(v.right.x, v.right.y);
    ctx.lineTo(v.bottom.x, v.bottom.y);
    ctx.lineTo(v.left.x, v.left.y);
    ctx.closePath();

    // 2. Relocation Mode Highlight
    if (this.relocatingBuildingId) {
      const relocatingBld = state.buildings.find((b) => b.id === this.relocatingBuildingId);
      const isOccupied = state.buildings.some((b) => b.x === x && b.y === y);
      const isReserved = x === 0 && y === 0;
      const canRelocate = !isOccupied && !isReserved && state.power >= 10;

      if (!canRelocate) {
        ctx.fillStyle = 'rgba(217, 79, 61, 0.25)';
        ctx.fill();
        ctx.strokeStyle = '#D94F3D';
        ctx.lineWidth = 1.8;
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(78, 201, 176, 0.2)';
        ctx.fill();
        ctx.strokeStyle = '#4ec9b0';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        if (relocatingBld) {
          drawBuilding(ctx, {
            type: relocatingBld.type,
            x,
            y,
            config: this.config,
            isPreview: true,
          });
        }
      }
      return;
    }

    // 3. Placement Tool Mode Highlight
    if (this.selectedTool) {
      const check = this.store.checkPlacement(this.selectedTool, x, y);

      if (!check.canPlace) {
        ctx.fillStyle = 'rgba(217, 79, 61, 0.25)';
        ctx.fill();
        ctx.strokeStyle = '#D94F3D';
        ctx.lineWidth = 1.8;
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(217, 221, 224, 0.12)';
        ctx.fill();
        ctx.strokeStyle = '#d9dde0';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        drawBuilding(ctx, {
          type: this.selectedTool,
          x,
          y,
          config: this.config,
          isPreview: true,
        });
      }
    } else {
      ctx.fillStyle = 'rgba(217, 221, 224, 0.12)';
      ctx.fill();
      ctx.strokeStyle = '#8c9ba5';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
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
