# Contract

## Data Source

- Intended source: Supabase (PostgreSQL) — colony state, auth, and real-time subscriptions; Supabase serverless functions for authoritative tick route
- Ownership and access: Server session authentication; client never writes authoritative state directly

## Ownership

- One colony per account. A colony is created on first sign-in and never reset thereafter, with one exception below.
- Each account has its own row in a users table, separate from the colony's own state — matching the identity split DATABASE.md requires between this application and Waypoint. It holds bestSolsSurvived, the one piece of account-level data that outlives a colony restart.
- A colony in `game_over` status may be restarted by the same account, from the game-over screen only. This is the one exception to "never reset" — a player's own deliberate action, not something the server or an agent triggers on its own.
- Restarting generates a brand-new seed and a fresh colony, exactly as first sign-in would — new ore distribution, new mining site positions, oxygen/power/food back to starting values, starter habitat, starter solar array, 2 pioneer colonists, no pending arrivals, no rovers, no stored battery cells. Status returns to `active`. bestSolsSurvived is untouched — it lives on the account, not the colony.

## Simulation Rules

### Tick
- Tick interval: 1 second of real time
- lastTickAt stored with colony state
- Applying N ticks in one batch must produce exactly the same state as applying N ticks one at a time
- Every random-seeming decision in this document — building breakage, storm timing and target, asteroid timing and position, ore distribution at creation, movement tie-breaks — draws from the same seeded generator stored in colony state, never Math.random(). This is what makes the line above possible for a system with this many moving parts, not just the tick arithmetic itself

### Starting State
- A new colony starts with oxygen 50, power 50, food 50, ore 25, electronics 2, 1 starter Habitat at tile (7, 7), 1 starter Solar Array at tile (5, 7), 1 starter Oxygen Scrubber at tile (9, 7), 2 Pioneer Colonists living at the starter Habitat, no pending arrivals, no rovers, no stored battery cells, and a fresh seed generating the colony's ore distribution and mining site positions

### Buildings & Workforce
- **Workforce Capacity**: Industrial and operational facilities (solar, scrubbers, extractors, farms, garages, refineries) require colonist labor to maintain and operate. Each living colonist supports up to **4 operational facilities** ($\text{Max Operational Facilities} = \text{Living Colonists} \times 4$). Habitats provide residential quarters and are exempt from the operational facility limit. Only operational facilities count against this cap (broken, buried, and deactivated buildings are exempt).
- **Building Costs & Specs**:
  - habitat: houses 2 colonists, draws 2 power/tick. Cost: 20 PWR, 10 Ore.
  - solar: produces 5 power/tick, draws 0. Cost: 15 PWR, 0 Ore.
  - scrubber: produces 5 oxygen/tick when staffed, draws 3 power/tick (+5 Max O2 capacity). Cost: 15 PWR, 5 Ore.
  - extractor: produces 1 ore per 5 ticks from its tile's local deposit when staffed, draws 1 power/tick. Can be deactivated (0 PWR draw), relocated to fresh deposits for 10 PWR, or demolished for 10 PWR. Cost: 25 PWR, 0 Ore.
  - farm: produces 5 food/tick when staffed, draws 2 power/tick. Cost: 20 PWR, 5 Ore.
  - garage: holds up to 2 rovers, draws 1 power/tick, no production. Cost: 30 PWR, 10 Ore.
  - refinery: converts ore to battery cells, draws 5 power/tick, requires colonist presence — refining is a player-initiated action, not continuous. Cost: 25 PWR, 15 Ore.

### Colony Spacing & Buffer Zones
- Heavy industrial and life support structures require ventilation, solar clearance, and ground isolation.
- Structures with $\le 1$ immediate adjacent orthogonal neighbor operate at **100% full nominal efficiency**.
- Clustered structures with $\ge 2$ adjacent neighbors suffer an overcrowding penalty of **-1 resource production per additional neighbor** (minimum 0). Designing open colony layouts with walkways and spacing buffers maximizes aggregate output.

### Resources & Storage Scaling
- power and food are pools, 0–100, clamped at both ends
- oxygen is a scalable life support pool (0 to dynamic max: **100 base + 5 per operational Scrubber**)
- Each colonist consumes 3 oxygen/tick and 3 food/tick
- **Colony Starting Stockpile**: Every new colony begins with 50 Oxygen, 50 Power, 50 Food, 25 Ore, and **2 Electronics** (Emergency Avionics & Spare Parts Kit in the pioneer lander).

