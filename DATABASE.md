# Database law

This database is shared by two unrelated applications.

## Namespacing
- This project owns tables prefixed `marscolony_` and nothing else.
- Tables prefixed `waypoint_` belong to a different application.
  Never read, write, alter or reference them.
- The auth tables are common to both. Read them. Never alter their
  structure.
- Each application keeps its own user table. `marscolony_users` and
  `waypoint_users` are not the same table and never share rows.

## Access & Simulation Execution
- Every `marscolony_` table has an owner column referencing the
  authenticated user.
- Row-level security is enabled on every `marscolony_` table, scoped
  to the current user for select, insert, update and delete.
- Application code uses the session's credentials so those policies
  apply. The service role key is not used by application code.
- Serverless edge functions (`tick`, `action`) execute pure authoritative
  simulation arithmetic and persist mutations to Supabase. When edge
  functions are unreachable in local/offline environments, the client
  utilizes `server-simulation.ts` as an identical direct-database
  authoritative simulation fallback runner.

## Migrations
- Migration files are prefixed `marscolony_` and only ever contain
  statements affecting `marscolony_` tables.
- Never run a command operating on the whole remote schema — reset,
  pull, or equivalent. Those are project-wide.
- Never drop a table. Propose the change and stop.

## Tier 3 Schema
- `marscolony_ore_deposits` gets its own table, matching the existing
  buildings table's shape: many rows, each independently mutated as
  a deposit depletes. Same pattern as buildings, same reasoning.
- `marscolony_rovers` gets its own table, matching the existing
  colonists table's shape: a small but individually-tracked set of
  entities, each with its own state machine and position. Rover power
  is constrained to 0–150 with default 150.
- `marscolony_buildings` includes `was_broken_before_burial` (boolean,
  default false) to persist prior broken state across dust storm burials.
- Battery cells, mining sites, the active asteroid, and the seed
  itself stay as JSONB columns on `marscolony_colonies`. None of them
  need row-level access on their own — mining sites are three fixed
  values set once, the active asteroid is at most one value that's
  usually null, battery cells are a small bounded array whose only
  behavior is a shared decay rule. A table earns its place by having
  rows that get queried or mutated independently; none of these do.
- `pendingArrivals` stays JSONB on `marscolony_colonies` too, for the
  same reason — it's small, short-lived, and nothing about it needs
  independent row access the way a building or a colonist does.