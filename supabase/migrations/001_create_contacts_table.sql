-- 1. users テーブルの作成
CREATE TABLE IF NOT EXISTS users (
  line_user_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  roles TEXT[] DEFAULT '{senior}',
  phone_number TEXT,
  region TEXT,
  age INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- users の RLS 有効化と開発用ポリシー
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access for users during dev"
ON users FOR ALL USING (true) WITH CHECK (true);


-- 2. contacts テーブルの作成
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

-- contacts の RLS 有効化と開発用ポリシー
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access for contacts during dev"
ON contacts FOR ALL USING (true) WITH CHECK (true);