### Ore
- ore is a stockpile, not a pool: 0 or above, no upper clamp
- ore does not participate in the health rule. Oxygen, power, and food are the three that can trigger colonist health loss

### Ore Deposits, Extractor Balance & Demolition
- Ore is not a single global reserve. At colony creation, the seeded generator distributes 500 ore total across roughly 15–25 grid tiles, unevenly — most tiles hold nothing, a handful hold a meaningful amount, and at least one holds as little as 1. Distribution is fixed for the colony's lifetime, generated once, never regenerated
- **Balanced Extractor Extraction**: An extractor placed on a tile mines only that tile's own deposit at **1 ore per 5 ticks** (requiring only **1 PWR draw/tick**), providing balanced, sustainable resource income without draining power grids or exhausting ore deposits instantly.
- Once a tile's deposit is exhausted, an extractor there produces 0 ore permanently. It still draws 1 PWR unless deactivated by the player.
- **Structure Deactivation & Relocation**: Players can select any structure (via map click or Building Inspector) and toggle its power state (deactivated: 0 PWR draw, 0 production). Players can also relocate a structure to another available tile on the grid for 10 Power.
- **Structure Demolition**: Players can permanently demolish/destroy any building from its Inspector card for **10 Power** (`DESTROY_BUILDING`), freeing up the tile. Demolishing an extractor leaves any remaining subterranean deposit intact.
- The three mining sites below are the largest individual deposits in this same 500-total pool, deliberately placed far from the landing zone

### Food
- food is a pool, 0–100, clamped at both ends, same shape as power
- Hydroponic farm produces 5 food/tick; each colonist consumes 3 food/tick.
- With 2 colonists consuming 6 food/tick: 1 Farm produces 5 food/tick (a mild net -1/tick deficit), causing food reserves to steadily tick down and providing a fair challenge to establish secondary agricultural modules. 2 Farms produce 10 food/tick (+4 surplus), fully restocking the granary.
- food joins the life-support check: if oxygen is 0 OR power is 0 OR food is 0 at the end of a tick, every colonist loses 2 health. All three pools are read; any one hitting 0 is sufficient

### Building Condition & Maintenance
- Every building has a condition: operational, broken, buried, or deactivated
- **Breakage Grace Period**: To ensure a fair initial setup and avoid unavoidable early-game RNG deaths before ship retrieval is possible, mechanical wear and breakage rolls only activate **from tick 500 onwards** (after the first transport arrival cycle at tick 300).
- From tick 500+, each operational or deactivated building has a small seeded chance of becoming broken — 1-in-4,000 per building per tick. Unpowered buildings remain vulnerable to Martian sub-zero temperatures and structural stress.
- A broken building produces and draws nothing until repaired
- Repair requires colonist labor presence adjacent to or on the building's tile for 50 ticks of labor (30 ticks for scrubbers), plus an electronics cost deducted upon completion — 1 electronics for habitat, solar, scrubber, and farm; 2 electronics for extractor, garage, and refinery
- Repair labor and repair material come from different places on purpose. Colonists are locally renewable — arrivals, if you keep the pipeline running. Electronics are not — the colony cannot manufacture them, only receive them, which is what makes ship traffic worth the escort risk rather than a formality
- The tick function assigns the nearest idle colonists to broken and buried buildings automatically (provided the colony has sufficient electronics in its stockpile for repairs). Additionally, players may directly click any broken or buried building to inspect maintenance requirements and click `[ DISPATCH REPAIR ]` or `[ DISPATCH EXCAVATION ]` (`ASSIGN_COLONIST_MAINTENANCE`), routing the nearest available colonist immediately.
- If a broken building lacks required electronics, the Building Inspector clearly displays the deficit and instructs the operator to escort incoming transport ships at Landing Pad (0, 0) to secure electronic components.
- A buried building (see Weather) cannot be repaired until it is dug out first

