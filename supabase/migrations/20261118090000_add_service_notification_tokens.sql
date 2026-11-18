-- LINEミニアプリのサービスメッセージ用「サービス通知トークン」を保存するテーブル
--
-- サービスメッセージは、ユーザーの操作（チェックイン・登録・見守り連携）のときに
-- LIFF アクセストークンから通知トークンを発行し、それを使って後から送る仕組み。
-- 1つのトークンで送れる回数（remaining_count）と有効期限（1年）があり、
-- 送るたびに新しいトークンが返ってくるので、ここで上書き保存していく。
--
--   purpose = 'checkin'  … 高齢者への毎朝の「元気ですか？」（チェックイン・登録時に発行）
--   purpose = 'guardian' … 見守る側への未チェックイン通知（見守り連携・登録時に発行）
--
-- Edge Function（service_role）からだけ読み書きする。トークンは秘密情報なので
-- RLS を有効にしてポリシーは作らない（ブラウザの publishable key からは読めない）。

CREATE TABLE IF NOT EXISTS public.service_notification_tokens (
  line_user_id TEXT NOT NULL REFERENCES public.users(line_user_id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('checkin', 'guardian')),
  notification_token TEXT NOT NULL,
  remaining_count INT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  session_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (line_user_id, purpose)
);

ALTER TABLE public.service_notification_tokens ENABLE ROW LEVEL SECURITY;
