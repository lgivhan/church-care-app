-- Migration 033: Re-run the pending-excess redistribution against current
-- live state (same logic as migration 031, generalized to every capped
-- volunteer, not scoped to one cycle date -- run again in case completions
-- have shifted since 031, or to catch anyone missed).
--
-- For every volunteer whose PENDING (not yet contacted) assignment count
-- for the active cycle exceeds their contact_cap, moves the excess to
-- volunteers with no cap set, round-robin. Completed contacts are never
-- touched (immutable). Safe to re-run: a no-op once everyone's pending
-- count is at or under their cap.

DO $$
DECLARE
  v_week_starting          DATE;
  vol                       RECORD;
  v_asn                     RECORD;
  v_excess                  INT;
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
              AND a.week_starting = v_week_starting
              AND a.status = 'pending') AS pending_count
    FROM profiles p
    WHERE p.role IN ('volunteer', 'admin')
      AND p.is_active = true
      AND p.contact_cap IS NOT NULL
  LOOP
    v_excess := vol.pending_count - vol.contact_cap;
    IF v_excess <= 0 THEN
      RAISE NOTICE '% | cap=% | pending=% | no excess, nothing to move.',
        vol.full_name, vol.contact_cap, vol.pending_count;
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
      LIMIT v_excess
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

    RAISE NOTICE '% | cap=% | pending=% | moved % of % excess to uncapped volunteers.',
      vol.full_name, vol.contact_cap, vol.pending_count, v_moved, v_excess;
  END LOOP;
END $$;