### Weather
- Starting Sol 2.5 (tick 2,500), every 1,500-tick window, a seeded roll has a 30% chance a dust storm occurs — creating realistic Martian environmental pressure that requires ongoing colony vigilance. Unlike breakage, weather doesn't scale with how much you've built; it's the pressure that exists regardless
- A storm buries up to 2 buildings (operational, deactivated, or broken) chosen by the seeded generator from those not already buried. Unpowered structures offer no immunity against Martian dust accumulation.
- A buried building produces and draws nothing
- Digging out requires 1 colonist present adjacent to or on the tile for 40 consecutive ticks (survivable within the 50-tick life support buffer), no resource cost. Assigned automatically, same as repair
- A building already broken when it's buried preserves its broken state (`wasBrokenBeforeBurial = true`), needing digging out first (40 ticks) which returns its condition to `broken`, followed by standard repair (labor + electronics) — both, in that order

### Colonist Lifespan
- Each colonist has an age, in ticks, starting at 0 and incrementing every tick
- Lifespan is seeded per colonist at the moment they're received into `colonists`, uniformly between 6,000 and 10,000 ticks (6–10 sols), average 8,000. A range rather than a fixed number on purpose — colonists who arrived on the same ship would otherwise age out in the exact same tick, which reads as a scripted die-off rather than ordinary attrition
- At the end of their lifespan, a colonist dies of old age and is removed, independent of health
- Old-age death follows the same game-over rule as health-based death: if it leaves no colonists remaining, colony status becomes game_over

### Placement Costs & Construction Workforce
- habitat: 20 power
- solar: 15 power
- scrubber: 15 power, 5 ore
- extractor: 25 power (Relocation: 10 power)
- farm: 20 power, 5 ore
- garage: 30 power, 10 ore
- refinery: 25 power, 15 ore
- **Workforce Requirement**: Placing any structure beyond the initial starter colony requires at least 1 living colonist in the colony (`colonists.length >= 1`). If the colonist population is 0, building placement is rejected with reason "Colonist Workforce Required".
- A placement is rejected if the account cannot afford its cost. Cost is deducted server-side the instant placement succeeds
- A placement is also rejected if the target tile currently holds a building, is buried, or is tile (0, 0). Tile (0, 0) is the permanent designated Landing Pad, and no buildings may be placed on it
- For extractor specifically: placing an extractor on a dry tile (zero ore) is legal but pointless, and the game does not prevent it

### Health
- If oxygen is 0 OR power is 0 OR food is 0 at end of tick: every colonist loses 2 health (50-tick survival buffer)
- Otherwise: colonists recover 1 health per tick, up to 100

### Colonist Death
- A colonist whose health reaches 0 dies and is removed from the colony in the same tick

### Game Over & Casualty Incident Report
- If the last colonist dies, colony status becomes `game_over`. No further ticks are applied once set — every tick requested after that, including catch-up, returns the state unchanged
- 1 sol = 1000 ticks. Sols survived is the tick count at the moment of game over, divided by 1000, rounded down
- At the moment of game over, compare sols survived against the account's bestSolsSurvived. If higher, update it. If not, leave it unchanged
- **Map & Entity Preservation**: Upon reaching `game_over`, the canvas grid, terrain, and building ruins remain visible (not deleted or blanked out). Database records are preserved in `game_over` status until the player explicitly clicks `START NEW COLONY` (`RESTART_COLONY`).
- **Failure Cause Telemetry**: The simulation calculates the exact primary cause of failure (Asphyxiation from 0% Oxygen, Power Grid Collapse from 0% Power, Starvation from 0% Food, or Natural Age Attrition) and presents a comprehensive incident report dossier with final telemetry and sols survived.

