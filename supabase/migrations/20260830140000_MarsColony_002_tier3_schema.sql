-- =============================================================================
-- Migration: 20260830140000_MarsColony_002_tier3_schema.sql
-- Description: Tier 3 Expansion schema with ore deposits table, rovers table,
--              food, electronics, battery cells, mining sites, asteroids,
--              colonist aging, and building condition fields.
-- Compliance: DATABASE.md (Tier 3 Schema), CONTRACT.md, AGENTS.md
-- =============================================================================

-- 1. ADD TIER 3 COLUMNS TO marscolony_colonies
ALTER TABLE marscolony_colonies
    ADD COLUMN IF NOT EXISTS food INTEGER NOT NULL DEFAULT 50 CHECK (food >= 0 AND food <= 100),
    ADD COLUMN IF NOT EXISTS electronics INTEGER NOT NULL DEFAULT 0 CHECK (electronics >= 0),
    ADD COLUMN IF NOT EXISTS seed BIGINT NOT NULL DEFAULT 133742,
    ADD COLUMN IF NOT EXISTS battery_cells JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS mining_sites JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS active_asteroid JSONB DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS pending_arrivals JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2. UPDATE marscolony_buildings TYPE CHECK & ADD CONDITION COLUMNS
ALTER TABLE marscolony_buildings
    DROP CONSTRAINT IF EXISTS marscolony_buildings_type_check;

ALTER TABLE marscolony_buildings
    ADD CONSTRAINT marscolony_buildings_type_check
    CHECK (type IN ('habitat', 'solar', 'scrubber', 'extractor', 'farm', 'garage', 'refinery'));

ALTER TABLE marscolony_buildings
    ADD COLUMN IF NOT EXISTS condition TEXT NOT NULL DEFAULT 'operational' CHECK (condition IN ('operational', 'broken', 'buried')),
    ADD COLUMN IF NOT EXISTS repair_progress INTEGER NOT NULL DEFAULT 0 CHECK (repair_progress >= 0),
    ADD COLUMN IF NOT EXISTS dig_progress INTEGER NOT NULL DEFAULT 0 CHECK (dig_progress >= 0);

-- 3. ADD AGING & DESTINATION TYPE TO marscolony_colonists
ALTER TABLE marscolony_colonists
    ADD COLUMN IF NOT EXISTS age BIGINT NOT NULL DEFAULT 0 CHECK (age >= 0),
    ADD COLUMN IF NOT EXISTS lifespan BIGINT NOT NULL DEFAULT 15000 CHECK (lifespan > 0),
    ADD COLUMN IF NOT EXISTS destination_type TEXT DEFAULT 'habitat' CHECK (destination_type IN ('habitat', 'repair', 'dig', 'rover_recovery'));

-- 4. CREATE marscolony_ore_deposits TABLE (Per-tile deposits)
CREATE TABLE IF NOT EXISTS marscolony_ore_deposits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    colony_id UUID NOT NULL REFERENCES marscolony_colonies(id) ON DELETE CASCADE,
    owner UUID NOT NULL REFERENCES marscolony_users(id) ON DELETE CASCADE,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    remaining INTEGER NOT NULL DEFAULT 0 CHECK (remaining >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marscolony_ore_deposits_colony ON marscolony_ore_deposits(colony_id);
CREATE INDEX IF NOT EXISTS idx_marscolony_ore_deposits_owner ON marscolony_ore_deposits(owner);

ALTER TABLE marscolony_ore_deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marscolony_ore_deposits_select_owner"
    ON marscolony_ore_deposits FOR SELECT
    USING (auth.uid() = owner);

CREATE POLICY "marscolony_ore_deposits_insert_owner"
    ON marscolony_ore_deposits FOR INSERT
    WITH CHECK (auth.uid() = owner);

CREATE POLICY "marscolony_ore_deposits_update_owner"
    ON marscolony_ore_deposits FOR UPDATE
    USING (auth.uid() = owner)
    WITH CHECK (auth.uid() = owner);

CREATE POLICY "marscolony_ore_deposits_delete_owner"
    ON marscolony_ore_deposits FOR DELETE
    USING (auth.uid() = owner);

-- 5. CREATE marscolony_rovers TABLE (Rovers tracked individually)
CREATE TABLE IF NOT EXISTS marscolony_rovers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    colony_id UUID NOT NULL REFERENCES marscolony_colonies(id) ON DELETE CASCADE,
    owner UUID NOT NULL REFERENCES marscolony_users(id) ON DELETE CASCADE,
    garage_x INTEGER NOT NULL,
    garage_y INTEGER NOT NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    state TEXT NOT NULL DEFAULT 'idle_at_base' CHECK (state IN ('idle_at_base', 'traveling_out', 'on_site', 'traveling_back', 'stranded')),
    power INTEGER NOT NULL DEFAULT 150 CHECK (power >= 0 AND power <= 150),
    cargo JSONB DEFAULT NULL,
    destination JSONB DEFAULT NULL,
    route JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marscolony_rovers_colony ON marscolony_rovers(colony_id);
CREATE INDEX IF NOT EXISTS idx_marscolony_rovers_owner ON marscolony_rovers(owner);

ALTER TABLE marscolony_rovers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marscolony_rovers_select_owner"
    ON marscolony_rovers FOR SELECT
    USING (auth.uid() = owner);

CREATE POLICY "marscolony_rovers_insert_owner"
    ON marscolony_rovers FOR INSERT
    WITH CHECK (auth.uid() = owner);

CREATE POLICY "marscolony_rovers_update_owner"
    ON marscolony_rovers FOR UPDATE
    USING (auth.uid() = owner)
    WITH CHECK (auth.uid() = owner);

CREATE POLICY "marscolony_rovers_delete_owner"
    ON marscolony_rovers FOR DELETE
    USING (auth.uid() = owner);
