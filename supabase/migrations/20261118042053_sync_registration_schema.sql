ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS prefecture VARCHAR,
  ADD COLUMN IF NOT EXISTS city VARCHAR;

-- Validate and rename pair_codes.senior_id -> issuer_id safely.
DO $$
DECLARE
  has_senior_id BOOLEAN;
  has_issuer_id BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pair_codes'
      AND column_name = 'senior_id'
  ) INTO has_senior_id;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pair_codes'
      AND column_name = 'issuer_id'
  ) INTO has_issuer_id;

  IF has_senior_id AND has_issuer_id THEN
    RAISE EXCEPTION 'Invalid schema state: both senior_id and issuer_id exist on public.pair_codes';
  ELSIF NOT has_senior_id AND NOT has_issuer_id THEN
    RAISE EXCEPTION 'Invalid schema state: neither senior_id nor issuer_id exists on public.pair_codes';
  ELSIF has_senior_id AND NOT has_issuer_id THEN
    ALTER TABLE public.pair_codes RENAME COLUMN senior_id TO issuer_id;
  END IF;
END $$;

-- Existing invitation codes came from seniors, so assign them that role.
ALTER TABLE public.pair_codes
  ADD COLUMN IF NOT EXISTS issuer_role TEXT;

UPDATE public.pair_codes
SET issuer_role = 'senior'
WHERE issuer_role IS NULL;

ALTER TABLE public.pair_codes
  ALTER COLUMN issuer_role SET DEFAULT 'senior',
  ALTER COLUMN issuer_role SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.pair_codes
    WHERE issuer_role NOT IN ('senior', 'guardian')
  ) THEN
    RAISE EXCEPTION
      'public.pair_codes contains an issuer_role other than senior or guardian';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.pair_codes'::regclass
      AND conname = 'pair_codes_issuer_role_check'
  ) THEN
    ALTER TABLE public.pair_codes
      ADD CONSTRAINT pair_codes_issuer_role_check
      CHECK (issuer_role IN ('senior', 'guardian'));
  END IF;
END $$;