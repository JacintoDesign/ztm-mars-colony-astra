## Scenario 1: Oxygen starvation degrades health
Given: 1 habitat, 1 colonist, no scrubbers, oxygen 20, power 100,
       colonist health 100.
When:  the simulation runs 60 ticks with no player action.
Then:  - oxygen reaches 0 before tick 60
       - after oxygen hits 0, colonist health decreases every tick
       - at tick 60, colonist health is below 100

## Scenario 2: A balanced colony holds steady
Given: 1 habitat, 1 colonist, 1 scrubber, 1 solar, 1 farm, oxygen 50,
       power 50, food 50.
When:  the simulation runs 60 ticks with no player action.
Then:  - none of oxygen, power, or food reaches 0
       - colonist health is 100 at tick 60 and never dropped

## Scenario 3: Recovery when a scrubber is added
Given: the end state of Scenario 1.
When:  the player places a scrubber and 30 ticks pass.
Then:  - oxygen rises above 0
       - colonist health increases every tick after oxygen recovers

## Scenario 4: Batch catch-up matches live ticking
Given: any colony state and a tick count N.
When:  N ticks are applied as one batch, and separately one at a
       time from the same starting state.
Then:  - both end states are identical in every field, including
         every colonist's position, every building's condition,
         every rover's state, and pendingArrivals
       - the tick counter reads the same in both

## Scenario 5: Offline time is applied on return, and capped
Given: a draining colony, saved, with its last tick 90 minutes ago.
When:  the colony is loaded.
Then:  - roughly 5,400 ticks have been applied
       - all three life-support pools are still within 0–100
       - a colony last saved 30 days ago applies exactly 28,800
         ticks and no more

## Scenario 6: A colony is visible only to its owner
Given: two accounts, each with a colony in a different state.
When:  account A is signed in.
Then:  - account A sees only its own colony
       - a direct request for account B's colony returns nothing
       - signing out leaves no colony data readable at all

## Scenario 7: Colonist arrivals respect habitat capacity, and
## require escort to actually join
Given: 1 habitat (capacity 2), 0 colonists, a rover dispatched to
       the landing zone immediately whenever someone lands.
When:  the colony advances 900 ticks using the catch-up path.
Then:  - exactly 2 colonists exist in colonists by tick 900, not 3
       - no third arrival is ever added to pendingArrivals once
         capacity among actual colonists is full
       - the electronics stockpile increased by 2 for each of the
         two successful escorts

## Scenario 8: A colonist dies at zero health, and the colony ends
Given: 1 habitat, 1 colonist, no scrubbers, oxygen 0, power 0,
       colonist health 5.
When:  the simulation runs 2 ticks.
Then:  - the colonist's health reaches 0 and it is removed
       - colony status becomes game_over
       - a further 10 ticks change nothing in the state

## Scenario 9: A tile's ore deposit depletes independently of others
Given: two tiles with known ore deposits, tile A at 6, tile B at
       100, an extractor placed on each.
When:  the simulation runs 5 ticks.
Then:  - tile A's deposit reaches 0 by tick 2 (3 ore/tick) and its
         extractor produces 0 from that tick on
       - tile B's extractor is unaffected and keeps producing
       - both extractors continue drawing power regardless of
         production

## Scenario 10: Restarting after game over creates a genuinely
## fresh colony
Given: a colony in game_over status, with buildings in various
       conditions, a partially-mined ore distribution, stored
       battery cells, and drained oxygen, power, and food from a
       previous run.
When:  the account restarts from the game-over screen.
Then:  - oxygen, power, and food return to starting values (50 each)
       - ore returns to 25 and electronics to 2
       - starter habitat (7, 7), starter solar (5, 7), starter scrubber (9, 7),
         and 2 pioneer colonists are created; no pending arrivals, no rovers, and
         battery storage is empty
       - the colony's seed is new — its ore distribution and
         mining site positions differ from the previous run's
       - colony status returns to active
       - the account's bestSolsSurvived is unchanged by the restart

