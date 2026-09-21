import './style.css';
import { homePreviewState as modelPreviewState } from './home-preview-state';
import { ColonyStore } from './simulation/store';
import { InternalReadout } from './ui/internal-readout';
import { Toolbar } from './ui/toolbar';
import { ResourcePanel } from './ui/resource-panel';
import { HelpModal } from './ui/help-modal';
import { GameSettings } from './ui/game-settings';
import { nextAutopilotAction } from './simulation/autopilot';
import { IsometricRenderer } from './engine/renderer';
import { AuthModal } from './ui/auth-modal';
import { HeaderBar } from './ui/header-bar';
import { GameOverModal } from './ui/game-over-modal';
import { TelemetryBanner } from './ui/telemetry-banner';
import { BuildingInspector } from './ui/building-inspector';
import { MissionAdvisor } from './ui/mission-advisor';
import { authManager, AuthState } from './services/auth-manager';
import { colonyService } from './services/colony-service';
import type { ColonyData } from './services/colony-service';
import { CONTRACT_RULES } from './simulation/contract-rules';
import type { SimulationAction } from './simulation/types';
import { RealtimeChannel } from '@supabase/supabase-js';

// Initialize simulation store
const store = new ColonyStore();

// Initialize telemetry readout and resource panel
const readout = new InternalReadout();
readout.update(store.getState());

const resourcePanel = new ResourcePanel();
resourcePanel.updateFromState(store.getState());

// Initialize help modal with simulation pausing callbacks
const helpModal = new HelpModal({
  onOpen: () => {
    stopSimulationLoops();
    toolbar.setStatus('Simulation Paused (Reviewing Manual)', 'warning');
    void enqueueTickSync(() => flushAuthoritativeTicks());
  },
  onClose: async () => {
    if (gameSettings.isModalOpen()) return;
    if (activeUserId && activeColonyId && store.getState().status === 'active') {
      try {
        await colonyService.updateLastTickTime(activeColonyId, activeUserId);
      } catch (err) {
        console.warn('Failed to update tick timestamp on manual close:', err);
      }
      applySessionStatus();
      startSimulationLoops(activeUserId);
    }
  },
});

const gameSettings = new GameSettings({
  onOpenHelp: () => helpModal.open(),
  onOpen: () => {
    stopSimulationLoops();
    toolbar.setStatus('Simulation Paused (Settings)', 'warning');
    void enqueueTickSync(() => flushAuthoritativeTicks());
  },
  onClose: async () => {
    if (helpModal.isModalOpen()) return;
    if (activeUserId && activeColonyId && store.getState().status === 'active') {
      try {
        await colonyService.updateLastTickTime(activeColonyId, activeUserId);
      } catch (err) {
        console.warn('Failed to freeze tick clock on settings close:', err);
      }
      applySessionStatus();
      startSimulationLoops(activeUserId);
    }
  },
  onChange: (settings) => {
    if (settings.autopilot) {
      lastAutopilotTick = store.getState().tick - 3;
    }
    if (activeUserId && store.getState().status === 'active' && !isUiPaused()) {
      startSimulationLoops(activeUserId);
    }
    applySessionStatus();
  },
});
gameSettings.hideControls();

// Dedicated action handlers invoked from contextual Building Inspector Cards & Map Beacons
const handleRefineCell = async () => {
  if (!activeColonyId || !activeUserId) return;
  const res = await executeAndReconcileAction({ type: 'REFINE_CELL' });
  if (res.success) {
    toolbar.setStatus('Cell Refined (+1 Battery Cell)', 'nominal');
  } else {
    toolbar.setStatus(res.reason ? `Refine Failed: ${res.reason}` : 'Refine Failed', 'warning');
  }
};

const handleDispatchEscort = async () => {
  if (!activeColonyId || !activeUserId) return;
  const state = store.getState();
  const idleRover = state.rovers.find((r) => r.state === 'idle_at_base');
  if (!idleRover) {
    toolbar.setStatus('Escort Failed: No Idle Rovers (Build Garage & Fuel)', 'warning');
    return;
  }
  if (state.batteryCells.length === 0) {
    toolbar.setStatus('Escort Failed: No Battery Cells (Refine with 10 Ore)', 'warning');
    return;
  }

  const res = await executeAndReconcileAction({
    type: 'DISPATCH_ROVER',
    roverId: idleRover.id,
    destinationType: 'landing_zone',
  });

  if (res.success) {
    toolbar.setStatus('Rover Dispatched to Landing Zone (0,0)', 'nominal');
  } else {
    toolbar.setStatus(res.reason ? `Dispatch Failed: ${res.reason}` : 'Dispatch Failed', 'warning');
  }
};

