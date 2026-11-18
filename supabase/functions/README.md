# Edge Functions（API・通知まわり）

| 関数 | 呼び出し元 | 役割 |
|---|---|---|
| `checkin` | LIFF（App.jsx） | ID トークンで本人確認してチェックインを記録 |
| `daily-checkin-reminder` | pg_cron（毎朝8時） | チェックインが必要な高齢者に「元気ですか？」を送る |
| `overdue-alert` | pg_cron（毎時） | `send_notification_days` 日チェックインがない高齢者の見守る側に通知 |

共通処理は `_shared/` にある（`line.ts` = LINE送信、`checkin.ts` = 日付計算・最終チェックイン、`cors.ts`）。

## シークレット

```sh
supabase secrets set \
  LINE_CHANNEL_ACCESS_TOKEN=... \
  LINE_LOGIN_CHANNEL_ID=... \
  LIFF_ID=... \
  CRON_SECRET=... \
  CHECK_INTERVAL_HOURS=1
```

`SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` は Supabase が自動で入れてくれる。

## デプロイ

```sh
supabase functions deploy checkin
supabase functions deploy daily-checkin-reminder
supabase functions deploy overdue-alert
```

JWT 検証は `supabase/config.toml` の `verify_jwt = false` で切っている。理由: `checkin` は LINE の ID トークンで、cron の2つは `x-cron-secret` で認証しているため。

## LIFF 側の設定

LINE Developers の LIFF アプリ設定で、Scope に `openid`（と `profile`）を入れる。入っていないと `liff.getIDToken()` が null になる。

## cron の登録（SQL Editor で実行）

先に Vault に `project_url`（`https://xxxx.supabase.co`）と `cron_secret`（`CRON_SECRET` と同じ値）を登録しておく。
pg_cron は UTC なので、日本時間 8:00 は 23:00 UTC。

```sql
SELECT cron.schedule('daily-checkin-reminder', '0 23 * * *', $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
           || '/functions/v1/daily-checkin-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
$$);

-- CHECK_INTERVAL_HOURS=1 と揃えて毎時5分に実行
SELECT cron.schedule('overdue-alert', '5 * * * *', $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
           || '/functions/v1/overdue-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
$$);
```

## 手動テスト

```sh
curl -X POST "https://xxxx.supabase.co/functions/v1/overdue-alert" -H "x-cron-secret: <CRON_SECRET>"
```

家族へ通知するまでの時間は、高齢者ごとの `users.send_notification_days`（登録フォームの「通知までの日数」）× 24時間。
テストのときは `supabase secrets set OVERDUE_HOURS=1` で全員を1時間にすると、すぐ通知まで確かめられる（終わったら `supabase secrets unset OVERDUE_HOURS`）。