## Scenario 11: A personal best only updates when it's actually
## beaten
Given: an account with bestSolsSurvived at 10.
When:  a colony dies at tick 3,000 (3 sols) — below the existing
       best.
Then:  - colony status becomes game_over
       - the account's bestSolsSurvived remains 10, not 3
When:  a second colony from the same account instead dies at tick
       15,000 (15 sols) — above the existing best.
Then:  - the account's bestSolsSurvived updates to 15

## Scenario 12: Food is a third life-support pool, independent of
## the other two
Given: 1 habitat, 1 colonist, no farm, food 10, oxygen 100, power
       100, colonist health 100.
When:  the simulation runs 10 ticks.
Then:  - food reaches 0 by tick 4 (3 food/tick, 1 colonist)
       - colonist health drops 2/tick from tick 4 on, despite
         oxygen and power both remaining at 100 throughout
       - this confirms food alone can trigger the health rule

## Scenario 13: A broken building is repaired by the required
## colonists and electronics
Given: 1 scrubber forced to broken (bypassing the probability
       roll for a deterministic test), 1 electronics available,
       1 idle colonist nearby.
When:  the simulation runs 60 ticks.
Then:  - the scrubber produces 0 oxygen while broken
       - the nearest idle colonist is auto-assigned to repair it,
       with no player action directing that assignment
       - after 30 consecutive ticks of presence (50 ticks for non-scrubber structures)
         and 1 electronics deducted, the scrubber returns to operational and resumes
         production

## Scenario 14: Repair does not proceed without enough electronics
Given: 1 broken extractor (requires 2 electronics), electronics
       stockpile at 1, 2 idle colonists nearby.
When:  the simulation runs 200 ticks.
Then:  - the extractor stays broken; electronics stockpile stays at 1
       - idle colonists are not dispatched to repair until the colony
         has the required 2 electronics available
       - repair completes only once electronics reach 2 or more,
         confirmed in a second run seeded with 2 electronics

## Scenario 15: A dust storm buries a building, and digging out
## restores it without any resource cost
Given: 1 operational habitat, forced buried (bypassing the
       probability roll), 1 idle colonist nearby.
When:  the simulation runs 60 ticks.
Then:  - the habitat produces/draws nothing while buried
       - a colonist is auto-assigned to dig, not repair
       - after 40 consecutive ticks of presence (survivable within the 50-tick buffer),
         the habitat returns to operational
       - no ore or electronics was deducted at any point

## Scenario 16: A building that was broken before being buried
## needs digging out first, then repair
Given: 1 building, condition broken, then also buried.
When:  a colonist is auto-assigned and the simulation runs long
       enough for both processes to complete.
Then:  - digging out (40 ticks, no cost) completes before repair
         work can begin
       - once dug out, the building's condition is broken, not
         operational
       - repair then proceeds normally, requiring its own colonist
         time and electronics cost from there

## Scenario 17: A colonist dies of old age, independent of health
Given: 1 habitat, 1 colonist at full health with life support
       fully supplied, age set to one tick below their own seeded
       lifespan.
When:  the simulation runs 2 ticks.
Then:  - the colonist is removed at the tick their age reaches
         their lifespan
       - health was 100 throughout — the death is not health-
         triggered
       - if this was the only colonist, colony status becomes
         game_over

## Scenario 18: A ship lands, and a timely escort brings the
## arrival and their electronics into the colony
Given: 1 garage with 1 idle rover, a battery cell available,
       habitat capacity available.
When:  a ship lands and the rover is dispatched to the landing
       zone immediately.
Then:  - the pending arrival and their 2 electronics are picked up
         well inside the 150-tick window
       - on the rover's return, the arrival moves from
         pendingArrivals into colonists and is assigned a habitat
       - the electronics stockpile increases by exactly 2

## Scenario 19: An unescorted arrival is lost when the window
## expires
Given: 1 pending arrival at the landing zone, no rover dispatched.
When:  the simulation runs 151 ticks.
Then:  - the pending arrival is removed at tick 150
       - the colonist never appears in colonists; the habitat slot
         they would have claimed remains unclaimed
       - the 2 electronics they carried are never added to the
         stockpile