const handleDispatchMining = async () => {
  if (!activeColonyId || !activeUserId) return;
  const state = store.getState();
  const idleRover = state.rovers.find((r) => r.state === 'idle_at_base');
  if (!idleRover) {
    toolbar.setStatus('Mining Failed: No Idle Rovers', 'warning');
    return;
  }
  if (state.batteryCells.length === 0) {
    toolbar.setStatus('Mining Failed: No Battery Cells (Refine with 10 Ore)', 'warning');
    return;
  }

  let destType: 'asteroid' | 'mining_site' = 'mining_site';
  let targetTile = state.miningSites.length > 0 ? { x: state.miningSites[0].x, y: state.miningSites[0].y } : { x: 15, y: 15 };

  if (state.activeAsteroid) {
    destType = 'asteroid';
    targetTile = { x: state.activeAsteroid.x, y: state.activeAsteroid.y };
  }

  const res = await executeAndReconcileAction({
    type: 'DISPATCH_ROVER',
    roverId: idleRover.id,
    destinationType: destType,
    targetTile,
  });

  if (res.success) {
    toolbar.setStatus(`Rover Dispatched to ${destType === 'asteroid' ? 'Asteroid' : 'Mining Site'}`, 'nominal');
  } else {
    toolbar.setStatus(res.reason ? `Dispatch Failed: ${res.reason}` : 'Dispatch Failed', 'warning');
  }
};

// Initialize dedicated telemetry banner
const telemetryBanner = new TelemetryBanner();

// Initialize intelligent mission advisor HUD banner
const missionAdvisor = new MissionAdvisor(store);

// Initialize building placement toolbar (focused cleanly on the 7 structures)
const toolbar = new Toolbar({
  containerId: 'toolbar',
  onSelectTool: (tool) => {
    renderer.setSelectedTool(tool);
  },
});

// Initialize canvas renderer
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
if (!canvas) {
  throw new Error('Game canvas element not found');
}

const renderer = new IsometricRenderer({
  canvas,
  store,
  gridSize: 20,
  onHoverTile: (tile) => {
    if (tile) {
      const tileOre = store.getTileOre(tile.x, tile.y);
      toolbar.setHoveredTile(tile, tileOre);
    } else {
      toolbar.setHoveredTile(null);
    }
  },
  onStatusChange: (message, level) => {
    toolbar.setStatus(message, level);
  },
  onSelectBuilding: (buildingId) => {
    if (buildingId) {
      buildingInspector.showBuilding(buildingId);
    } else if (buildingInspector.getSelectedBuildingId() !== null) {
      buildingInspector.hide();
    }
  },
  onToolDeselect: () => {
    toolbar.setTool(null);
  },
});

renderer.setPreviewState(modelPreviewState);

// Initialize Building Inspector Card with contextual facility management & direct power controls
const buildingInspector = new BuildingInspector({
  store,
  onTogglePower: (buildingId) => {
    renderer.toggleBuildingPower(buildingId);
  },
  onRelocate: (buildingId) => {
    renderer.startRelocateBuilding(buildingId);
  },
  onDemolish: async (buildingId) => {
    toolbar.setStatus('Demolishing Structure (-10 PWR)...', 'warning');
    const res = await store.dispatch({
      type: 'DESTROY_BUILDING',
      buildingId,
    });
    if (res.success) {
      toolbar.setStatus('Structure Demolished (-10 PWR)', 'nominal');
      if (renderer.getSelectedBuildingId() === buildingId) {
        renderer.setSelectedBuildingId(null);
      }
    } else {
      toolbar.setStatus(res.reason ? `Demolition Failed: ${res.reason}` : 'Demolition Failed', 'critical');
    }
  },
  onDispatchMaintenance: (buildingId) => {
    const res = store.dispatch({
      type: 'ASSIGN_COLONIST_MAINTENANCE',
      buildingId,
    });
    if (res.success) {
      toolbar.setStatus('Colonist Dispatched to Structure', 'nominal');
    } else {
      toolbar.setStatus(res.reason ? `Dispatch Failed: ${res.reason}` : 'Dispatch Failed', 'warning');
    }
  },
  onRefineCell: handleRefineCell,
  onDispatchEscort: handleDispatchEscort,
  onDispatchMining: handleDispatchMining,
  onClose: () => {
    if (renderer.getSelectedBuildingId() !== null) {
      renderer.setSelectedBuildingId(null);
    }
  },
});

