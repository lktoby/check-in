-- 連絡先（メール通知先）テーブルの作成
CREATE TABLE IF NOT EXISTS contacts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  senior_id TEXT NOT NULL REFERENCES users(line_user_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  relationship TEXT,
  is_primary BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS（行レベルセキュリティ）の有効化
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- 開発用アクセス権限ポリシー
CREATE POLICY "Allow all access for contacts during dev"
ON contacts
FOR ALL
USING (true)
WITH CHECK (true);