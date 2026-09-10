import { state as modelState } from './model-preview-state';
import { SeededPRNG } from './simulation/prng';
import type { Building, BuildingType, ColonyState } from './simulation/types';

// Decorative fixture, never loaded into the colony store or sent to the server.
// A separate seed keeps this layout stable while the login overlay opens.
const random = new SeededPRNG(41827);
const types: BuildingType[] = ['habitat', 'solar', 'farm', 'scrubber', 'habitat', 'solar', 'garage', 'extractor', 'refinery'];
const buildings: Building[] = [];
for (let attempt = 0; attempt < 500 && buildings.length < 26; attempt++) {
  const x = random.nextInt(4, 15), y = random.nextInt(4, 15);
  if (Math.hypot(x - 9.5, y - 9.5) > 6 || buildings.some(b => Math.abs(b.x - x) + Math.abs(b.y - y) < 2)) continue;
  buildings.push({ id: `home-${buildings.length}`, type: types[buildings.length % types.length], x, y, condition: 'operational', repairProgress: 0, digProgress: 0 });
}
const openTiles: { x: number; y: number }[] = [];
for (let x = 5; x <= 14; x++) for (let y = 6; y <= 14; y++) {
  if (!buildings.some(b => b.x === x && b.y === y)) openTiles.push({ x, y });
}
const vehicleTiles = [openTiles[8], openTiles[28], openTiles[48]];
export const homePreviewState: ColonyState = {
  ...modelState,
  buildings,
  pendingArrivals: [],
  activeAsteroid: null,
  miningSites: [],
  oreDeposits: buildings.filter(b => b.type === 'extractor').map(b => ({ x: b.x, y: b.y, remaining: 100 })),
  colonists: modelState.colonists.map((c, i) => ({ ...c, x: 8 + i, y: 10, health: 100, age: 0 })),
  rovers: modelState.rovers.map((r, i) => ({ ...r, ...vehicleTiles[i] })),
};
