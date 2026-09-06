import { Building, Colonist, GridCoord } from './types';

/**
 * Checks if a coordinate is within the grid boundary.
 */
export function isInsideGrid(x: number, y: number, gridSize = 20): boolean {
  return x >= 0 && x < gridSize && y >= 0 && y < gridSize;
}

/**
 * Finds all valid, unblocked adjacent tiles around a target structure coordinate.
 * Adjacent tiles are orthogonal neighbors (N, E, S, W).
 */
export function getFreeAdjacentTiles(
  target: GridCoord,
  blockedTiles: Set<string>,
  gridSize = 20
): GridCoord[] {
  // Deterministic neighbor order: North, East, South, West
  const directions: GridCoord[] = [
    { x: 0, y: -1 }, // North
    { x: 1, y: 0 },  // East
    { x: 0, y: 1 },  // South
    { x: -1, y: 0 }, // West
  ];

  const validAdjacent: GridCoord[] = [];
  for (const dir of directions) {
    const ax = target.x + dir.x;
    const ay = target.y + dir.y;
    if (isInsideGrid(ax, ay, gridSize) && !blockedTiles.has(`${ax},${ay}`)) {
      validAdjacent.push({ x: ax, y: ay });
    }
  }
  return validAdjacent;
}

/**
 * Finds the shortest path from start to any of the goal coordinates using Breadth-First Search (BFS).
 * Fixed exploration direction order (North, East, South, West) guarantees deterministic tie-breaking.
 * Buildings block movement and are never traversed.
 * Returns an array of waypoints representing sequential steps [step1, step2, ...] or [] if unreachable.
 */
export function findShortestRoute(
  start: GridCoord,
  goalTiles: GridCoord[],
  blockedTiles: Set<string>,
  gridSize = 20
): GridCoord[] {
  if (goalTiles.length === 0) return [];

  const goalKeys = new Set(goalTiles.map((g) => `${g.x},${g.y}`));

  // If already at one of the goal tiles, no movement needed
  if (goalKeys.has(`${start.x},${start.y}`)) {
    return [];
  }

  // BFS Queue
  const queue: GridCoord[] = [start];
  const visited = new Set<string>([`${start.x},${start.y}`]);
  const parentMap = new Map<string, GridCoord>();

  const directions: GridCoord[] = [
    { x: 0, y: -1 }, // North
    { x: 1, y: 0 },  // East
    { x: 0, y: 1 },  // South
    { x: -1, y: 0 }, // West
  ];

  let reachedGoal: GridCoord | null = null;

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentKey = `${current.x},${current.y}`;

    if (goalKeys.has(currentKey)) {
      reachedGoal = current;
      break;
    }

    for (const dir of directions) {
      const nextX = current.x + dir.x;
      const nextY = current.y + dir.y;
      const nextKey = `${nextX},${nextY}`;

      if (
        isInsideGrid(nextX, nextY, gridSize) &&
        !visited.has(nextKey) &&
        !blockedTiles.has(nextKey)
      ) {
        visited.add(nextKey);
        parentMap.set(nextKey, current);
        queue.push({ x: nextX, y: nextY });
      }
    }
  }

  if (!reachedGoal) {
    // Unreachable: stay put
    return [];
  }

  // Reconstruct path from start to reachedGoal
  const path: GridCoord[] = [];
  let curr: GridCoord | undefined = reachedGoal;
  while (curr && (curr.x !== start.x || curr.y !== start.y)) {
    path.unshift(curr);
    curr = parentMap.get(`${curr.x},${curr.y}`);
  }

  return path;
}

/**
 * Finds the nearest habitat structure with unclaimed capacity (< 2 colonists).
 * Claims are tracked based on colonist destination assignments.
 */
export function findNearestAvailableHabitat(
  origin: GridCoord,
  buildings: Building[],
  currentColonists: Colonist[]
): Building | null {
  const habitats = buildings.filter((b) => b.type === 'habitat');
  if (habitats.length === 0) return null;

  // Count existing claims per habitat
  const claims = new Map<string, number>();
  for (const c of currentColonists) {
    if (c.destination) {
      const key = `${c.destination.x},${c.destination.y}`;
      claims.set(key, (claims.get(key) || 0) + 1);
    }
  }

  // Filter habitats with available capacity (< 2)
  const availableHabitats = habitats.filter((h) => {
    const key = `${h.x},${h.y}`;
    return (claims.get(key) || 0) < 2;
  });

  if (availableHabitats.length === 0) {
    return null;
  }

  // Sort deterministically: Manhattan distance, then lowest x, then lowest y, then id
  availableHabitats.sort((a, b) => {
    const distA = Math.abs(a.x - origin.x) + Math.abs(a.y - origin.y);
    const distB = Math.abs(b.x - origin.x) + Math.abs(b.y - origin.y);
    if (distA !== distB) return distA - distB;
    if (a.x !== b.x) return a.x - b.x;
    if (a.y !== b.y) return a.y - b.y;
    return a.id.localeCompare(b.id);
  });

  return availableHabitats[0];
}
