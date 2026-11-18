-- Bring the schema created by 001_create_contacts_table.sql in line with
-- the registration and invitation flows. This is safe when the columns have
-- already been added manually to a database.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS prefecture VARCHAR,
  ADD COLUMN IF NOT EXISTS city VARCHAR;

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
