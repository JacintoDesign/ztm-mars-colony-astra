---
name: long-run-player
description: Play a fresh colony as far as it survives using catch-up to compress time, placing buildings via browser and querying state via Supabase CLI, and report sols survived and CONTRACT.md inconsistencies without fixing them.
---

# Long-Run Player Skill

Play a fresh colony as far as it survives using catch-up to compress time, placing buildings and dispatching actions via the browser, checking state between rounds with the Supabase CLI, and reporting the outcome.

## Core Rule: Never Fix Anything
This skill is purely about playing the game. **Never modify, patch, or fix game source code or database schemas.** If a bug, glitch, unexpected behavior, or discrepancy with `CONTRACT.md` is discovered, record it in the final report for human review.

---

## Workflow Instructions

### 1. Setup & Starting Move (Sol 0)
1. Sign in as a disposable test account (e.g. anonymous guest or fresh test operator) to start from a brand new colony.
2. The colony begins with 1 starter Habitat at (7, 7), 1 starter Solar Array at (5, 7), and 2 Pioneer Colonists.
   - *Life Support Urgency:* 2 colonists consume 6 O2/tick and 4 Food/tick. With starting pools of 50 O2 and 50 Food, life support failure occurs within 58 ticks unless life support infrastructure is built immediately.
3. **Immediate Sol 0 Sequence**:
   - Place an **Extractor (25 PWR)** on an adjacent ore deposit.
   - Advance 5–10 ticks to accumulate at least 10 Ore.
   - Place a **Scrubber (15 PWR, 5 Ore)** (+4 O2/tick) and **Farm (20 PWR, 5 Ore)** (+4 Food/tick).
   - Place additional **Solar Arrays (15 PWR)** to maintain positive power balance.
   - Place a **Garage (30 PWR, 10 Ore)** and **Refinery (25 PWR, 15 Ore)** before Tick 300 to prepare for the first incoming transport ship.

### 2. Time-Compressed Play Loop (10-Minute Limit)
Run the loop for up to **10 minutes of real time** or until the colony reaches `game_over`.

In each round:

1. **Advance Simulation via Catch-up**:
   - **During Sol 0 Early Setup**:
     - Advance in short micro-chunks of **10–30 ticks** until Scrubber, Farm, and Solar balance are firmly positive.
   - **Once Stable & Garage Exists**:
     - Cap chunks at exactly **300 ticks**, matching the transport ship landing interval.
     - Advance the simulation by setting `last_tick_at` backwards by 300 seconds and triggering catch-up reload.
     - *Monotonic Tick Guarantee:* The simulation engine enforces monotonic tick progression (`Math.max(localTick, serverTick)`), guaranteeing ticks never rewind.

2. **Immediate Post-Chunk Action (Escort & Arrival Handling)**:
   - Immediately after each catch-up chunk, inspect whether a pending arrival exists in `pending_arrivals` (or on the landing zone).
   - If a pending arrival exists and at least one rover is idle (`state === 'idle_at_base'`):
     - Check battery cell inventory (`battery_cells`). If no cell is available but ore is sufficient (&ge; 10), refine a cell via the `#action-refine-cell` button.
     - Dispatch the rover immediately to the landing zone (`#action-dispatch-escort`) **before advancing further**.
     - *Rationale:* Pending arrivals expire and are permanently lost after 150 ticks without rover pickup. Dispatching immediately upon landing secures incoming colonists, maintains the workforce needed to construct further buildings, and gains +2 electronics per arrival.

3. **Check State via Supabase CLI**:
   - Query colony tables directly via Supabase CLI (`supabase` or SQL query commands) rather than opening the browser between every round. This minimizes browser overhead and maximizes rounds within the 10-minute real-time budget.
   - Inspect:
     - `marscolony_colonies`: `tick`, `status`, `oxygen`, `power`, `food`, `ore`, `electronics`, `pending_arrivals`, `battery_cells`, `active_asteroid`, `mining_sites`
     - `marscolony_buildings`: placed structures, coordinates `(x, y)`, `condition` (`operational`, `broken`, `buried`, `deactivated`), `repair_progress`, `dig_progress`
     - `marscolony_colonists`: living colonists count, individual `health`, `age`, `lifespan`, `destination_type`
     - `marscolony_rovers`: rovers count, `state` (`idle_at_base`, `traveling_out`, `on_site`, `traveling_back`, `stranded`), `power`, `cargo`
     - `marscolony_ore_deposits`: local tile ore reserves `(x, y, remaining)`