// Expose on window for debugging & automated playtesting
(window as any).__COLONY_STORE__ = store;
(window as any).__COLONY_RENDERER__ = renderer;
(window as any).__COLONY_SERVICE__ = colonyService;
(window as any).__COLONY_RESOURCE_PANEL__ = resourcePanel;
(window as any).__COLONY_HELP_MODAL__ = helpModal;
(window as any).__COLONY_GAME_SETTINGS__ = gameSettings;
(window as any).__COLONY_TOOLBAR__ = toolbar;
(window as any).__COLONY_TELEMETRY_BANNER__ = telemetryBanner;
(window as any).__COLONY_MISSION_ADVISOR__ = missionAdvisor;
(window as any).__COLONY_BUILDING_INSPECTOR__ = buildingInspector;

// Active session tracking & timers
let activeUserId: string | null = null;
let activeColonyId: string | null = null;
let activeUserDisplay: string = 'none';
let isInitializingUserId: string | null = null;
let clientProjectionInterval: number | null = null;
let serverSyncInterval: number | null = null;
let serverSyncTimeout: number | null = null;
let realtimeChannel: RealtimeChannel | null = null;
let lastAutopilotTick = -1;
let lastPersistCheckpoint = 0;
let tickSyncChain: Promise<void> = Promise.resolve();

