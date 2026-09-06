---
version: alpha
name: "Mars Colony Telemetry Design System"
description: "Stark, utilitarian Mars mission telemetry — functional readouts, no decoration."
colors:
  base: "#1a0e08"
  text: "#d9dde0"
  accent: "#7fd4e0"
  warning: "#E0A030"
  critical: "#D94F3D"
typography:
  heading:
    fontFamily: "Orbitron"
  body:
    fontFamily: "Chakra Petch"
rounded:
  default: "0px"
spacing:
  base: "4px"
---

# Mars Colony Telemetry Design System

## Overview

Stark, utilitarian Mars mission telemetry — functional readouts, no decoration. The interface adopts a dark-only theme with high contrast against the Martian terrain.

## Colors

- Base: `#1a0e08` (Dark rust-brown, consistent with terrain palette)
- Text: `#d9dde0` (High legibility off-white/light gray)
- Accent: `#7fd4e0` (Cyan structure accent)
- Warning: `#E0A030` (Low-resource caution status)
- Critical: `#D94F3D` (Life support failure / emergency alert)

The accent (`#7fd4e0`) is permitted only for the active tool selector in the building toolbar. All other uses are forbidden. Critical alerts use `#D94F3D`.

## Typography

- Heading: `Orbitron` (Google Fonts) for titles, system headers, and section labels.
- Body: `Chakra Petch` (Google Fonts) for high-density telemetry numbers, status metrics, and plain-text readouts.

## Layout

High-density compact layout based on a `4px` base spacing token. Panels are compact telemetry readouts designed for dense information display rather than spacious UI.

## Elevation & Depth

No shadows, no gradients. Interfaces use flat rendering with crisp contrasting boundaries.

## Shapes

All shapes, panels, and borders use `0px` radius (strictly sharp, utilitarian industrial corners).

## Building Silhouette

Each building type is identifiable by shape alone, no labels needed:

- habitat: rounded and low
- solar: flat and angular
- extractor: wide and low, with an angled scoop silhouette
- scrubber: tall and narrow
- farm: broad and flat, a grid-like surface pattern rather than a solid mass
- garage: boxy and squared-off, with straightened isometric geometry; roof features twin beacon indicators displaying parked rover occupancy at a glance (0, 1, or 2 docked rovers)
- refinery: grounded heavy industrial furnace anchored to the terrain bedrock with a tall refining stack, catalytic reaction vessel, and battery storage manifold

All seven must read as distinct from one another at a glance.

## State on Screen

- Solar arrays glow while power > 0; go dark when the grid fails
- Scrubbers show a faint vent plume while producing oxygen (requires power and living colonist workforce)
- Extractors show a faint vent glow while producing ore (requires power, deposit ore, and living colonist workforce); the glow stops the instant that tile's deposit is exhausted or if workforce is absent, even though the building keeps drawing power
- Farms show a faint green tint while producing food (requires power and living colonist workforce); the tint fades when power fails or workforce is absent, same logic as the other producers
- Scene tints with oxygen level — clear when healthy, dusty haze as it drops
- Colonists stand upright at full health; slump as health falls; a colonist past three-quarters of their own seeded lifespan shows visibly greyed hair or an equivalent aging cue, distinct from health-based slumping — each colonist ages on their own clock, so this triggers at a different tick for every one of them. Colonists walk steadily at 1 tile per 5 ticks
- A broken building shows its normal silhouette with a small fault indicator — a flickering marker, not a colour change, since colour is reserved for the warning/critical palette
- A buried building is mostly obscured by a terrain-coloured overlay matching the surrounding tint; its silhouette should still be barely legible underneath, not fully hidden
- Tile (0, 0) features a permanent designated Landing Pad (a clean, minimalist circular ring on the tile). Building on tile (0, 0) is strictly blocked
- When a transport ship arrives, a simple conical landing capsule with small landing legs and a circular blue viewport rests on tile (0, 0), cleanly covering the landing pad circle
- A rover renders as a simple 4-wheeled car/buggy with dual seats dynamically rendering 0, 1 (driver in spacesuit with gold visor), or 2 (driver and passenger in spacesuits with gold visors) seated colonists
- An active asteroid renders as a multi-faceted 3D cratered meteorite with surface impact depressions and glowing mineral veins
- All of these read from state. None animate on their own timer.

## Components

Panels and the toolbar are plain text DOM elements rendered alongside or over the HTML5 2D Canvas viewport. The toolbar uses the accent color (`#7fd4e0`) only for the active selection, with all other items rendered in plain text color (`#d9dde0`). There are no heavy styled buttons, gradients, or modal dialogues.

### Header Bar & Guest Account Upgrade

