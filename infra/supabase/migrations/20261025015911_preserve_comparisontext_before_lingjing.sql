-- User-authorized replacement of comparisontext after a verified encrypted export.
-- Preserve all rows and IDs in an unexposed schema; no DROP, DELETE, or TRUNCATE.
-- Source archive backup: artifacts/cloud-upgrade/2026-10-25/comparisontext-backup/manifest.json.
-- Restore: with old-app traffic stopped, move these tables back to public and restore
-- the original grants from the encrypted export. Never expose the archive to clients.
-- Replay-only adaptation: clean new databases have no comparisontext source.
-- Exact original execution is retained under ../operations/20261025015911-preserve-comparisontext.executed.sql.
DO $preserve$
DECLARE
  expected jsonb := '{"chat":{"rows":0,"sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"},"post":{"rows":0,"sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"},"role":{"rows":4,"sha256":"cbab1be0094adabc174254e90b9656ac9ba74a3520adae959755cf1fae3c6599"},"user":{"rows":4,"sha256":"4bc4b95e2741f0045cf988ec246154968fd62960d9482df9398fa432fa7a5a52"},"order":{"rows":0,"sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"},"apikey":{"rows":0,"sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"},"config":{"rows":12,"sha256":"7ba12b1c25a1127a0b5da19818173305fd7dacc86b0e309ed3cad65844cbcc12"},"credit":{"rows":3,"sha256":"86c619d48a9db1f411b9b630b16328d22bd7a59c29c3c4d6f90c522bf32d1b17"},"account":{"rows":4,"sha256":"ffcfa35590183badb0a2fef7276fa93dfde0c6dd19f6c4b0f59abe641e06e4c9"},"ai_task":{"rows":0,"sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"},"session":{"rows":9,"sha256":"9481c53b13be7a025d6204b49c68f87a72dd2827b107598270559fb59339cd12"},"taxonomy":{"rows":0,"sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"},"user_role":{"rows":1,"sha256":"a2fd1401cbb8b504854b6950068ca67bddffdea065e9f621d94d50f9c59d9abf"},"permission":{"rows":29,"sha256":"41d26d4b8869ba5f4d5278044d4a66b28100bbe6e7c75d4aa3ba898923ac7b78"},"chat_message":{"rows":0,"sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"},"subscription":{"rows":0,"sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"},"verification":{"rows":0,"sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"},"role_permission":{"rows":34,"sha256":"d549aa11ae0240ecb57614dbb2ee6e5564e7877c23f3b2c3713d604b2faa2041"}}'::jsonb;
  entry record;
  actual_rows jsonb;
  source_count integer;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='comparisontext_archive_20261025') THEN
    RAISE EXCEPTION 'Archive schema already exists; inspect before reapplying';
  END IF;
  SELECT count(*) INTO source_count FROM jsonb_object_keys(expected) key
    WHERE to_regclass(format('public.%I',key)) IS NOT NULL;
  IF source_count=0 THEN
    RAISE NOTICE 'No original comparisontext source on this clean database; preservation step skipped';
    RETURN;
  ELSIF source_count<>(SELECT count(*) FROM jsonb_object_keys(expected)) THEN
    RAISE EXCEPTION 'Partial original comparisontext source; inspect and export before replacement';
  END IF;
  -- Lock every source before checking the backup fingerprint, preventing a race.
  FOR entry IN SELECT key, value FROM jsonb_each(expected) ORDER BY key LOOP
    EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE',entry.key);
  END LOOP;
  FOR entry IN SELECT key, value FROM jsonb_each(expected) ORDER BY key LOOP
    EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb) FROM public.%I t',entry.key) INTO actual_rows;
    IF jsonb_array_length(actual_rows) <> (entry.value->>'rows')::integer
      OR encode(extensions.digest(actual_rows::text,'sha256'),'hex') <> entry.value->>'sha256' THEN
      RAISE EXCEPTION 'Source % changed since backup; export again before replacement',entry.key;
    END IF;
  END LOOP;
  CREATE SCHEMA comparisontext_archive_20261025;
  REVOKE ALL ON SCHEMA comparisontext_archive_20261025 FROM PUBLIC, anon, authenticated;
  FOR entry IN SELECT key, value FROM jsonb_each(expected) ORDER BY key LOOP
    EXECUTE format('ALTER TABLE public.%I SET SCHEMA comparisontext_archive_20261025',entry.key);
    EXECUTE format('ALTER TABLE comparisontext_archive_20261025.%I ENABLE ROW LEVEL SECURITY',entry.key);
    EXECUTE format('REVOKE ALL ON TABLE comparisontext_archive_20261025.%I FROM PUBLIC, anon, authenticated',entry.key);
    EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb) FROM comparisontext_archive_20261025.%I t',entry.key) INTO actual_rows;
    IF encode(extensions.digest(actual_rows::text,'sha256'),'hex') <> entry.value->>'sha256' THEN
      RAISE EXCEPTION 'Archive fingerprint mismatch for %',entry.key;
    END IF;
  END LOOP;
  REVOKE ALL ON ALL SEQUENCES IN SCHEMA comparisontext_archive_20261025 FROM PUBLIC, anon, authenticated;
  COMMENT ON SCHEMA comparisontext_archive_20261025 IS 'Preserved comparisontext original data, 2026-10-25. Private, no client grants. Encrypted verified export retained outside Git before user-authorized Lingjing reuse.';
END
$preserve$;