### Colonist Arrivals & Landing Pad
- Tile (0, 0) is the colony's permanent Landing Pad. When no transport is on-site, the landing pad is visible with tarmac markings, hazard borders, and approach guidance beacons. Building on tile (0, 0) is strictly prohibited
- A ship lands every 300 ticks — capped by total habitat capacity (2 colonists per habitat). No landing occurs if capacity is already full
- The transport ship is a compact single-tile descent capsule that rests directly on the (0, 0) landing pad
- A landed colonist is not yet a colonist in the sense the rest of this document uses the word. They join `pendingArrivals`, not `colonists` — no health, no age, no life-support draw, because they're not in the colony's care yet
- The ship also carries 2 electronics, held with the pending arrival until escort succeeds or fails
- A rover dispatched to the landing zone — a third rover destination, alongside a mining site and an asteroid — picks up the waiting colonist and the electronics and returns them to its garage. On arrival, the arrival moves from `pendingArrivals` into `colonists`, assigned a habitat exactly as arrivals always were, and the electronics join the colony's stockpile
- Each entry in `pendingArrivals` has 150 ticks from landing to be escorted. If no rover reaches them in that window, the entry is removed — the colonist and the electronics are both lost, nothing recovered
- 150 ticks is generous for travel — a rover crosses the entire 20×20 grid in about 20 ticks at 1 tile/tick. The real constraint is never having a rover free to send, not the distance
- Nothing about escort is automatic. A ship landing during a large catch-up jump, with nobody actively dispatching, times out exactly like one landing while you watch and choosing not to act — there is no auto-dispatch fallback. This is deliberate: leaving the colony to run unattended for long stretches has a real demographic cost, the same way it has a real maintenance cost from Building Condition and Weather. Checking in periodically isn't a suggestion, it's how population actually grows

### Electronics
- electronics is a stockpile, 0 or above, no upper clamp — same shape as ore
- The only source is a successful escort. Nothing in the colony produces electronics locally
- Electronics fund building repair (see Building Condition). Ore funds placement and battery cells. The two are not interchangeable

### Colonist movement
- Colonists move one tile every 5 ticks toward a destination building, stopping adjacent (0.2 tiles/tick)
- A sub-tick counter (`moveProgress`, 0 to 4 ticks) tracks progress between each tile step
- A colonist can be assigned four kinds of destination: a habitat on arrival, a broken building to repair, a buried building to dig out, or a stranded rover to recover. Only one at a time — a colonist already assigned to any of the four isn't pulled to a second one until the first finishes
- Movement advances inside the tick function, not in rendering
- Every movement choice must be deterministic — no fresh random numbers
- A newly-landed colonist is assigned a destination — the nearest habitat with unclaimed capacity — in the same tick it's created. Capacity is claimed on assignment, not on arrival
- Rovers move 1 tile per tick along the same grid (1.0 tile/tick), walking's deterministic tie-break rules included. A trip that takes a colonist 50 ticks on foot takes a rover 10

### Rovers
- A garage holds up to 2 rovers, with a visible top-down roof status indicator showing docked rover capacity at a glance. A rover exists the moment a garage is placed with room for one; rovers are not placed individually
- Each rover is an open-cockpit crewed planetary rover with dual passenger seating capable of holding up to 2 colonists (empty, 1 colonist, or 2 colonists):
  - 0 occupants: unmanned parked rover
  - 1 occupant: single colonist driver (standard transit, mining dispatch, or outbound escort)
  - 2 occupants: driver + passenger colonist (e.g. returning from landing zone with the escorted colonist)
- Rover state: idle_at_base, traveling_out, on_site, traveling_back, stranded. `on_site` covers mining a site or asteroid and picking up a pending arrival alike — what happens during it depends on the dispatch, the state name doesn't
- While in `on_site` state, `onSiteTicksRemaining` tracks the tick countdown until mining or passenger loading operations conclude
- Rover power: 0–150, its own pool, separate from colony power. Recharges 5/tick while idle_at_base, nowhere else. Dispatched at full charge using 1 battery cell
- Dispatch costs 1 battery cell, consumed on departure. No cell, no dispatch
- Once dispatched: travel_out_ticks + on_site_ticks + travel_back_ticks, at 1 tile/tick for the travel legs. A mining or asteroid dispatch sets on_site_ticks to that site's fixed mining duration; a landing-zone dispatch sets it to a fixed 5 ticks, just long enough to represent loading a passenger rather than mining ore. Rover power drains 1.5/tick for the round trip
- Cargo is one of two shapes depending on the dispatch: `{ type: 'ore', amount }` from a mining or asteroid trip, or `{ type: 'arrival' }` from a landing-zone trip, carrying whichever pending arrival was picked up along with their electronics
- If rover power reaches 0 before the rover returns to base: stranded. Its cargo is lost — ore forfeited, or a rescued arrival lost exactly as if the escort had never happened. A stranded rover is recovered by a colonist walking adjacent to it and returning it to the nearest garage with room — the same movement system, a fourth kind of destination
- On successful return: ore cargo joins the colony's ore stockpile; an arrival cargo moves the pending arrival into `colonists` and adds their electronics to the stockpile, exactly as a completed escort does

