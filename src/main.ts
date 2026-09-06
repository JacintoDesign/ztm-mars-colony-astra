import './style.css';
import { ColonyStore } from './simulation/store';
import { InternalReadout } from './ui/internal-readout';
import { Toolbar } from './ui/toolbar';
import { ResourcePanel } from './ui/resource-panel';
import { HelpModal } from './ui/help-modal';
import { IsometricRenderer } from './engine/renderer';
import { AuthModal } from './ui/auth-modal';
import { HeaderBar } from './ui/header-bar';
import { GameOverModal } from './ui/game-over-modal';
import { TelemetryBanner } from './ui/telemetry-banner';
import { BuildingInspector } from './ui/building-inspector';
import { MissionAdvisor } from './ui/mission-advisor';
import { authManager, AuthState } from './services/auth-manager';
import { colonyService } from './services/colony-service';
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
  },
  onClose: async () => {
    if (activeUserId && activeColonyId && store.getState().status === 'active') {
      try {
        await colonyService.updateLastTickTime(activeColonyId, activeUserId);
      } catch (err) {
        console.warn('Failed to update tick timestamp on manual close:', err);
      }
      toolbar.setStatus('Telemetry Link Nominal', 'nominal');
      startSimulationLoops(activeUserId);
    }
  },
});

// Dedicated action handlers invoked from contextual Building Inspector Cards & Map Beacons
const handleRefineCell = async () => {
  if (!activeColonyId || !activeUserId) return;
  const res = await colonyService.executeServerAction(activeColonyId, activeUserId, { type: 'REFINE_CELL' });
  if (res.success) {
    store.loadColonyData(res.colonyData, activeUserDisplay);
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

  const res = await colonyService.executeServerAction(activeColonyId, activeUserId, {
    type: 'DISPATCH_ROVER',
    roverId: idleRover.id,
    destinationType: 'landing_zone',
  });

  if (res.success) {
    store.loadColonyData(res.colonyData, activeUserDisplay);
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

  const res = await colonyService.executeServerAction(activeColonyId, activeUserId, {
    type: 'DISPATCH_ROVER',
    roverId: idleRover.id,
    destinationType: destType,
    targetTile,
  });

  if (res.success) {
    store.loadColonyData(res.colonyData, activeUserDisplay);
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
let realtimeChannel: RealtimeChannel | null = null;

// Game Over Screen Modal
const gameOverModal = new GameOverModal({
  onRestart: async () => {
    if (!activeColonyId || !activeUserId) return;
    toolbar.setStatus('Re-initializing Colony...', 'warning');

    try {
      const res = await colonyService.executeServerAction(activeColonyId, activeUserId, { type: 'RESTART_COLONY' });
      if (res.success) {
        store.loadColonyData(res.colonyData, activeUserDisplay);
        gameOverModal.hide();
        toolbar.setStatus('Colony Re-established', 'nominal');
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
 * Starts the continuous 1-second client-side simulation projection
 * and 15-second authoritative server tick synchronization interval.
 * 
 * Rules:
 * - Local 1-second projection is strictly for display/HUD/animation.
 * - The browser client NEVER saves locally ticked values to the database.
 * - Periodic server sync fetches authoritative state and re-aligns local projection.
 */
function startSimulationLoops(userId: string): void {
  stopSimulationLoops();

  if (helpModal.isModalOpen()) {
    toolbar.setStatus('Simulation Paused (Reviewing Manual)', 'warning');
    return;
  }

  // 1. Client-side projection (Display only)
  clientProjectionInterval = window.setInterval(() => {
    if (helpModal.isModalOpen()) return;
    const state = store.getState();
    if (state.status === 'active') {
      store.advanceTicks(1);
    } else {
      stopSimulationLoops();
    }
  }, 1000);

  // 2. Authoritative server sync: calls server tick route every 15 seconds
  serverSyncInterval = window.setInterval(async () => {
    if (helpModal.isModalOpen()) return;
    if (store.getState().status !== 'active') {
      stopSimulationLoops();
      return;
    }
    if (activeColonyId && activeUserId === userId) {
      try {
        const updatedData = await colonyService.triggerServerTick(activeColonyId, userId);
        store.loadColonyData(updatedData, activeUserDisplay);
      } catch (err) {
        console.warn('Authoritative periodic server tick sync failed:', err);
      }
    }
  }, 15000);
}

function stopSimulationLoops(): void {
  if (clientProjectionInterval !== null) {
    clearInterval(clientProjectionInterval);
    clientProjectionInterval = null;
  }
  if (serverSyncInterval !== null) {
    clearInterval(serverSyncInterval);
    serverSyncInterval = null;
  }
  if (realtimeChannel) {
    realtimeChannel.unsubscribe();
    realtimeChannel = null;
  }
}

// Network Online/Offline & Telemetry Listeners
window.addEventListener('online', async () => {
  if (activeColonyId && activeUserId) {
    try {
      const updatedData = await colonyService.triggerServerTick(activeColonyId, activeUserId);
      store.loadColonyData(updatedData, activeUserDisplay);
      telemetryBanner.setState('hidden');
      toolbar.setActionsPaused(false);
      toolbar.setStatus('Telemetry Link Nominal', 'nominal');
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

async function handleAuthStateChange(authState: AuthState): Promise<void> {
  headerBar.updateAuth(authState);

  if (!authState.user) {
    // Unauthenticated
    stopSimulationLoops();
    activeUserId = null;
    activeColonyId = null;
    activeUserDisplay = 'none';
    isInitializingUserId = null;
    store.setServerActionHandler(null);
    store.reset();
    renderer.setSelectedTool(null);
    telemetryBanner.setState('hidden');
    toolbar.setActionsPaused(false);
    toolbar.setStatus('Authentication Required', 'warning');
    gameOverModal.hide();
    authModal.show();
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
    const colonyData = await colonyService.loadOrCreateColony(user.id);
    activeUserId = user.id;
    activeColonyId = colonyData.colony.id;

    // Populate store with authoritative colony state
    store.loadColonyData(colonyData, activeUserDisplay);

    // Configure authoritative server action handler for all dispatched player actions
    store.setServerActionHandler(async (action) => {
      if (!activeColonyId || !activeUserId) {
        return { success: false, reason: 'No active session' };
      }
      const res = await colonyService.executeServerAction(activeColonyId, activeUserId, action);
      if (res.success) {
        store.loadColonyData(res.colonyData, activeUserDisplay);
      }
      return { success: res.success, reason: res.reason };
    });

    // Subscribe to realtime changes with connection status handling
    realtimeChannel = colonyService.subscribeToColony(
      colonyData.colony.id,
      (payload) => {
        if (payload.new && payload.new.owner === user.id) {
          const row = payload.new;
          store.loadState({
            oxygen: row.oxygen,
            power: row.power,
            food: row.food,
            ore: row.ore,
            electronics: row.electronics,
            seed: row.seed,
            tick: Math.max(store.getState().tick, row.tick),
            status: row.status,
          });
        }
      },
      (status) => {
        if (status === 'SUBSCRIBED') {
          if (navigator.onLine) {
            telemetryBanner.setState('hidden');
            toolbar.setActionsPaused(false);
            if (!helpModal.isModalOpen()) {
              toolbar.setStatus('Telemetry Link Nominal', 'nominal');
            }
          }
        }
      }
    );

    // Auto-open help modal on first load for this user (pauses simulation until dismissed)
    const isFirstTimeHelp = helpModal.handleUserSession(user.id);
    if (!isFirstTimeHelp) {
      startSimulationLoops(user.id);
      toolbar.setStatus('Telemetry Link Nominal', 'nominal');
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
