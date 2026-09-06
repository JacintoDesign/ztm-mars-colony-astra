-- =============================================================================
-- Migration: 20260831150000_MarsColony_003_server_simulation.sql
-- Description: Adds was_broken_before_burial column to marscolony_buildings
--              to persist condition through dust storm burial per CONTRACT.md & Scenario 16.
-- Compliance: DATABASE.md, CONTRACT.md, PLAYTEST_PLAN.md
-- =============================================================================

ALTER TABLE marscolony_buildings
    ADD COLUMN IF NOT EXISTS was_broken_before_burial BOOLEAN NOT NULL DEFAULT false;