function enqueueTickSync(work: () => Promise<void>): Promise<void> {
  const run = tickSyncChain.then(work, work);
  tickSyncChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function isUiPaused(): boolean {
  return helpModal.isModalOpen() || gameSettings.isModalOpen();
}

function applySessionStatus(): void {
  if (helpModal.isModalOpen()) {
    toolbar.setStatus('Simulation Paused (Reviewing Manual)', 'warning');
    return;
  }
  if (gameSettings.isModalOpen()) {
    toolbar.setStatus('Simulation Paused (Settings)', 'warning');
    return;
  }
  const settings = gameSettings.getState();
  toolbar.setStatus(
    settings.autopilot ? `Autopilot Armed · ${settings.speed}×` : `Simulation Speed ${settings.speed}×`,
    'nominal'
  );
}

function persistTickOptions(): { speed: number; maxTicks: number; projectedTick: number } {
  const speed = gameSettings.getState().speed;
  const projectedTick = store.getState().tick;
  if (activeColonyId) {
    colonyService.rememberProjectedTick(activeColonyId, projectedTick);
  }
  return {
    speed,
    maxTicks: Math.max(CONTRACT_RULES.persistCheckpointTicks, speed * 8),
    projectedTick,
  };
}

function reconcileAuthoritativeData(
  data: ColonyData,
  options?: { allowRestart?: boolean }
): void {
  const projectedTickAtResponse = store.getState().tick;
  store.loadColonyData(data, activeUserDisplay, {
    authoritative: true,
    allowRestart: options?.allowRestart,
  });

  if (data.colony.status !== 'active' || options?.allowRestart) return;

  const authoritativeTick = data.colony.tick ?? 0;
  const projectedTicksInFlight = Math.max(0, projectedTickAtResponse - authoritativeTick);
  if (projectedTicksInFlight > 0 && store.getState().status === 'active') {
    store.advanceTicks(projectedTicksInFlight);
  }
}

async function executeAndReconcileAction(
  action: SimulationAction
): Promise<{ success: boolean; reason?: string }> {
  let result: { success: boolean; reason?: string } = {
    success: false,
    reason: 'No active session',
  };

  await enqueueTickSync(async () => {
    if (!activeColonyId || !activeUserId) return;
    const response = await colonyService.executeServerAction(
      activeColonyId,
      activeUserId,
      action,
      persistTickOptions()
    );
    reconcileAuthoritativeData(response.colonyData, {
      allowRestart: action.type === 'RESTART_COLONY',
    });
    result = { success: response.success, reason: response.reason };
  });

  return result;
}

async function flushAuthoritativeTicks(): Promise<void> {
  if (!activeColonyId || !activeUserId) return;
  if (store.getState().status !== 'active') return;
  const updatedData = await colonyService.triggerServerTick(activeColonyId, activeUserId, persistTickOptions());
  reconcileAuthoritativeData(updatedData);
}

async function freezeTickClock(): Promise<void> {
  if (!activeColonyId || !activeUserId) return;
  if (store.getState().status !== 'active') return;
  await colonyService.updateLastTickTime(activeColonyId, activeUserId);
}

function maybeRunAutopilot(): void {
  if (!gameSettings.getState().autopilot) return;
  const state = store.getState();
  if (state.status !== 'active') return;
  if (lastAutopilotTick > state.tick) lastAutopilotTick = -1;
  const urgent = state.food < 20 || state.oxygen < 20 || state.power < 15;
  const needSecondHabitat =
    state.buildings.filter((b) => b.type === 'habitat').length < 2 &&
    state.tick < CONTRACT_RULES.arrivals.intervalTicks;
  if (!urgent && !needSecondHabitat && state.tick - lastAutopilotTick < 3) return;
  const action = nextAutopilotAction(state);
  if (!action) return;
  lastAutopilotTick = state.tick;
  store.dispatch(action);
}

// Game Over Screen Modal
const gameOverModal = new GameOverModal({
  onRestart: async () => {
    if (!activeColonyId || !activeUserId) return;
    toolbar.setStatus('Re-initializing Colony...', 'warning');

    try {
      const res = await executeAndReconcileAction({ type: 'RESTART_COLONY' });
      if (res.success) {
        lastAutopilotTick = store.getState().tick - 3;
        gameOverModal.hide();
        applySessionStatus();
        startSimulationLoops(activeUserId);
      } else {
        toolbar.setStatus(`Restart Error: ${res.reason}`, 'critical');
      }
    } catch (err: any) {
      console.error('Failed to restart colony:', err);
      toolbar.setStatus(`Restart Error: ${err.message}`, 'critical');
    }
  },
});

// Subscribe readout, resource panel and game over screen to store updates
store.subscribe((state) => {
  readout.update(state);
  resourcePanel.updateFromState(state);

  if (state.status === 'game_over') {
    stopSimulationLoops();
    const solsSurvived = Math.floor(state.tick / 1000);
    gameOverModal.show(solsSurvived, state.bestSolsSurvived, state.gameOverReason, {
      oxygen: state.oxygen,
      power: state.power,
      food: state.food,
      ore: state.ore,
      electronics: state.electronics,
      buildingsCount: state.buildings.length,
      tick: state.tick,
    });
    toolbar.setStatus('CRITICAL: All Colonists Deceased', 'critical');
  } else {
    gameOverModal.hide();
  }
});

// Top-right Header Bar
const headerBar = new HeaderBar({
  onSignOut: async () => {
    toolbar.setStatus('Signing out...', 'warning');
    await authManager.signOut();
  },
  onUpgradeAccount: async (email, password) => {
    const res = await authManager.linkGuestAccount(email, password);
    if (!res.error) {
      toolbar.setStatus('Account Upgraded Successfully', 'nominal');
      activeUserDisplay = email;
      store.loadState({
        signedInAccount: email,
      });
    }
    return res;
  },
});

// Authentication Modal
const authModal = new AuthModal({
  onSignIn: async (email, password) => {
    return await authManager.signIn(email, password);
  },
  onSignUp: async (email, password) => {
    return await authManager.signUp(email, password);
  },
  onGuestSignIn: async () => {
    return await authManager.signInAsGuest();
  },
});

/**
 * Starts the continuous client-side simulation projection
 * and frequent authoritative server tick persistence.
 * 
 * Rules:
 * - Local projection is strictly for display/HUD/animation.
 * - The browser client NEVER saves locally ticked values to the database.
 * - Periodic server sync writes elapsed ticks (× speed) and re-aligns local projection.
 */
function startSimulationLoops(userId: string): void {
  stopSimulationLoops();

  if (isUiPaused()) {
    applySessionStatus();
    return;
  }

  const settings = gameSettings.getState();
  const tickMs = Math.round(1000 / settings.speed);
  if (lastAutopilotTick > store.getState().tick) lastAutopilotTick = -1;
  lastPersistCheckpoint = store.getState().tick;

  // 1. Client-side projection (Display only)
  clientProjectionInterval = window.setInterval(() => {
    if (isUiPaused() || document.hidden) return;
    const state = store.getState();
    if (state.status === 'active') {
      store.advanceTicks(1);
      const tick = store.getState().tick;
      if (activeColonyId) {
        colonyService.rememberProjectedTick(activeColonyId, tick);
      }
      maybeRunAutopilot();
      const checkpoint = CONTRACT_RULES.persistCheckpointTicks;
      if (tick > 0 && Math.floor(tick / checkpoint) > Math.floor(lastPersistCheckpoint / checkpoint)) {
        void runAuthoritativeSync(userId);
      }
    } else {
      stopSimulationLoops();
    }
  }, tickMs);

  // 2. Authoritative persist — every 2s so refresh reloads nearly the live tick count
  const persistTicks = () => {
    void runAuthoritativeSync(userId);
  };
  serverSyncTimeout = window.setTimeout(persistTicks, 1000);
  serverSyncInterval = window.setInterval(persistTicks, 2000);
}

async function runAuthoritativeSync(userId: string): Promise<void> {
  await enqueueTickSync(async () => {
    if (isUiPaused() || document.hidden) return;
    if (store.getState().status !== 'active') {
      stopSimulationLoops();
      return;
    }
    if (activeColonyId && activeUserId === userId) {
      try {
        const updatedData = await colonyService.triggerServerTick(activeColonyId, userId, persistTickOptions());
        reconcileAuthoritativeData(updatedData);
        lastPersistCheckpoint = Math.max(lastPersistCheckpoint, updatedData.colony.tick ?? 0);
        maybeRunAutopilot();
      } catch (err) {
        console.warn('Authoritative periodic server tick sync failed:', err);
      }
    }
  });
}

function stopSimulationLoops(): void {
  if (clientProjectionInterval !== null) {
    clearInterval(clientProjectionInterval);
    clientProjectionInterval = null;
  }
  if (serverSyncTimeout !== null) {
    clearTimeout(serverSyncTimeout);
    serverSyncTimeout = null;
  }
  if (serverSyncInterval !== null) {
    clearInterval(serverSyncInterval);
    serverSyncInterval = null;
  }
}

// Network Online/Offline & Telemetry Listeners
window.addEventListener('online', async () => {
  if (activeColonyId && activeUserId) {
    try {
      const updatedData = await colonyService.triggerServerTick(
        activeColonyId,
        activeUserId,
        isUiPaused() || !gameSettings.getState().alwaysPassTime
          ? { skipCatchUp: true }
          : persistTickOptions()
      );
      reconcileAuthoritativeData(updatedData);
      telemetryBanner.setState('hidden');
      toolbar.setActionsPaused(false);
      if (isUiPaused()) applySessionStatus();
      else toolbar.setStatus('Telemetry Link Nominal', 'nominal');
    } catch {
      // Periodic server sync will retry
    }
  }
});

window.addEventListener('offline', () => {
  telemetryBanner.setState('offline');
  toolbar.setActionsPaused(true);
  toolbar.setStatus('Network Offline - Actions Paused', 'warning');
});

document.addEventListener('visibilitychange', async () => {
  if (!activeColonyId || !activeUserId || store.getState().status !== 'active') return;

  if (document.hidden) {
    stopSimulationLoops();
    colonyService.flushTicksKeepalive(activeColonyId, persistTickOptions());
    await enqueueTickSync(async () => {
      try {
        await flushAuthoritativeTicks();
        if (!gameSettings.getState().alwaysPassTime) {
          await freezeTickClock();
        }
      } catch (err) {
        console.warn('Failed to flush ticks while hidden:', err);
      }
    });
    return;
  }

  await enqueueTickSync(async () => {
    try {
      const settings = gameSettings.getState();
      if (settings.alwaysPassTime && !isUiPaused() && activeColonyId && activeUserId) {
        const updatedData = await colonyService.triggerServerTick(activeColonyId, activeUserId, {
          speed: 1,
          maxTicks: 8,
        });
        reconcileAuthoritativeData(updatedData);
      } else if (activeColonyId && activeUserId) {
        await freezeTickClock();
      }
    } catch (err) {
      console.warn('Failed to resume colony tick on visibility:', err);
    }
  });

  if (!isUiPaused()) {
    startSimulationLoops(activeUserId);
  }
});

window.addEventListener('pagehide', () => {
  if (!activeColonyId || store.getState().status !== 'active') return;
  colonyService.flushTicksKeepalive(activeColonyId, persistTickOptions());
});

window.addEventListener('freeze', () => {
  if (!activeColonyId || store.getState().status !== 'active') return;
  colonyService.flushTicksKeepalive(activeColonyId, persistTickOptions());
});

async function handleAuthStateChange(authState: AuthState): Promise<void> {
  headerBar.updateAuth(authState);

  if (!authState.user) {
    // Unauthenticated
    stopSimulationLoops();
    if (realtimeChannel) {
      realtimeChannel.unsubscribe();
      realtimeChannel = null;
    }
    activeUserId = null;
    activeColonyId = null;
    activeUserDisplay = 'none';
    isInitializingUserId = null;
    store.setServerActionHandler(null);
    renderer.setPreviewState(modelPreviewState);
    store.reset();
    renderer.setSelectedTool(null);
    telemetryBanner.setState('hidden');
    toolbar.setActionsPaused(false);
    toolbar.setStatus('Authentication Required', 'warning');
    gameOverModal.hide();
    gameSettings.hideControls();
    authModal.showHome();
    return;
  }

  // Authenticated user session established
  const user = authState.user;
  const isGuest = authState.isGuest;
  activeUserDisplay = isGuest ? `guest-${user.id.slice(0, 6)}` : (user.email ?? user.id.slice(0, 8));

  // If already active or currently initializing for this exact user, avoid re-triggering
  if (activeUserId === user.id || isInitializingUserId === user.id) {
    store.loadState({ signedInAccount: activeUserDisplay });
    return;
  }

  isInitializingUserId = user.id;
  authModal.hide();
  toolbar.setStatus('Establishing Uplink...', 'nominal');

  try {
    // Load or create colony: performs authoritative catch-up on load via server route
    const colonyData = await colonyService.loadOrCreateColony(user.id, {
      skipCatchUp: !gameSettings.getState().alwaysPassTime,
      speed: 1,
      maxTicks: 8,
    });
    activeUserId = user.id;
    activeColonyId = colonyData.colony.id;

    // Populate store with authoritative colony state
    store.loadColonyData(colonyData, activeUserDisplay, { authoritative: true });

    renderer.setPreviewState(null);

    // Configure authoritative server action handler for all dispatched player actions
    store.setServerActionHandler(async (action) => {
      if (!activeColonyId || !activeUserId) {
        return { success: false, reason: 'No active session' };
      }
      return await executeAndReconcileAction(action);
    });

    // Subscribe to realtime changes with connection status handling
    realtimeChannel = colonyService.subscribeToColony(
      colonyData.colony.id,
      (payload) => {
        if (payload.new && payload.new.owner === user.id) {
          const row = payload.new;
          const currentState = store.getState();
          const realtimeStatus =
            currentState.status === 'game_over' ? 'game_over' : row.status;
          store.loadState({
            oxygen: row.oxygen,
            power: row.power,
            food: row.food,
            ore: row.ore,
            electronics: row.electronics,
            seed: row.seed,
            tick: Math.max(currentState.tick, row.tick),
            status: realtimeStatus,
          });
        }
      },
      (status) => {
        if (status === 'SUBSCRIBED') {
          if (navigator.onLine) {
            telemetryBanner.setState('hidden');
            toolbar.setActionsPaused(false);
            if (!isUiPaused()) {
              toolbar.setStatus('Telemetry Link Nominal', 'nominal');
            }
          }
        }
      }
    );

    // Auto-open help modal on first load for this user (pauses simulation until dismissed)
    lastAutopilotTick = store.getState().tick - 3;
    gameSettings.showControls();
    const isFirstTimeHelp = helpModal.handleUserSession(user.id);
    if (!isFirstTimeHelp) {
      startSimulationLoops(user.id);
      applySessionStatus();
    } else {
      toolbar.setStatus('Simulation Paused (Reviewing Operations Manual)', 'warning');
    }
  } catch (err: any) {
    console.error('Error initializing colony session:', err);
    toolbar.setStatus(`Colony Load Error: ${err.message}`, 'critical');
    authModal.setStatus(`Failed to load colony: ${err.message}`, true);
    authModal.show();
  } finally {
    isInitializingUserId = null;
  }
}

// Subscribe to auth state changes
authManager.subscribe((state) => {
  handleAuthStateChange(state);
});

// Initialize auth
authManager.init();
