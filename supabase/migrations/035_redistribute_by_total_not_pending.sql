-- Migration 035: Fix backfill logic in 031/033 -- excess must be measured
-- against TOTAL assigned this cycle (completed + pending), not pending
-- alone.
--
-- contact_cap is a cap on the cycle, not a snapshot of current queue
-- depth. A volunteer who already completed more than their cap (e.g.
-- Dwayne: 18 completed against a cap of 15) is already over, even if
-- their remaining pending count looks fine in isolation. Completed
-- contacts can't be touched (immutable), so the fix is to move ALL
-- remaining pending work off anyone whose total already meets or
-- exceeds their cap, and to move min(excess, pending) off anyone whose
-- total exceeds cap by less than their full pending count.
--
-- Safe to re-run: a no-op once every capped volunteer's pending count is
-- 0 or their total no longer exceeds their cap.

DO $$
DECLARE
  v_week_starting          DATE;
  vol                       RECORD;
  v_asn                     RECORD;
  v_excess                  INT;
  v_to_move                 INT;
  v_moved                   INT;
  v_uncapped_ids            UUID[];
  v_uncapped_emails         TEXT[];
  v_uncapped_non_technical  BOOLEAN[];
  v_uncapped_count          INT;
  v_pointer                 INT := 0;
  v_tries                   INT;
BEGIN
  SELECT MAX(week_starting) INTO v_week_starting FROM assignments;

  SELECT array_agg(id ORDER BY created_at ASC),
         array_agg(email ORDER BY created_at ASC),
         array_agg(is_non_technical ORDER BY created_at ASC)
    INTO v_uncapped_ids, v_uncapped_emails, v_uncapped_non_technical
  FROM profiles
  WHERE role IN ('volunteer', 'admin')
    AND is_active = true
    AND contact_cap IS NULL;

  v_uncapped_count := COALESCE(array_length(v_uncapped_ids, 1), 0);

  IF v_uncapped_count = 0 THEN
    RAISE NOTICE 'No uncapped volunteers available to absorb overage. Nothing moved.';
    RETURN;
  END IF;

  FOR vol IN
    SELECT p.id, p.full_name, p.contact_cap,
           (SELECT COUNT(*) FROM assignments a
            WHERE a.caller_id = p.id
              AND a.week_starting = v_week_starting) AS total_count,
           (SELECT COUNT(*) FROM assignments a
            WHERE a.caller_id = p.id
              AND a.week_starting = v_week_starting
              AND a.status = 'pending') AS pending_count
    FROM profiles p
    WHERE p.role IN ('volunteer', 'admin')
      AND p.is_active = true
      AND p.contact_cap IS NOT NULL
  LOOP
    v_excess := vol.total_count - vol.contact_cap;
    v_to_move := LEAST(GREATEST(v_excess, 0), vol.pending_count);

    IF v_to_move <= 0 THEN
      RAISE NOTICE '% | cap=% | total=% | pending=% | no excess, nothing to move.',
        vol.full_name, vol.contact_cap, vol.total_count, vol.pending_count;
      CONTINUE;
    END IF;

    v_moved := 0;
    FOR v_asn IN
      SELECT asn.id, m.email, m.phone, m.address
      FROM assignments asn
      JOIN members m ON m.id = asn.member_id
      WHERE asn.caller_id = vol.id
        AND asn.week_starting = v_week_starting
        AND asn.status = 'pending'
      ORDER BY asn.member_id
      LIMIT v_to_move
    LOOP
      v_tries := 0;
      WHILE v_tries < v_uncapped_count LOOP
        IF v_uncapped_emails[v_pointer + 1] IS DISTINCT FROM v_asn.email
          AND (v_uncapped_non_technical[v_pointer + 1] = false
            OR v_asn.phone IS NOT NULL OR v_asn.address IS NOT NULL)
        THEN
          UPDATE assignments SET caller_id = v_uncapped_ids[v_pointer + 1]
          WHERE id = v_asn.id;
          v_pointer := (v_pointer + 1) % v_uncapped_count;
          v_moved := v_moved + 1;
          EXIT;
        END IF;
        v_pointer := (v_pointer + 1) % v_uncapped_count;
        v_tries := v_tries + 1;
      END LOOP;
    END LOOP;

    RAISE NOTICE '% | cap=% | total=% | pending=% | moved % of % to uncapped volunteers.',
      vol.full_name, vol.contact_cap, vol.total_count, vol.pending_count, v_moved, v_to_move;
  END LOOP;
END $$;
