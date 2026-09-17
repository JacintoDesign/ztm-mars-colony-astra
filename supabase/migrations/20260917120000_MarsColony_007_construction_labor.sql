-- =============================================================================
-- Migration: 20260917120000_MarsColony_007_construction_labor.sql
-- Description:
--   1. Buildings may be 'constructing' until a colonist walks to the tile.
--   2. Colonist destination_type may be 'construct'.
-- =============================================================================

ALTER TABLE marscolony_buildings
    DROP CONSTRAINT IF EXISTS marscolony_buildings_condition_check;

ALTER TABLE marscolony_buildings
    ADD CONSTRAINT marscolony_buildings_condition_check
    CHECK (condition IN ('operational', 'broken', 'buried', 'deactivated', 'constructing'));

ALTER TABLE marscolony_colonists
    DROP CONSTRAINT IF EXISTS marscolony_colonists_destination_type_check;

ALTER TABLE marscolony_colonists
    ADD CONSTRAINT marscolony_colonists_destination_type_check
    CHECK (destination_type IS NULL OR destination_type IN ('habitat', 'repair', 'dig', 'rover_recovery', 'construct'));
