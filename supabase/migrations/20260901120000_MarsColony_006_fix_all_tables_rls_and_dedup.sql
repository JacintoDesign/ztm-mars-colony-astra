-- =============================================================================
-- MIGRATION 006: Fix All MarsColony Tables RLS For Anonymous Guest Access & Sync
-- =============================================================================

-- Table 1: marscolony_users
DROP POLICY IF EXISTS "marscolony_users_select_owner" ON marscolony_users;
DROP POLICY IF EXISTS "marscolony_users_insert_owner" ON marscolony_users;
DROP POLICY IF EXISTS "marscolony_users_update_owner" ON marscolony_users;

CREATE POLICY "marscolony_users_select_owner"
    ON marscolony_users FOR SELECT
    USING (auth.uid() = id OR auth.role() = 'anon');

CREATE POLICY "marscolony_users_insert_owner"
    ON marscolony_users FOR INSERT
    WITH CHECK (auth.uid() = id OR auth.role() = 'anon');

CREATE POLICY "marscolony_users_update_owner"
    ON marscolony_users FOR UPDATE
    USING (auth.uid() = id OR auth.role() = 'anon')
    WITH CHECK (auth.uid() = id OR auth.role() = 'anon');

-- Table 2: marscolony_colonies
DROP POLICY IF EXISTS "marscolony_colonies_select_owner" ON marscolony_colonies;
DROP POLICY IF EXISTS "marscolony_colonies_insert_owner" ON marscolony_colonies;
DROP POLICY IF EXISTS "marscolony_colonies_update_owner" ON marscolony_colonies;
DROP POLICY IF EXISTS "marscolony_colonies_delete_owner" ON marscolony_colonies;

CREATE POLICY "marscolony_colonies_select_owner"
    ON marscolony_colonies FOR SELECT
    USING (auth.uid() = owner OR auth.role() = 'anon');

CREATE POLICY "marscolony_colonies_insert_owner"
    ON marscolony_colonies FOR INSERT
    WITH CHECK (auth.uid() = owner OR auth.role() = 'anon');

CREATE POLICY "marscolony_colonies_update_owner"
    ON marscolony_colonies FOR UPDATE
    USING (auth.uid() = owner OR auth.role() = 'anon')
    WITH CHECK (auth.uid() = owner OR auth.role() = 'anon');

CREATE POLICY "marscolony_colonies_delete_owner"
    ON marscolony_colonies FOR DELETE
    USING (auth.uid() = owner OR auth.role() = 'anon');

-- Table 3: marscolony_buildings
DROP POLICY IF EXISTS "marscolony_buildings_select_owner" ON marscolony_buildings;
DROP POLICY IF EXISTS "marscolony_buildings_insert_owner" ON marscolony_buildings;
DROP POLICY IF EXISTS "marscolony_buildings_update_owner" ON marscolony_buildings;
DROP POLICY IF EXISTS "marscolony_buildings_delete_owner" ON marscolony_buildings;

CREATE POLICY "marscolony_buildings_select_owner"
    ON marscolony_buildings FOR SELECT
    USING (auth.uid() = owner OR auth.role() = 'anon');

CREATE POLICY "marscolony_buildings_insert_owner"
    ON marscolony_buildings FOR INSERT
    WITH CHECK (auth.uid() = owner OR auth.role() = 'anon');

CREATE POLICY "marscolony_buildings_update_owner"
    ON marscolony_buildings FOR UPDATE
    USING (auth.uid() = owner OR auth.role() = 'anon')
    WITH CHECK (auth.uid() = owner OR auth.role() = 'anon');

CREATE POLICY "marscolony_buildings_delete_owner"
    ON marscolony_buildings FOR DELETE
    USING (auth.uid() = owner OR auth.role() = 'anon');

-- Table 4: marscolony_colonists
DROP POLICY IF EXISTS "marscolony_colonists_select_owner" ON marscolony_colonists;
DROP POLICY IF EXISTS "marscolony_colonists_insert_owner" ON marscolony_colonists;
DROP POLICY IF EXISTS "marscolony_colonists_update_owner" ON marscolony_colonists;
DROP POLICY IF EXISTS "marscolony_colonists_delete_owner" ON marscolony_colonists;

CREATE POLICY "marscolony_colonists_select_owner"
    ON marscolony_colonists FOR SELECT
    USING (auth.uid() = owner OR auth.role() = 'anon');

CREATE POLICY "marscolony_colonists_insert_owner"
    ON marscolony_colonists FOR INSERT
    WITH CHECK (auth.uid() = owner OR auth.role() = 'anon');

CREATE POLICY "marscolony_colonists_update_owner"
    ON marscolony_colonists FOR UPDATE
    USING (auth.uid() = owner OR auth.role() = 'anon')
    WITH CHECK (auth.uid() = owner OR auth.role() = 'anon');

CREATE POLICY "marscolony_colonists_delete_owner"
    ON marscolony_colonists FOR DELETE
    USING (auth.uid() = owner OR auth.role() = 'anon');

-- Table 5: marscolony_ore_deposits
DROP POLICY IF EXISTS "marscolony_ore_deposits_select_owner" ON marscolony_ore_deposits;
DROP POLICY IF EXISTS "marscolony_ore_deposits_insert_owner" ON marscolony_ore_deposits;
DROP POLICY IF EXISTS "marscolony_ore_deposits_update_owner" ON marscolony_ore_deposits;
DROP POLICY IF EXISTS "marscolony_ore_deposits_delete_owner" ON marscolony_ore_deposits;

CREATE POLICY "marscolony_ore_deposits_select_owner"
    ON marscolony_ore_deposits FOR SELECT
    USING (auth.uid() = owner OR auth.role() = 'anon');

CREATE POLICY "marscolony_ore_deposits_insert_owner"
    ON marscolony_ore_deposits FOR INSERT
    WITH CHECK (auth.uid() = owner OR auth.role() = 'anon');

CREATE POLICY "marscolony_ore_deposits_update_owner"
    ON marscolony_ore_deposits FOR UPDATE
    USING (auth.uid() = owner OR auth.role() = 'anon')
    WITH CHECK (auth.uid() = owner OR auth.role() = 'anon');

CREATE POLICY "marscolony_ore_deposits_delete_owner"
    ON marscolony_ore_deposits FOR DELETE
    USING (auth.uid() = owner OR auth.role() = 'anon');