4. **Analyze Balance & Determine Next Move**:
   - Evaluate life support, power, food, and maintenance balances using exact numbers from [CONTRACT.md](../../CONTRACT.md):
     - **Workforce Capacity Constraint:** Each living colonist supports up to **4 operational facilities** (Habitats exempt). Expanding beyond 8 operational facilities requires recruiting more colonists via rover transport escorts. Broken, buried, and deactivated buildings do not consume workforce capacity.
     - **Power Balance:** Solar (+5 PWR/tick) vs. Habitat (-2), Scrubber (-3), Extractor (-4), Farm (-2), Garage (-1), Refinery (-5).
     - **Oxygen Balance:** Scrubber (+4 O2/tick) vs. Colonists (-3 O2/tick per living colonist). Dynamic Oxygen capacity buffer scales: base 100 + 5 max capacity per operational Scrubber.
     - **Food Balance:** Farm (+4 Food/tick) vs. Colonists (-2 Food/tick per living colonist).
     - **Life Support Health Rule:** If oxygen is 0 OR power is 0 OR food is 0 at the end of a tick, every colonist loses 2 health (50-tick survival buffer). Otherwise, colonists recover 1 health/tick (up to 100).
     - **Colony Spacing & Buffer Zones:** Structures with $\le 1$ adjacent orthogonal neighbor operate at 100% full nominal output. Overcrowded structures with $\ge 2$ neighbors suffer -1 output per additional neighbor (min 0).
     - **Arrival Cadence & Capacity:** 1 colonist arrives every 300 ticks carrying 2 electronics, capped at total habitat capacity (`2 * numHabitats`).
     - **Rover Specs & Speed:** Rovers travel at 1 tile per tick (`1.0 tile/tick`), draining 1.5 PWR/tick. Dispatch fuels rover to full charge (150 PWR) using 1 Battery Cell.
     - **Building Costs & Controls:**
        - Habitat: `20 PWR, 10 ORE`
        - Solar: `15 PWR`
        - Scrubber: `15 PWR, 5 ORE`
        - Extractor: `25 PWR` (mines 3 ore/tick from local tile deposit until tile reaches 0). Can be deactivated (0 PWR draw) and relocated to fresh deposits for `10 PWR`.
        - Farm: `20 PWR, 5 ORE`
        - Garage: `30 PWR, 10 ORE` (houses up to 2 rovers, supplies initial battery cells)
        - Refinery: `25 PWR, 15 ORE` (converts 10 ore to 1 battery cell, max 20 capacity, decays -1 efficiency/tick)
      - **Maintenance Pressures:**
        - Breakage: 1-in-4,000 chance per operational building per tick (requires adjacent colonist labor: 30 ticks for scrubbers, 50 ticks for others, plus electronics: 1 for habitat/solar/scrubber/farm, 2 for extractor/garage/refinery).
        - Dust Storms: 30% chance every 1,500 ticks starting Sol 2.5 (tick 2,500) to bury up to 2 buildings (requires colonist for 40 ticks to dig out).
        - Aging Attrition: Colonists die of old age between 6,000 and 10,000 ticks (avg 8,000).

5. **Place Structures & Execute Actions via Browser**:
   - If a building is affordable and required to prevent starvation, support incoming colonists, supply power/oxygen, or establish rover operations, invoke `/browser` to place the building with spacing buffers.
   - Refine battery cells or dispatch rovers for mining / asteroid extraction when rovers are idle and resources permit.

6. **Check Termination**:
   - If `status === 'game_over'` or 10 minutes of real time have elapsed, exit the loop immediately.

---

## Final Report Structure

When the run concludes, generate a comprehensive report:

1. **Sols Survived**:
   - Total sols survived (derived as `Math.floor(tick / 1000)` at game over or at end of 10 minutes).
2. **Colony Status & Snapshot**:
   - Final status (`active` or `game_over`).
   - Final resource pools (`oxygen`, `power`, `food`, `ore`, `electronics`).
   - Final structure counts (`habitats`, `solars`, `scrubbers`, `extractors`, `farms`, `garages`, `refineries`) and conditions (`operational`, `broken`, `buried`, `deactivated`).
   - Final colonist population, average age, and health metrics.
   - Rover fleet state and stored battery cells.
   - What the colony was doing at the moment it stopped.
3. **Chronological Progression Log**:
   - Summary of rounds, catch-up batches applied, major building decisions, rover escort dispatches, and population milestones.
4. **Inconsistencies & Anomalies vs. CONTRACT.md**:
   - Detailed list of any discrepancies observed between simulation behavior and `CONTRACT.md` (e.g. calculation mismatches, unexpected state mutations, timing glitches, escort/arrival bugs).
   - Do not fix them; present them for review.
