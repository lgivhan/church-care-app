-- Migration 032: Read-only diagnostic report (no schema/data changes).
--
-- Confirms the current contact_cap and pending-assignment count for the
-- volunteers named in the secretary's report (Karen, Murli, Dwayne,
-- Michelle Duke) after migration 031's backfill, to check whether each
-- one's cap was actually saved in the system.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.full_name, p.contact_cap,
           (SELECT COUNT(*) FROM assignments a
            WHERE a.caller_id = p.id
              AND a.week_starting = '2026-08-28'
              AND a.status = 'pending') AS pending_count,
           (SELECT COUNT(*) FROM assignments a
            WHERE a.caller_id = p.id
              AND a.week_starting = '2026-08-28') AS total_count
    FROM profiles p
    WHERE p.full_name ILIKE '%karen%'
       OR p.full_name ILIKE '%murli%'
       OR p.full_name ILIKE '%dwayne%'
       OR p.full_name ILIKE '%duke%'
    ORDER BY p.full_name
  LOOP
    RAISE NOTICE '% | cap=% | pending=% | total_this_cycle=%',
      r.full_name, r.contact_cap, r.pending_count, r.total_count;
  END LOOP;
END $$;