A compact telemetry status bar in the top-right displays the current session uplink (`GUEST [id]` or operator email). For anonymous guest uplinks, an `UPGRADE ACCOUNT` affordance opens a flat modal dialogue allowing operators to attach permanent email credentials and password to their colony without losing current state.

### Viewport Navigation (Pinch-to-Zoom & Pan)

The 2D Canvas supports multi-touch pinch-to-zoom (1.0x to 3.5x scale) and pan offset navigation on touch devices, as well as mouse wheel zooming, maintaining crisp pixel grid alignment.

### Toolbar & Building Placement

- **Building Selection**: Dedicated selectors for all 7 structures (Habitat, Solar, Scrubber, Extractor, Farm, Garage, Refinery), with costs and descriptions. Collapses into a custom telemetry dropdown drawer on narrow screens.
- **Streamlined Placement Discipline**: Redundant generic action buttons are removed from the bottom toolbar; all facility-specific dispatches (refining, escorts, mining, relocation, power toggles, repairs) live contextually on the structures themselves and interactive map beacons.
- **Action Rate-Limiting**: A subtle 600ms horizontal cooldown progress bar along the toolbar top edge throttles rapid placement inputs.

### Intelligent Mission Advisor & Life Support Alerts

Positioned at top-center, the **Mission Advisor** evaluates live colony telemetry every tick to surface actionable, high-priority guidance:
- **Critical Life Support Warnings**: Urgent alerts for Power Grid Collapse (0 PWR), Oxygen Deficit (0 O2), Colony Starvation (0 Food), and Colonist Injury (<70% HP), explaining exact production vs demand math and immediate remediation steps.
- **Tactical Transport & Mining Directives**: Prompts when a transport ship arrives at Landing Pad `(0, 0)`, alerting the player to dispatch a Rover Escort or construct a Garage.
- **Progression Guidance**: Contextual tips when ore reserves are low (directing extractor placement) or battery refining is available.
- **Pinned & Dismissible**: One alert displays at a time, pinned until manually dismissed with `[✕]` or replaced by a higher-priority threat.

### Ground Ore Deposit Highlighting (Extractor Mode)

When selecting the **Extractor tool** (or initiating extractor relocation), the isometric grid dynamically highlights all tiles containing subterranean ore deposits with glowing cyan diamond outlines and `◆ ORE` indicators, allowing players to instantly identify viable extraction sites without revealing exact unmined quantities prior to placement.

### Building Inspector, 3D Selection HUD & Contextual Dispatches

Clicking any existing structure or the Landing Pad directly on the canvas opens the **Building Inspector Card**:
- **Status & Telemetry**: Displays structure condition (`OPERATIONAL`, `POWER OFF (STANDBY)`, `BROKEN`, `BURIED`), exact power draw / generation, life-support output (O2/Food/Ore), and neighbor spacing efficiency.
- **Contextual Facility Dispatches**:
  - **Rover Garage**: `[ 🚀 DISPATCH ROVER ESCORT (0,0) ]` and `[ ⛏ DISPATCH MINING EXPEDITION ]`, alongside rover bay capacity (X/2) and battery fuel status.
  - **Ore Refinery**: `[ 🔋 REFINE BATTERY CELL (10 ORE) ]` to convert stockpiled ore into long-lasting rover fuel.
  - **Landing Pad `(0, 0)`**: `[ 🚀 DISPATCH ROVER ESCORT ]` with countdown timer (`X Ticks Remaining`) when a supply transport is on-site.
- **Direct Maintenance Controls**:
  - `[ 🔧 DISPATCH REPAIR CREW ]`: Available on broken structures when the colony has sufficient electronics (1 for standard, 2 for heavy industrial). Dispatches the nearest available colonist immediately.
  - `[ ⛏ DISPATCH EXCAVATION CREW ]`: Available on buried structures (40 ticks digging, 0 cost). Dispatches the nearest available colonist immediately.
  - **Electronics Deficit Warning**: Displays exact electronics shortages and directs operators to incoming transport escorts.
- **Power, Mobility & Demolition Controls**:
  - `[ ⚡ TURN OFF POWER (0 PWR) ]` / `[ ⚡ RESTORE POWER (ON) ]` for instant load shedding.
  - `[ ✥ RELOCATE (10 PWR) ]`: Relocates operational structure to any valid open tile.
  - `[ 💥 DEMOLISH STRUCTURE (10 PWR) ]`: Permanently removes the structure and frees the tile for 10 Power (`DESTROY_BUILDING`).
