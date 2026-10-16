-- 1. users テーブル（高齢者・保護者共通）
CREATE TABLE IF NOT EXISTS users (
  line_user_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  roles TEXT[] DEFAULT '{senior}',
  send_notification_days INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access for users during dev" ON users FOR ALL USING (true) WITH CHECK (true);


-- 2. relationships テーブル（保護者との紐付け）
CREATE TABLE IF NOT EXISTS relationships (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  senior_id TEXT NOT NULL REFERENCES users(line_user_id) ON DELETE CASCADE,
  guardian_id TEXT NOT NULL REFERENCES users(line_user_id) ON DELETE CASCADE,
  relationship_type TEXT DEFAULT '家族',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(senior_id, guardian_id)
);

ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access for relationships during dev" ON relationships FOR ALL USING (true) WITH CHECK (true);


-- 3. pair_codes テーブル（アプリ内招待コード）
CREATE TABLE IF NOT EXISTS pair_codes (
  code TEXT PRIMARY KEY,
  senior_id TEXT NOT NULL REFERENCES users(line_user_id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE pair_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access for pair_codes during dev" ON pair_codes FOR ALL USING (true) WITH CHECK (true);


-- 4. check_ins テーブル（チェックイン履歴）
CREATE TABLE IF NOT EXISTS check_ins (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  line_user_id TEXT NOT NULL REFERENCES users(line_user_id) ON DELETE CASCADE,
  display_name TEXT,
  checked_in_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE check_ins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access for check_ins during dev" ON check_ins FOR ALL USING (true) WITH CHECK (true);