### Mining Sites
- Three fixed sites, generated at colony creation by the seeded generator, positioned among the far tiles in the same 500-total ore distribution — each one is among the largest individual deposits that exist
- Each site has a distance from the landing zone (setting rover travel_ticks) and a yield (ore per mine-tick, mined the same way an extractor mines a local tile)
- Sites are walkable in principle. In practice the distance makes rover access the only realistic way to use them before a colonist's assignment is needed elsewhere

### Asteroids
- Roughly every 5,000 ticks, a seeded roll determines whether one appears, and at which of a small set of fixed candidate positions
- Visible for 200 ticks before despawning, whether mined or not
- Yield is higher than any mining site. Reachable by rover the same as a mining site — an asteroid too far to reach in its visible window before despawning is simply missed
- Unlike the 500-total deposit, asteroids are the one ore source that never runs out. They're also the one source you can't plan around — the seeded roll decides both whether one appears and where

### Battery Cells
- Refined from ore at a refinery. Refining is a player-initiated action, not automatic: a fixed ore cost produces one cell
- Stored at the refinery, capacity-limited to 20 cells
- Decay: -1 efficiency/tick while stored and unused, floor 0. A cell at 0 efficiency still counts toward the dispatch requirement but contributes nothing extra
- This is the actual constraint on rover expansion: ore funds cells, cells fund dispatch, dispatch funds more ore. Nothing about rovers is free once battery cells exist

### Catch-up
- Catch-up capped at 28,800 ticks (8 hours)

## State Shape

Every field that needs to persist, in one place — the source of truth for the database schema and everything the tick function reads or writes. This section was written for the original build in Lesson 7.11 and is now out of date with the rest of this document; treat this version, not that lesson, as current.

- ownerId
- oxygen, power, food — 0–100
- ore, electronics — stockpiles, 0 or above
- tick — monotonic counter
- lastTickAt — timestamp of the most recent applied tick
- status — `active` or `game_over`
- seed — the colony's own seeded generator state, set once at creation, advanced deterministically by every roll that reads from it
- oreDeposits — array of `{ x, y, remaining }`, set once at creation from the seeded 500-total distribution
- buildings — array of `{ type, x, y, condition, repairProgress, digProgress, wasBrokenBeforeBurial }`, condition one of `operational`, `broken`, `buried`, `deactivated`
- colonists — array of `{ x, y, health, age, lifespan, moveProgress, destination, destinationType, targetEntityId, route }`, destinationType one of `habitat`, `repair`, `dig`, `rover_recovery`
- pendingArrivals — array of `{ landedAtTick, electronics }`, position always the landing zone. Not colonists yet — no health, no age, not counted anywhere life support is
- rovers — array of `{ garageX, garageY, x, y, state, power, cargo, destination, onSiteTicksRemaining, route }`, state one of `idle_at_base`, `traveling_out`, `on_site`, `traveling_back`, `stranded`; cargo either `{ type: 'ore', amount }`, `{ type: 'arrival' }`, or null
- batteryCells — array of `{ efficiency }`, one entry per stored cell, at the refinery
- miningSites — array of `{ x, y, yield }`, fixed at creation
- activeAsteroid — `{ x, y, yield, expiresAtTick }` or null

Sols survived is never stored. It's derived at display time from `tick`.

## Account Data

Fields that persist per account, separate from any single colony — outlives a colony restart even though the colony's own state doesn't.

- bestSolsSurvived — 0 at account creation, updated only when a colony's sols at game over exceed the current value

## Pieces

