-- pair_codes のカラム名検証とリネーム（senior_id のみなら issuer_id へ変更、両方/どちらもなしはエラー停止）
DO $$
DECLARE
  has_senior_id BOOLEAN;
  has_issuer_id BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pair_codes' AND column_name = 'senior_id'
  ) INTO has_senior_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pair_codes' AND column_name = 'issuer_id'
  ) INTO has_issuer_id;

  IF has_senior_id AND has_issuer_id THEN
    RAISE EXCEPTION 'Invalid schema state: both senior_id and issuer_id exist on public.pair_codes';
  ELSIF NOT has_senior_id AND NOT has_issuer_id THEN
    RAISE EXCEPTION 'Invalid schema state: neither senior_id nor issuer_id exists on public.pair_codes';
  ELSIF has_senior_id AND NOT has_issuer_id THEN
    ALTER TABLE public.pair_codes RENAME COLUMN senior_id TO issuer_id;
  END IF;
  -- has_issuer_id のみ存在する場合は何もしない
END $$;