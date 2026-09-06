import { SeededPRNG } from './prng';
import { OreDeposit, MiningSite } from './types';

/**
 * Generates the deterministic 500-total ore distribution across 15–25 grid tiles
 * and extracts the 3 largest distant deposits as the fixed Mining Sites per CONTRACT.md.
 */
export function generateOreDistribution(prng: SeededPRNG, gridSize = 20): {
  oreDeposits: OreDeposit[];
  miningSites: MiningSite[];
} {
  const numDeposits = prng.nextInt(15, 25);
  const totalOreToDistribute = 500;
  const depositMap = new Map<string, number>();

  // Landing zone tile (0, 0) is reserved
  const reservedTiles = new Set<string>(['0,0']);

  // We want:
  // 1. 3 large deposits placed far from (0,0) with Manhattan distance >= 18 (e.g. x >= 10, y >= 10)
  // 2. At least one tile holding as little as 1 ore
  // 3. The remainder distributed across the remaining (numDeposits - 4) tiles

  // Step 1: Pick 3 distant mining site tiles
  const miningSiteTiles: Array<{ x: number; y: number }> = [];
  while (miningSiteTiles.length < 3) {
    const x = prng.nextInt(10, gridSize - 1);
    const y = prng.nextInt(10, gridSize - 1);
    const key = `${x},${y}`;
    if (!reservedTiles.has(key) && !depositMap.has(key)) {
      miningSiteTiles.push({ x, y });
      depositMap.set(key, 0);
    }
  }

  // Step 2: Pick remaining tiles across the map
  const normalTiles: Array<{ x: number; y: number }> = [];
  while (normalTiles.length < numDeposits - 3) {
    const x = prng.nextInt(0, gridSize - 1);
    const y = prng.nextInt(0, gridSize - 1);
    const key = `${x},${y}`;
    if (!reservedTiles.has(key) && !depositMap.has(key)) {
      normalTiles.push({ x, y });
      depositMap.set(key, 0);
    }
  }

  // Step 3: Allocate large amounts to the 3 mining sites (e.g., 70-90 each)
  let remainingOre = totalOreToDistribute;
  const siteAmounts: number[] = [];
  for (let i = 0; i < 3; i++) {
    const amt = prng.nextInt(75, 95);
    siteAmounts.push(amt);
    remainingOre -= amt;
  }

  // Step 4: Ensure at least one tile gets exactly 1 ore
  const tinyTile = normalTiles[0];
  depositMap.set(`${tinyTile.x},${tinyTile.y}`, 1);
  remainingOre -= 1;

  // Step 5: Distribute remaining ore unevenly across remaining normal tiles
  const otherTiles = normalTiles.slice(1);
  for (let i = 0; i < otherTiles.length; i++) {
    const isLast = i === otherTiles.length - 1;
    let amt = 0;
    if (isLast) {
      amt = Math.max(1, remainingOre);
    } else {
      const avg = Math.floor(remainingOre / (otherTiles.length - i));
      amt = Math.max(1, prng.nextInt(Math.max(1, avg - 8), avg + 8));
      amt = Math.min(amt, remainingOre - (otherTiles.length - i - 1));
    }
    remainingOre -= amt;
    depositMap.set(`${otherTiles[i].x},${otherTiles[i].y}`, amt);
  }

  // Assign the site amounts
  for (let i = 0; i < 3; i++) {
    depositMap.set(`${miningSiteTiles[i].x},${miningSiteTiles[i].y}`, siteAmounts[i]);
  }

  // Format deposits
  const oreDeposits: OreDeposit[] = [];
  depositMap.forEach((remaining, key) => {
    const [xStr, yStr] = key.split(',');
    oreDeposits.push({
      id: `dep-${key}`,
      x: parseInt(xStr, 10),
      y: parseInt(yStr, 10),
      remaining,
    });
  });

  // Format mining sites
  const miningSites: MiningSite[] = miningSiteTiles.map((tile, idx) => {
    const yieldPerTick = 4 + idx; // 4, 5, 6 ore per mining tick
    return {
      id: `site-${idx + 1}`,
      x: tile.x,
      y: tile.y,
      yield: yieldPerTick,
      remaining: depositMap.get(`${tile.x},${tile.y}`) ?? 80,
    };
  });

  return { oreDeposits, miningSites };
}
