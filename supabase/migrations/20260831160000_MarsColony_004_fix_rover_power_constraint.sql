-- =============================================================================
-- Migration: 20260831160000_MarsColony_004_fix_rover_power_constraint.sql
-- Description: Updates marscolony_rovers power CHECK constraint to 0-150 per CONTRACT.md.
-- Compliance: DATABASE.md, CONTRACT.md
-- =============================================================================

ALTER TABLE marscolony_rovers
    DROP CONSTRAINT IF EXISTS marscolony_rovers_power_check;

ALTER TABLE marscolony_rovers
    ADD CONSTRAINT marscolony_rovers_power_check
    CHECK (power >= 0 AND power <= 150);
