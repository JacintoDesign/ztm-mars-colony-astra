-- Oxygen capacity scales with operational scrubbers (100 + 5 per scrubber).
-- The original CHECK (oxygen <= 100) rejected those saves, which froze tick
-- persistence around the moment a second scrubber filled the tank.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'marscolony_colonies'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%oxygen%'
  LOOP
    EXECUTE format('ALTER TABLE marscolony_colonies DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE marscolony_colonies
  ADD CONSTRAINT marscolony_colonies_oxygen_check CHECK (oxygen >= 0 AND oxygen <= 1000);
