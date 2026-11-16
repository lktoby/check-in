-- RegistrationForm fields and query indexes aligned with the current Supabase schema.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS prefecture TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT;

-- 保護者側からも招待コードを発行できるよう pair_codes を双方向対応に変更
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pair_codes'
      AND column_name = 'senior_id'
  ) THEN
    ALTER TABLE public.pair_codes
      RENAME COLUMN senior_id TO issuer_id;
  END IF;
END $$;

ALTER TABLE public.pair_codes
  ADD COLUMN IF NOT EXISTS issuer_role TEXT NOT NULL DEFAULT 'senior'
  CHECK (issuer_role IN ('senior', 'guardian'));