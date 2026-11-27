CREATE TABLE public.daily_games (
  line_user_id TEXT PRIMARY KEY REFERENCES public.users(line_user_id) ON DELETE CASCADE,
  game_date DATE NOT NULL,
  claim_id UUID NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'ready')),
  game_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT daily_games_status_payload_check CHECK (
    (status = 'pending' AND game_data IS NULL)
    OR (status = 'ready' AND game_data IS NOT NULL)
  )
);

ALTER TABLE public.daily_games ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.daily_games FROM anon, authenticated;
GRANT ALL ON TABLE public.daily_games TO service_role;
