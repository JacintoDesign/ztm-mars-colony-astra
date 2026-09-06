export interface IsoConfig {
  gridSize: number;
  tileWidth: number;
  tileHeight: number;
  originX: number;
  originY: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface GridPoint {
  x: number;
  y: number;
}

export interface TileVertices {
  top: ScreenPoint;
  right: ScreenPoint;
  bottom: ScreenPoint;
  left: ScreenPoint;
  center: ScreenPoint;
}

/**
 * Checks whether a given grid coordinate lies within the grid boundary.
 */
export function isInGrid(gx: number, gy: number, gridSize: number): boolean {
  return Number.isInteger(gx) && Number.isInteger(gy) && gx >= 0 && gx < gridSize && gy >= 0 && gy < gridSize;
}

/**
 * Computes the top vertex screen coordinates for a tile at grid position (gx, gy).
 */
export function gridToScreen(gx: number, gy: number, config: IsoConfig): ScreenPoint {
  const halfWidth = config.tileWidth / 2;
  const halfHeight = config.tileHeight / 2;
  return {
    x: config.originX + (gx - gy) * halfWidth,
    y: config.originY + (gx + gy) * halfHeight,
  };
}

/**
 * Computes all four diamond vertices and the center point for a tile at (gx, gy).
 */
export function getTileVertices(gx: number, gy: number, config: IsoConfig): TileVertices {
  const top = gridToScreen(gx, gy, config);
  const halfWidth = config.tileWidth / 2;
  const halfHeight = config.tileHeight / 2;

  return {
    top,
    right: { x: top.x + halfWidth, y: top.y + halfHeight },
    bottom: { x: top.x, y: top.y + config.tileHeight },
    left: { x: top.x - halfWidth, y: top.y + halfHeight },
    center: { x: top.x, y: top.y + halfHeight },
  };
}

/**
 * Converts screen pixel coordinates to discrete grid coordinates (gx, gy).
 * Returns null if the coordinates fall outside the grid bounds.
 */
export function screenToGrid(screenX: number, screenY: number, config: IsoConfig): GridPoint | null {
  const dx = screenX - config.originX;
  const dy = screenY - config.originY;

  const continuousX = dx / config.tileWidth + dy / config.tileHeight;
  const continuousY = dy / config.tileHeight - dx / config.tileWidth;

  const gx = Math.floor(continuousX);
  const gy = Math.floor(continuousY);

  if (!isInGrid(gx, gy, config.gridSize)) {
    return null;
  }

  return { x: gx, y: gy };
}

/**
 * Sorts grid items back-to-front by isometric depth (gx + gy ascending).
 * Ensures correct visual layering and occlusion.
 */
export function sortBackToFront<T extends { x: number; y: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const depthA = a.x + a.y;
    const depthB = b.x + b.y;
    if (depthA !== depthB) {
      return depthA - depthB;
    }
    return a.x - b.x;
  });
}
