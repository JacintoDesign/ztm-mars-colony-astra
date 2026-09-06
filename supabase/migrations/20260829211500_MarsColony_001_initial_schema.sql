-- =============================================================================
-- Migration: MarsColony_001_initial_schema.sql
-- Description: Mars Colony database schema with 4 tables, strict RLS, and auth trigger
-- Compliance: DATABASE.md, CONTRACT.md state shape, AGENTS.md
-- =============================================================================

-- 1. USER ACCOUNTS TABLE
-- Holds account-level data (best_sols_survived) that outlives colony restarts.
CREATE TABLE IF NOT EXISTS marscolony_users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    best_sols_survived INTEGER NOT NULL DEFAULT 0 CHECK (best_sols_survived >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. COLONY TABLE
-- Holds all colony-level state fields from CONTRACT.md (except buildings & colonists).
CREATE TABLE IF NOT EXISTS marscolony_colonies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner UUID NOT NULL UNIQUE REFERENCES marscolony_users(id) ON DELETE CASCADE,
    oxygen INTEGER NOT NULL DEFAULT 50 CHECK (oxygen >= 0 AND oxygen <= 100),
    power INTEGER NOT NULL DEFAULT 50 CHECK (power >= 0 AND power <= 100),
    ore INTEGER NOT NULL DEFAULT 0 CHECK (ore >= 0),
    ore_reserve INTEGER NOT NULL DEFAULT 500 CHECK (ore_reserve >= 0),
    tick BIGINT NOT NULL DEFAULT 0 CHECK (tick >= 0),
    last_tick_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'game_over')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. BUILDINGS TABLE
-- Holds structure type, grid position (x, y), and foreign keys to colony and owner.
CREATE TABLE IF NOT EXISTS marscolony_buildings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    colony_id UUID NOT NULL REFERENCES marscolony_colonies(id) ON DELETE CASCADE,
    owner UUID NOT NULL REFERENCES marscolony_users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('habitat', 'solar', 'scrubber', 'extractor')),
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. COLONISTS TABLE
-- Holds grid position (x, y), health (0-100), destination, route, and owning colony/owner.
CREATE TABLE IF NOT EXISTS marscolony_colonists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    colony_id UUID NOT NULL REFERENCES marscolony_colonies(id) ON DELETE CASCADE,
    owner UUID NOT NULL REFERENCES marscolony_users(id) ON DELETE CASCADE,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    health INTEGER NOT NULL DEFAULT 100 CHECK (health >= 0 AND health <= 100),
    destination JSONB DEFAULT NULL,
    route JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_marscolony_colonies_owner ON marscolony_colonies(owner);
CREATE INDEX IF NOT EXISTS idx_marscolony_buildings_colony_id ON marscolony_buildings(colony_id);
CREATE INDEX IF NOT EXISTS idx_marscolony_buildings_owner ON marscolony_buildings(owner);
CREATE INDEX IF NOT EXISTS idx_marscolony_colonists_colony_id ON marscolony_colonists(colony_id);
CREATE INDEX IF NOT EXISTS idx_marscolony_colonists_owner ON marscolony_colonists(owner);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- Scoped strictly to the owning account for SELECT, INSERT, UPDATE, DELETE.
-- =============================================================================

-- Table 1: marscolony_users
ALTER TABLE marscolony_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marscolony_users_select_owner"
    ON marscolony_users FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "marscolony_users_insert_owner"
    ON marscolony_users FOR INSERT
    WITH CHECK (auth.uid() = id);

CREATE POLICY "marscolony_users_update_owner"
    ON marscolony_users FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "marscolony_users_delete_owner"
    ON marscolony_users FOR DELETE
    USING (auth.uid() = id);

-- Table 2: marscolony_colonies
ALTER TABLE marscolony_colonies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marscolony_colonies_select_owner"
    ON marscolony_colonies FOR SELECT
    USING (auth.uid() = owner);

CREATE POLICY "marscolony_colonies_insert_owner"
    ON marscolony_colonies FOR INSERT
    WITH CHECK (auth.uid() = owner);

CREATE POLICY "marscolony_colonies_update_owner"
    ON marscolony_colonies FOR UPDATE
    USING (auth.uid() = owner)
    WITH CHECK (auth.uid() = owner);

CREATE POLICY "marscolony_colonies_delete_owner"
    ON marscolony_colonies FOR DELETE
    USING (auth.uid() = owner);

-- Table 3: marscolony_buildings
ALTER TABLE marscolony_buildings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marscolony_buildings_select_owner"
    ON marscolony_buildings FOR SELECT
    USING (auth.uid() = owner);

CREATE POLICY "marscolony_buildings_insert_owner"
    ON marscolony_buildings FOR INSERT
    WITH CHECK (auth.uid() = owner);

CREATE POLICY "marscolony_buildings_update_owner"
    ON marscolony_buildings FOR UPDATE
    USING (auth.uid() = owner)
    WITH CHECK (auth.uid() = owner);

CREATE POLICY "marscolony_buildings_delete_owner"
    ON marscolony_buildings FOR DELETE
    USING (auth.uid() = owner);

-- Table 4: marscolony_colonists
ALTER TABLE marscolony_colonists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marscolony_colonists_select_owner"
    ON marscolony_colonists FOR SELECT
    USING (auth.uid() = owner);

CREATE POLICY "marscolony_colonists_insert_owner"
    ON marscolony_colonists FOR INSERT
    WITH CHECK (auth.uid() = owner);

CREATE POLICY "marscolony_colonists_update_owner"
    ON marscolony_colonists FOR UPDATE
    USING (auth.uid() = owner)
    WITH CHECK (auth.uid() = owner);

CREATE POLICY "marscolony_colonists_delete_owner"
    ON marscolony_colonists FOR DELETE
    USING (auth.uid() = owner);

-- =============================================================================
-- AUTH TRIGGER: Automatically create marscolony_users row on auth.users sign-up
-- =============================================================================
CREATE OR REPLACE FUNCTION public.marscolony_handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.marscolony_users (id, best_sols_survived)
  VALUES (NEW.id, 0)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marscolony_on_auth_user_created ON auth.users;
CREATE TRIGGER marscolony_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.marscolony_handle_new_user();