- **Seamless Tool Switching & Auto-Deselection**: Clicking any existing structure on the canvas automatically cancels any active building placement tool or relocation mode, smoothly opening that building's context inspector card.
- **Canvas Highlighting**: Selected structures feature 3D corner bracket crosshairs, glowing base tile diamonds, and a floating status HUD tag (`[ ⚡ POWER: ON / OFF ]`).
- **Interactive Ship Action Beacon**: When a transport ship touches down at `(0, 0)`, an interactive `[ 🚀 DISPATCH ESCORT ]` HUD beacon renders directly overhead.
- **Keyboard Navigation**: Pressing `[P]` or `[Space]` toggles power on the selected structure, `[M]` initiates relocation, and `[Escape]` closes the inspector.

## Life Support Telemetry

The styled, player-facing counterpart to the diagnostic panel — everything the diagnostic panel shows, except signed-in account and colony owner. Full parity, not a subset: tick, oxygen, power, food, ore, electronics, colonist health and age, building condition, pending arrivals, rover and battery status all appear here, in whatever form each already takes in the diagnostic panel.

Oxygen, power, food, and colonist health get bars, colour-shifting through warning (`#E0A030`) and critical (`#D94F3D`) as they drop — the four numbers where "getting low" is a genuine life-support threat, matching the HUD states CONTRACT.md already specifies. A pending arrival's countdown gets the same warning colour once it drops under 30 ticks, per the Landing Zone states-that-must-differ rule — the one non-life-support number that still earns the palette, because losing a colonist and their electronics to an ignored countdown is exactly the kind of failure this colour exists to prevent. Ore, electronics, tick, last applied tick, building list, and rover status are plain numbers or text, no bar, no colour shift — nothing else here threatens a colonist directly, so the warning palette stays reserved for what actually does.

This panel is where CONTRACT.md's `HUD & Text Info Panels` piece is actually implemented for a player. The diagnostic panel exists in parallel, for a different reason, and neither replaces the other.

## Landing Zone

A pending arrival stands at tile (0, 0) rendered like any colonist — same figure, same posture rules — but with a countdown above them showing ticks remaining before their escort window closes. Standard text colour above 30 ticks, warning colour below it, no other change. No animation on the transition; the colour just changes the tick it changes, same as every other state-driven visual in this document.

## Diagnostic Panel

Two blocks within the same panel, separated by a thin rule. Session identity on top — signed-in account, colony owner — kept small, since it exists purely to confirm identity and isolation and is never meaningful to a player. Full state below: tick, oxygen, power, food, ore, electronics, colonist health and age, pending arrivals, building condition, rover and battery status, last applied tick.

Both blocks stay plain text, no colour, no animation — the verification discipline from Lesson 7.5 onward doesn't relax here, this only reorganizes for clarity. The panel's id doesn't change; every playtest scenario since Lesson 7.6 reads from it by that id, reorganized or not.

Once Life Support Telemetry has full parity with this panel, this one is no longer meant for a player to see at all. It renders only when the URL includes `?debug=true` — absent by default, so a real player never encounters it, present on demand for verification. `/browser` checks and the playtest skill navigate with the flag included; nothing else about how they read the panel changes.

## Game Over Screen & Casualty Incident Report

Styled in the sci-fi terminal palette with crimson telemetry accents, displaying full mission post-mortem data:
- **Map & Ruins Backdrop**: The game grid, terrain, and building ruins remain visible behind the modal rather than blanking out.
- **Primary Failure Cause**: Dedicated alert banner highlighting the exact cause of colony failure (`CRITICAL ASPHYXIATION: Oxygen depleted to 0%`, `POWER GRID COLLAPSE: Electrical power depleted to 0%`, `COLONY STARVATION: Food reserves depleted to 0%`, or `POPULATION ATTRITION: All colonists expired of natural lifespan`).
- **Telemetry Dossier Archive**: Detailed metrics snapshot showing Sols Survived, Account Personal Best, and final resource reserves (Oxygen, Power, Food, Ore, Electronics, and Structures).
- **Restart Affordance**: Single "Start New Colony" button which executes an authoritative server-side reset and re-initializes starter buildings and pioneer colonists.

## Help Modal

Same palette and type as everything else — plain text, no imagery. Opens over the current view rather than replacing it, unlike the Game Over Screen; the colony keeps ticking underneath. A "?" affordance sits in the bottom-right corner at all times, closeable, available in any game state.

Worth being clear on why this is a second info panel and not one shared with the existing readout: the readout panel in the top-left corner exists for whatever is verifying the build — an agent, a browser check — and answers "what is the state right now." This one exists for the player and answers "what am I supposed to do." Different audience, different corner, never merged.

## Do's and Don'ts

- DO keep the dark theme fixed; no light mode.
- DO update telemetry numbers instantly on value change without tweening or animation.
- DO draw all game elements in code on the 2D Canvas surface; never load external image assets.
- DON'T use the accent color `#7fd4e0` for danger signals or critical alert borders; use `#D94F3D` for critical and `#E0A030` for warning.
- DON'T apply border radiuses, box shadows, gradients, or animated transitions.