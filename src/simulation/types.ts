import {
  BuildingType,
  BuildingCondition,
  ColonistDestinationType,
  RoverState,
  RoverDestinationType,
  CONTRACT_RULES,
} from './contract-rules';

export type {
  BuildingType,
  BuildingCondition,
  ColonistDestinationType,
  RoverState,
  RoverDestinationType,
};

export interface BuildingCost {
  power: number;
  ore: number;
  electronics: number;
}

export const BUILDING_COSTS: Record<BuildingType, BuildingCost> = {
  habitat: { ...CONTRACT_RULES.buildings.habitat.cost },
  solar: { ...CONTRACT_RULES.buildings.solar.cost },
  scrubber: { ...CONTRACT_RULES.buildings.scrubber.cost },
  extractor: { ...CONTRACT_RULES.buildings.extractor.cost },
  farm: { ...CONTRACT_RULES.buildings.farm.cost },
  garage: { ...CONTRACT_RULES.buildings.garage.cost },
  refinery: { ...CONTRACT_RULES.buildings.refinery.cost },
};

export interface Building {
  id: string;
  type: BuildingType;
  x: number;
  y: number;
  condition: BuildingCondition;
  repairProgress: number; // ticks completed toward 50
  digProgress: number; // ticks completed toward 100
  wasBrokenBeforeBurial?: boolean;
}

export interface GridCoord {
  x: number;
  y: number;
}

export interface Colonist {
  id: string;
  x: number;
  y: number;
  health: number;
  age: number; // in ticks
  lifespan: number; // in ticks, seeded 12,000–18,000
  moveProgress?: number; // 0 to 4 ticks progress toward next tile step (5 ticks per tile)
  destination: GridCoord | null;
  destinationType: ColonistDestinationType | null;
  targetEntityId: string | null; // building id or rover id
  route: GridCoord[];
}

export type RoverCargo =
  | { type: 'ore'; amount: number }
  | { type: 'arrival'; arrivalId: string; electronics: number }
  | null;

export interface RoverDestination {
  type: RoverDestinationType;
  x: number;
  y: number;
  onSiteTicksTotal: number;
  targetId?: string;
}

export interface Rover {
  id: string;
  garageX: number;
  garageY: number;
  x: number;
  y: number;
  state: RoverState;
  power: number; // 0-150
  cargo: RoverCargo;
  destination: RoverDestination | null;
  onSiteTicksRemaining: number;
  route: GridCoord[];
  occupants?: number;
}

export interface OreDeposit {
  id?: string;
  x: number;
  y: number;
  remaining: number;
}

export interface PendingArrival {
  id: string;
  landedAtTick: number;
  electronics: number;
  ticksRemaining: number; // starts at 150, counts down to 0
}

export interface BatteryCell {
  id: string;
  efficiency: number; // starts at 100, decays by 1/tick
}

export interface MiningSite {
  id: string;
  x: number;
  y: number;
  yield: number;
  remaining: number;
}

export interface Asteroid {
  id: string;
  x: number;
  y: number;
  yield: number;
  expiresAtTick: number;
}

export type ColonyStatus = 'active' | 'game_over';

export interface ColonyState {
  colonyId?: string;
  tick: number;
  oxygen: number;
  power: number;
  food: number;
  ore: number;
  electronics: number;
  seed: number;
  oreDeposits: OreDeposit[];
  buildings: Building[];
  colonists: Colonist[];
  pendingArrivals: PendingArrival[];
  rovers: Rover[];
  batteryCells: BatteryCell[];
  miningSites: MiningSite[];
  activeAsteroid: Asteroid | null;
  signedInAccount: string;
  colonyOwner: string;
  status: ColonyStatus;
  gameOverReason?: string;
  bestSolsSurvived: number;
  lastAppliedTick: string;
  lastTickAtIso?: string;
}

export interface PlacementCheckResult {
  canPlace: boolean;
  reason?: string;
  cost: BuildingCost;
}

export type SimulationAction =
  | {
      type: 'PLACE_BUILDING';
      buildingType: BuildingType;
      x: number;
      y: number;
    }
  | {
      type: 'REFINE_CELL';
    }
  | {
      type: 'DISPATCH_ROVER';
      roverId: string;
      destinationType: RoverDestinationType;
      targetTile?: GridCoord;
      targetArrivalId?: string;
    }
  | {
      type: 'RESTART_COLONY';
    }
  | {
      type: 'TOGGLE_BUILDING_POWER';
      buildingId: string;
    }
  | {
      type: 'MOVE_BUILDING';
      buildingId: string;
      targetX: number;
      targetY: number;
    }
  | {
      type: 'ASSIGN_COLONIST_MAINTENANCE';
      buildingId: string;
    }
  | {
      type: 'DESTROY_BUILDING';
      buildingId: string;
    };
