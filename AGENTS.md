## Identity
- A browser-based isometric colony simulator on the surface of Mars.
- Players balance life support, power, and colonist health in a continuous real-time simulation.

## Stack
- Languages and runtimes: TypeScript, browser JavaScript runtime
- Frameworks and major libraries: HTML5 Canvas 2D API, Vite, Supabase JS client
- Data sources: Supabase (PostgreSQL) — colony state, auth, real-time subscriptions
- Backend: Supabase (serverless functions for the tick route)
- Deploy target: Vercel

## Conventions
- File layout: Feature-based (src/engine/, src/simulation/, src/ui/, src/assets/)
- Naming: kebab-case for files and folders, PascalCase for classes and types, camelCase for functions and variables

## Never Do
- Never mutate game simulation state directly from rendering or UI event handlers; all mutations must go through dispatched actions/commands evaluated during the simulation tick.
- Never hardcode grid coordinates or screen offsets without using the isometric coordinate transform utility.
- Never run the simulation tick on a client-side timer or requestAnimationFrame loop; the tick is a pure server-side function.
- Never derive owner identity from the client; always read it from the server session.
- Never render buildings without sorting back-to-front by grid position; overlap must always resolve correctly.
- Never deduct or grant a placement cost on the client. The server confirms affordability and applies the deduction.
- Never restart a colony from anywhere but an explicit player action on the game-over screen. No automatic retry, no agent deciding a dead colony should start over.
- Never update bestSolsSurvived from the client. The comparison and the write both happen inside the server-side tick function, at the moment of game over, nowhere else.
- Never let a broken or buried building produce, consume, or draw anything until it's repaired or dug out. Condition is checked before production runs, not after.
- Never use Math.random() for building breakage, storm timing or target selection, asteroid timing or position, or ore distribution at creation. All of it draws from the colony's own seeded generator, the same one movement already uses.
- Never let rover power, battery cell decay, or a colonist's age advance from a client-side timer. All three are tick-function arithmetic, same discipline as everything else in the simulation, no exceptions for being newer systems.
- Never extend a pending arrival's 150-tick escort window, and never let anything but a rover reaching the landing zone clear it. A colonist walking there does not count — only a rover dispatch resolves it, by design.