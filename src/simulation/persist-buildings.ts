import { Building, BuildingCondition, BuildingType } from './types';

/** Stored in dig_progress so construction survives databases that reject condition='constructing'. */
export const CONSTRUCTION_DIG_OFFSET = 1000;

export interface BuildingRow {
  id: string;
  type: string;
  x: number;
  y: number;
  condition?: string;
  repair_progress?: number;
  dig_progress?: number;
  was_broken_before_burial?: boolean;
}

export function buildingFromRow(row: BuildingRow): Building {
  const dig = row.dig_progress ?? 0;
  const isNativeConstructing = row.condition === 'constructing';
  const isShimConstructing = row.condition === 'operational' && dig >= CONSTRUCTION_DIG_OFFSET;
  if (isNativeConstructing || isShimConstructing) {
    return {
      id: row.id,
      type: row.type as BuildingType,
      x: row.x,
      y: row.y,
      condition: 'constructing',
      repairProgress: isNativeConstructing ? (row.repair_progress ?? 0) : dig - CONSTRUCTION_DIG_OFFSET,
      digProgress: isNativeConstructing ? dig : 0,
      wasBrokenBeforeBurial: false,
    };
  }
  return {
    id: row.id,
    type: row.type as BuildingType,
    x: row.x,
    y: row.y,
    condition: (row.condition as BuildingCondition) ?? 'operational',
    repairProgress: row.repair_progress ?? 0,
    digProgress: dig,
    wasBrokenBeforeBurial: row.was_broken_before_burial ?? false,
  };
}

export function buildingPersistFields(building: Building): {
  condition: string;
  repair_progress: number;
  dig_progress: number;
  was_broken_before_burial: boolean;
} {
  if (building.condition === 'constructing') {
    return {
      condition: 'operational',
      repair_progress: 0,
      dig_progress: CONSTRUCTION_DIG_OFFSET + building.repairProgress,
      was_broken_before_burial: false,
    };
  }
  return {
    condition: building.condition,
    repair_progress: building.repairProgress,
    dig_progress: building.digProgress,
    was_broken_before_burial: building.wasBrokenBeforeBurial ?? false,
  };
}

export function persistableDestinationType(
  destinationType: string | null
): string | null {
  if (destinationType === 'construct') return 'repair';
  return destinationType;
}
