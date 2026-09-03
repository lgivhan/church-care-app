-- Migration 029: One-time backfill for members stranded by the Aug 28
-- cycle's no-repeat gap (see migration 028 for the root cause and the
-- permanent Pass 3 fix in generate_weekly_assignments()).
--
-- The Aug 28 cycle already exists, so generate_weekly_assignments() will
-- just skip on re-run (it no-ops when assignments already exist for the
-- week). This runs Pass 3's fallback logic once, directly, scoped to that
-- specific week_starting, so the currently-stranded members get a caller
-- for the rest of this cycle instead of waiting until the Sept 11 run.
--
-- Safe to re-run: it only ever targets members still unassigned for
-- week_starting = '2026-08-28', so once they're covered this is a no-op.

DO $$
DECLARE
  v_week_starting     DATE := '2026-08-28';
  v_vol_ids           UUID[];
  v_vol_emails        TEXT[];
  v_vol_non_technical BOOLEAN[];
  v_vol_count         INT;
  v_pointer           INT := 0;
  v_tries             INT;
  m2                  RECORD;
BEGIN
  SELECT array_agg(id ORDER BY created_at ASC),
         array_agg(email ORDER BY created_at ASC),
         array_agg(is_non_technical ORDER BY created_at ASC)
    INTO v_vol_ids, v_vol_emails, v_vol_non_technical
  FROM profiles
  WHERE role IN ('volunteer', 'admin')
    AND is_active = true;

  v_vol_count := COALESCE(array_length(v_vol_ids, 1), 0);

  IF v_vol_count > 0 THEN
    FOR m2 IN
      SELECT m.id, m.email, m.phone, m.address
      FROM members m
      WHERE (m.phone IS NOT NULL OR m.address IS NOT NULL OR m.email IS NOT NULL)
        AND m.is_child = false
        AND m.excluded_from_assignments = false
        AND m.id NOT IN (
          SELECT member_id FROM assignments WHERE week_starting = v_week_starting
        )
      ORDER BY m.last_contacted ASC NULLS FIRST
    LOOP
      v_tries := 0;
      WHILE v_tries < v_vol_count LOOP
        IF v_vol_emails[v_pointer + 1] IS DISTINCT FROM m2.email
          AND (v_vol_non_technical[v_pointer + 1] = false
            OR m2.phone IS NOT NULL OR m2.address IS NOT NULL)
        THEN
          INSERT INTO assignments (caller_id, member_id, status, week_starting)
          VALUES (v_vol_ids[v_pointer + 1], m2.id, 'pending', v_week_starting);
          v_pointer := (v_pointer + 1) % v_vol_count;
          EXIT;
        END IF;
        v_pointer := (v_pointer + 1) % v_vol_count;
        v_tries := v_tries + 1;
      END LOOP;
    END LOOP;
  END IF;

  RAISE NOTICE 'Backfilled stranded members for cycle starting %.', v_week_starting;
END;
$$;