| Piece | Must do |
| --- | --- |
| Auth & Session Manager | Authenticate player, load active colony session, handle reconnects |
| Isometric Canvas Renderer | Render terrain tiles, buildings, resource overlays, and colonist sprites via 2D Canvas |
| Tick Client & Fallback Engine | Send player actions to serverless tick route; apply authoritative state from Supabase; project state forward on client for display between writes. When serverless Edge Functions are offline or unreachable, local fallback engine (`server-simulation.ts`) provides an identical direct-database authoritative simulation runner for offline/local development |
| HUD, Toolbar & Text Info Panels | Display every colony metric the diagnostic panel tracks except session identity — tick, oxygen, power, food, ore, electronics, building condition, colonist health and age, pending arrivals with time remaining, rover and battery status — and building placement toolbars in plain text/DOM. On compact/mobile screens, toolbars collapse cleanly into custom responsive dropdown drawers |
| Building & Placement Controller | Handle cursor tile hovering, building validity and affordability checks, and placement requests. Tile hover shows ore remaining for a tile before an extractor is placed there |
| Catch-up Handler | Apply batched offline ticks on load up to the 28,800 tick ceiling |
| Landing Zone | Render pending arrivals waiting at tile (0, 0) with visible time remaining before their escort window expires |
| Game Over Screen | Display sols survived when the colony ends; offer a "Start New Colony" action that resets the account's colony to starting state |
| Help Modal | Explain the survival goal, every building's cost and effect, the colonist arrival rule and escort requirement, and the maintenance mechanics — breakage, burial, aging — read live from CONTRACT.md. Open via a persistent "?" affordance, closeable, available regardless of game state |
| Diagnostic Panel | Plain-text readout of internal state for automated verification — tick, resources, colonist health and age, pending arrivals, building condition, rover and battery state, session identity, colony ownership. Renders only when the URL includes ?debug=true; absent otherwise. This is what /browser and /playtest read from |

## States

