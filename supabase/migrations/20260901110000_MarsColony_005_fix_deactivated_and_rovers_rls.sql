-- =============================================================================
-- Migration: 20260901110000_MarsColony_005_fix_deactivated_and_rovers_rls.sql
-- Description: 
--   1. Updates marscolony_buildings condition CHECK constraint to include 'deactivated' per CONTRACT.md.
--   2. Updates marscolony_rovers RLS policies to allow anonymous/guest users (auth.role() = 'anon').
-- Compliance: DATABASE.md, CONTRACT.md
-- =============================================================================

-- 1. UPDATE marscolony_buildings condition CHECK constraint
ALTER TABLE marscolony_buildings
    DROP CONSTRAINT IF EXISTS marscolony_buildings_condition_check;

ALTER TABLE marscolony_buildings
    ADD CONSTRAINT marscolony_buildings_condition_check
    CHECK (condition IN ('operational', 'broken', 'buried', 'deactivated'));

-- 2. UPDATE marscolony_rovers RLS policies for anonymous/guest sessions
DROP POLICY IF EXISTS "marscolony_rovers_select_owner" ON marscolony_rovers;
DROP POLICY IF EXISTS "marscolony_rovers_insert_owner" ON marscolony_rovers;
DROP POLICY IF EXISTS "marscolony_rovers_update_owner" ON marscolony_rovers;
DROP POLICY IF EXISTS "marscolony_rovers_delete_owner" ON marscolony_rovers;

CREATE POLICY "marscolony_rovers_select_owner"
    ON marscolony_rovers FOR SELECT
    USING (auth.uid() = owner OR auth.role() = 'anon');

CREATE POLICY "marscolony_rovers_insert_owner"
    ON marscolony_rovers FOR INSERT
    WITH CHECK (auth.uid() = owner OR auth.role() = 'anon');

CREATE POLICY "marscolony_rovers_update_owner"
    ON marscolony_rovers FOR UPDATE
    USING (auth.uid() = owner OR auth.role() = 'anon')
    WITH CHECK (auth.uid() = owner OR auth.role() = 'anon');

CREATE POLICY "marscolony_rovers_delete_owner"
    ON marscolony_rovers FOR DELETE
    USING (auth.uid() = owner OR auth.role() = 'anon');