## Scenario 20: A large catch-up jump loses any arrival that lands
## inside it
Given: a colony with no rover currently dispatched, last tick 0,
       and habitat capacity for at least one more colonist.
When:  the colony catches up 900 ticks in one batch (at least one
       300-tick landing falls inside this window).
Then:  - the ship still lands at its scheduled tick inside the
         batch
       - because no rover was dispatched during the window, the
         arrival times out at landing tick + 150 within the same
         batch
       - the colonist and their electronics are lost, identically
         to Scenario 19 — catch-up does not exempt an arrival from
         the escort requirement

## Scenario 21: A rover mines a site and returns with ore
Given: 1 garage, 1 idle rover, a full battery cell, 1 mining site
       with a known yield and distance.
When:  the rover is dispatched to the site.
Then:  - the rover's state moves through traveling_out, on_site,
         traveling_back in that order
       - the ore stockpile increases by the site's yield once the
         rover returns to base
       - rover power has dropped by 1.5/tick for the entire round
         trip, mining included

## Scenario 22: A stranded rover is recovered by a colonist
Given: 1 rover dispatched with insufficient power to complete its
       round trip.
When:  the simulation runs until the rover's power reaches 0
       mid-trip.
Then:  - the rover's state becomes stranded and its cargo is lost
       - the nearest idle colonist is auto-assigned to walk to the
         rover's position
       - once the colonist arrives, the rover returns to the
         nearest garage with room and its state returns to
         idle_at_base

## Scenario 23: Battery cells decay but still gate dispatch
Given: 1 battery cell at the refinery, stored 300 ticks with no
       dispatch (well past the point efficiency floors at 0).
When:  a rover dispatch is attempted using that cell.
Then:  - the cell's efficiency is confirmed at 0, not negative
       - the cell still satisfies the dispatch requirement despite
         0 efficiency
       - the cell is consumed on dispatch regardless of its
         efficiency value

## Scenario 24: An asteroid despawns if never reached
Given: an asteroid spawned at a known position, yield, and expiry
       tick, no rover ever dispatched to it.
When:  the simulation advances past the asteroid's expiry tick.
Then:  - activeAsteroid returns to null at the expiry tick
       - no ore was collected from it
       - a second colony seeded identically produces the same
         asteroid at the same position and tick, confirming the
         same seeded-generator determinism Scenario 4 protects

## Scenario 25: Construction requires an active colonist workforce
Given: a colony with 0 living colonists, power 100, ore 100.
When:  the player or client attempts to place any building (e.g. extractor,
       scrubber, farm, solar, habitat, garage, refinery).
Then:  - the placement is rejected with blocker reason "Colonist Workforce Required"
       - no building is added to buildings
       - power and ore stockpiles are not deducted

## Scenario 26: Industrial and life-support production requires living colonists
Given: 1 operational extractor on a deposit with 100 ore, 1 operational
       scrubber, 1 operational farm, power 100, and 0 living colonists.
When:  the simulation runs 10 ticks.
Then:  - the extractor produces 0 ore; the local deposit remains at 100
       - the scrubber produces 0 oxygen
       - the farm produces 0 food
       - power draw continues for all operational structures

## Scenario 27: Monotonic tick progression across client-server sync
Given: a live colony running on client projection.
When:  server ticks synchronize or actions are dispatched rapidly with
       varying network latency.
Then:  - the tick counter displayed in Life Support Telemetry and the
         diagnostic panel never decrements or rewinds
       - tick progression is strictly monotonic (next tick >= current tick)

## Scenario 28: Direct structure power deactivation and reactivation
Given: 1 operational oxygen scrubber (draws 3 PWR, produces 5 O2), power 10, oxygen 50.
When:  the player selects the scrubber and dispatches TOGGLE_BUILDING_POWER.
Then:  - the scrubber condition transitions to deactivated
       - scrubber power draw drops to 0 PWR/tick
       - scrubber oxygen production drops to 0 O2/tick
       - the deactivated scrubber displays an amber "OFF" standby badge on map and Building Inspector
