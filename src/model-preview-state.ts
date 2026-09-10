import type { ColonyState, BuildingType, BuildingCondition } from "./simulation/types";
const types: BuildingType[] = [
  "habitat",
  "solar",
  "scrubber",
  "farm",
  "garage",
  "refinery",
  "extractor",
];
// An isolated, static display fixture. No auth, store, tick, or network is imported.
export const state: ColonyState = {
  tick: 0,
  oxygen: 100,
  power: 100,
  food: 100,
  ore: 25,
  electronics: 2,
  seed: 1,
  oreDeposits: [{ x: 16, y: 4, remaining: 100 }],
  buildings: (["operational", "broken", "buried", "deactivated"] as BuildingCondition[]).flatMap((condition, row) => types.map((type, i) => ({
    id: row === 0 ? type : `${type}-${condition}`,
    type, x: 4 + i * 2, y: 4 + row * 3, condition,
    repairProgress: 0, digProgress: 0,
  }))),
  colonists: [
    {
      id: "suit",
      x: 7,
      y: 7,
      health: 100,
      age: 0,
      lifespan: 8000,
      destination: null,
      destinationType: null,
      targetEntityId: null,
      route: [],
    },
    {
      id: "veteran",
      x: 9,
      y: 7,
      health: 65,
      age: 7000,
      lifespan: 8000,
      destination: null,
      destinationType: null,
      targetEntityId: null,
      route: [],
    },
  ],
  rovers: [
    {
      id: "rover",
      garageX: 8,
      garageY: 8,
      x: 9,
      y: 9,
      state: "idle_at_base",
      power: 100,
      cargo: null,
      destination: null,
      onSiteTicksRemaining: 0,
      route: [],
      occupants: 2,
    },
  ],
  pendingArrivals: [{ id: "preview-arrival", landedAtTick: 0, electronics: 2, ticksRemaining: 150 }],
  batteryCells: [],
  miningSites: [{ id: "mine", x: 12, y: 8, yield: 100, remaining: 100 }],
  activeAsteroid: {
    id: "meteor",
    x: 14,
    y: 17,
    yield: 100,
    expiresAtTick: 1000,
  },
  signedInAccount: "",
  colonyOwner: "",
  status: "active",
  bestSolsSurvived: 0,
  lastAppliedTick: "Never",
};

export const showcaseAnnotations = [
  ...types.map((type, i) => ({ x: 4 + i * 2, y: 2.5, text: type.toUpperCase() })),
  ...["OPERATIONAL", "BROKEN", "BURIED", "POWER OFF"].map((text, i) => ({ x: 1, y: 4 + i * 3, text })),
];
// All three seating configurations are visible side by side.
state.rovers = [0, 1, 2].map(occupants => ({ ...state.rovers[0], id: `rover-${occupants}`, x: 5 + occupants * 2, y: 17, occupants }));