| Piece | State | Trigger | Required rendering and behavior |
| --- | --- | --- | --- |
| Auth & Session Manager | unauthenticated | Initial app load without valid auth session token | Display plain-text login/session form; halt game state subscriptions |
| Auth & Session Manager | authenticating | User submits credentials / token | Show authenticating status indicator; await session response |
| Auth & Session Manager | session_active | Valid session established | Load colony data, initialize real-time subscription, and proceed to simulation |
| Auth & Session Manager | reconnecting | Real-time connection dropped | Display yellow pulsing status text "Re-establishing Uplink..."; attempt exponential backoff |
| Auth & Session Manager | session_expired | Session invalidated or token rejected | Clear active session token, pause actions, return to login/auth prompt |
| Tick Client | idle | Authoritative state up to date and no pending user actions | Await new simulation tick or user inputs |
| Tick Client | submitting_action | Player dispatches placement or colony action | Dispatch action to serverless tick route with rate-limiting throttle |
| Tick Client | awaiting_state | Action acknowledged, waiting for server tick execution | Maintain client projection while waiting for authoritative state payload |
| Tick Client | projection_active | Simulation time advances between server writes | Run deterministic client projection for UI readouts and animations without mutating authoritative store |
| Tick Client | offline | Network or real-time connection severed | Display persistent amber banner "Telemetry Lost - Actions Paused"; pause action dispatch |
| Isometric Canvas Renderer | idle_viewing | Canvas active, no placement tool selected | Render terrain, placed structures, and colonists with standard viewport loop |
| Isometric Canvas Renderer | tile_hovered | Cursor hovers over grid tile | Highlight hovered tile boundary using isometric coordinate transform |
| Isometric Canvas Renderer | panning_zoom | User drags canvas or scrolls wheel | Adjust viewport camera offset / zoom scale without altering grid coordinates |
| Isometric Canvas Renderer | placing_structure | Structure placement tool active over valid tile | Render green-tinted tile outline and building preview sprite |
| Isometric Canvas Renderer | invalid_placement | Structure placement tool hovered over blocked/invalid tile, or placement rejected for insufficient power/ore | Render red-tinted outline; show plain-text blocker reason in status bar |
| HUD & Text Info Panels | nominal | Oxygen, power, and colonist health levels all above warning threshold | Display metrics in standard text color (#d9dde0) |
| HUD & Text Info Panels | warning_resource_low | Either oxygen or power approaches zero | Render low-resource metric readout with warning status highlight (#E0A030) |
| HUD & Text Info Panels | critical | Either oxygen or power reaches zero | Display critical status alert border (#D94F3D) and trigger colonist health degradation |
| Catch-up Handler | idle | Colony loaded in real-time or caught up | No action required |
| Catch-up Handler | computing | Player loads colony after offline duration | Compute and apply batched server tick catch-up calculations sequentially |
| Catch-up Handler | capped | Offline duration exceeds 28,800 ticks | Cap catch-up at 28,800 ticks; render notification that simulation reached max offline ceiling |
| Game Over Screen | inactive | Colony status is active | Not rendered; normal HUD and canvas shown |
| Game Over Screen | shown | Colony status becomes game_over | Replace normal view with sols-survived display and a "Start New Colony" button |
| Landing Zone | empty | No entries in pendingArrivals | Nothing rendered at tile (0, 0) beyond the tile itself |
| Landing Zone | waiting | An entry exists in pendingArrivals with time remaining | Render the pending arrival with a visible countdown |
| Landing Zone | urgent | An entry's remaining time drops below 30 ticks | Same rendering as waiting, with the countdown in the warning colour — the one visual escalation this piece gets, since a silent timeout is the failure mode most worth preventing |
| Help Modal | closed | Default | The "?" affordance is visible; nothing else rendered |
| Help Modal | open | Player clicks the "?" affordance | Modal shown over the current view. The tick keeps running underneath — opening it never pauses or affects authoritative state |

## States That Must Differ

| Piece | State A | State B | Required distinction |
| --- | --- | --- | --- |
| Building & Placement Controller | Placing Structure (Valid) | Placing Structure (Invalid) | Valid shows green-tinted tile outline / preview; Invalid shows red-tinted outline with plain-text blocker reason in the status bar (e.g. "Insufficient Power" or "Obstacle Blocked") |
| Tick Client | Reconnecting (Colony Syncing) | Offline (Telemetry Lost) | Reconnecting shows yellow pulse status text "Re-establishing Uplink..."; Offline shows persistent amber banner "Telemetry Lost - Actions Paused" |
| Building & Placement Controller | Extractor Producing (Deposit Available) | Extractor Idle (Deposit Exhausted) | Producing shows the vent glow per DESIGN.md's state-on-screen rules; Idle shows the same structure with no glow, and the panel's ore line stops increasing from that extractor while power draw continues unchanged |
| Isometric Canvas Renderer | Broken | Buried | Broken shows the structure's normal silhouette with a visible fault indicator per DESIGN.md; Buried shows the structure mostly obscured by terrain-coloured overlay, silhouette barely visible. Neither is confusable with a healthy building glowing or idle — both read as visibly wrong at a glance |
| Landing Zone | Waiting (Time Remaining) | Urgent (Under 30 Ticks) | Waiting shows the countdown in standard text colour; Urgent shows it in the warning colour from DESIGN.md. Both show the same number — only the colour tells you how much trouble you're in |

## Failures and Edge Cases

| Piece or source | Failure or edge case | Required behavior |
| --- | --- | --- |
| Network | Disconnect / Telemetry Loss | Retain last rendered snapshot, display "Telemetry Lost", retry Supabase real-time connection with exponential backoff up to 5 times |
| Tick Client | Tick Route Timeout or 500 | Discard client's projected state, re-fetch authoritative colony state from Supabase, and show transient error in status bar |
| Auth & Session Manager | Unauthorized / Expired Session | Clear active session, return to login/auth prompt without wiping local client cache |
| Building & Placement Controller | Rate-Limited Dispatch | Throttle client input dispatch with visual cooldown indicator on action bar |
| Catch-up Handler | Catch-up Ceiling Reached | Cap catch-up computation at 28,800 ticks, display notice indicating simulation capped at maximum offline duration |
| Tick Function | A Tile's Ore Deposit Exhausted | The extractor standing on it drops to 0 ore/tick; power draw continues unchanged; not an error state, this is expected behavior for that one tile — other tiles' deposits are unaffected |
| Tick Function | Last Colonist Dies | Set colony status to game_over; stop applying further ticks, including catch-up; display sols survived on the Game Over Screen |
| Tick Function | Restart Requested | Only honored when colony status is game_over and the request originates from the Start New Colony button; generates a brand-new seed and a fresh colony exactly as first sign-in would — new ore distribution, new mining site positions, oxygen/power/food back to starting values, starter habitat, starter solar array, 2 pioneer colonists, no pending arrivals, no rovers, empty battery storage. bestSolsSurvived alone survives, since it lives on the account, not the colony |
| Tick Function | Pending Arrival's Escort Window Expires | Remove the entry from pendingArrivals; the colonist and their electronics are both lost, nothing added to any stockpile. Not an error — a consequence of the rover fleet being elsewhere when the ship landed |

## TODOs

- None