When:  the player dispatches TOGGLE_BUILDING_POWER again.
Then:  - the scrubber condition returns to operational
       - nominal power draw (3 PWR) and production (5 O2) resume

## Scenario 29: Unpowered buildings are vulnerable to dust storms and breakage
Given: 1 deactivated (unpowered) habitat and 1 deactivated solar array.
When:  a dust storm occurs at tick 2,500.
Then:  - the unpowered habitat or solar array can be chosen by the seeded generator for burial
       - upon burial, condition becomes buried, requiring colonist excavation (40 ticks)
When:  mechanical breakage rolls occur.
Then:  - unpowered structures can experience environmental breakage (condition becomes broken), requiring labor and electronics repair

## Scenario 30: Agricultural consumption and dynamic food challenge
Given: 2 living pioneer colonists, 50 starting food, 0 farms.
When:  the simulation runs 5 ticks.
Then:  - colonists consume 6 food/tick (3 food/tick per colonist), draining food from 50 to 20
When:  the player constructs 1 Hydroponic Farm (+5 food/tick, draws 2 PWR).
Then:  - food production is 5 food/tick against 6 food consumed (net -1 food/tick)
       - food reserves visibly tick down at -1/tick, providing an active life-support challenge
When:  the player constructs a 2nd Hydroponic Farm (+10 food/tick total).
Then:  - food production is 10 food/tick (net +4 food/tick surplus), steadily refilling the granary to 100/100

## Scenario 31: Emergency spare parts kit and early breakage grace period
Given: a fresh colony at tick 0 with 2 pioneer colonists and 3 starter buildings.
When:  the simulation runs from tick 0 to tick 499.
Then:  - starting inventory includes 2 Electronics (Emergency Spare Parts Kit)
       - building breakage rolls are suppressed (0% chance of random mechanical breakage before tick 500)
       - the colony is guaranteed an opportunity to construct a Garage and escort the first supply transport ship arriving at tick 300
When:  the simulation reaches tick 500+.
Then:  - environmental mechanical wear rolls activate (1-in-4,000 per building/tick)
       - any damaged structure can be immediately repaired using the 2 starting electronics or newly escorted ship supplies

## Scenario 32: Structure Demolition and Tile Reclamation
Given: 1 operational or deactivated building on tile (8, 8), colony power 50.
When:  the player inspects the building and dispatches DESTROY_BUILDING.
Then:  - 10 Power is deducted (colony power becomes 40)
       - the target building is removed from the colony's buildings array and canvas
       - tile (8, 8) becomes empty and immediately available for new construction
       - if the demolished building was an Extractor, any remaining subterranean ore on the tile is preserved intact
When:  a player attempts demolition with power < 10.
Then:  - the action is rejected with reason "Insufficient Power (Requires 10 PWR)"
       - no power is deducted and the structure remains intact

## Scenario 33: Balanced Extractor Extraction Rate and Power Draw
Given: 1 operational Extractor on a deposit with 50 ore, power 50, and living colonists.
When:  the simulation runs 10 ticks.
Then:  - the Extractor draws 1 PWR/tick (10 PWR drawn across 10 ticks)
       - the Extractor extracts 1 Ore every 5 ticks (2 ore total extracted over 10 ticks)
       - the tile's remaining deposit decreases from 50 to 48
       - the colony's ore stockpile increases by +2

## Scenario 34: Automatic Tool Deselection on Structure Selection
Given: a player has clicked a building placement tool (e.g. Solar Array or Farm) in the toolbar.
When:  the player clicks on an existing structure or the Landing Pad at (0, 0) on the canvas.
Then:  - the active placement tool is automatically deselected and the toolbar highlight clears
       - the context Building Inspector card for the clicked structure opens immediately without attempting invalid placement