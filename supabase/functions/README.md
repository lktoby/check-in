# Edge Functions（API・通知まわり）

画面は LINEミニアプリ（LIFF）、通知は **LINE公式アカウント（Messaging API）** から送る。

| 関数 | 呼び出し元 | 役割 |
|---|---|---|
| `daily-checkin-reminder` | pg_cron（毎朝8時） | 今日まだチェックインしていない高齢者に「元気ですか？」を送る |
| `overdue-alert` | pg_cron（毎時） | `send_notification_days` 日チェックインがない高齢者の見守る側に通知 |
| `checkin` | LIFF（今は未使用） | ID トークンで本人確認してチェックインを記録。RLS を締めるときに HomeScreen の直接 insert から切り替える |

共通処理は `_shared/` にある（`line.ts` = LINE送信、`auth.ts` = ID トークン検証、`checkin.ts` = 日付計算・最終チェックイン、`cors.ts`）。

## LINE 側の準備

1. 公式アカウントの Messaging API チャネルが、ミニアプリ（LIFF）のチャネルと **同じプロバイダー** にあることを確認する（違うとユーザーIDが一致せず届かない）
2. LINE Official Account Manager の「応答設定」で、あいさつメッセージ・応答メッセージをオフにする
3. Messaging API チャネルの「Messaging API設定」でチャネルアクセストークン（長期）を発行する
4. 通知を受け取る人（高齢者・見守る側）は、公式アカウントを友だち追加しておく（QR コードは同じタブにある）
5. LIFF アプリの Scope に `openid`（と `profile`）を入れる（`checkin` を使うときに必要）

無料プランは月200通まで。高齢者1人につき毎朝の通知だけで月約30通になる。

## シークレット

```sh
supabase secrets set \
  LINE_CHANNEL_ACCESS_TOKEN=... \
  LIFF_ID=... \
  LIFF_CHANNEL_ID=... \
  CRON_SECRET=...
```

- `LINE_CHANNEL_ACCESS_TOKEN` … 公式アカウント（Messaging API チャネル）のトークン。チャットや GitHub には書かず、直接このコマンドで登録する
- `LIFF_ID` … 通知のボタンから開く LIFF の ID（`.env` の `VITE_LIFF_ID` と同じ）
- `LIFF_CHANNEL_ID` … LIFF が入っているミニアプリ（LINEログイン）チャネルのチャネルID（`checkin` 用。公式アカウントのチャネルIDではない）
- `CHECK_INTERVAL_HOURS` … 任意（省略時 1）。`overdue-alert` の cron を毎時以外の間隔にするときだけ、その間隔（時間）に揃えて登録する
- `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` は Supabase が自動で入れてくれる

## デプロイ

```sh
supabase functions deploy daily-checkin-reminder
supabase functions deploy overdue-alert
supabase functions deploy checkin
```

JWT 検証は `supabase/config.toml` の `verify_jwt = false` で切っている。理由: `checkin` は LINE の ID トークンで、cron の2つは `x-cron-secret` で認証しているため。

## テストモードとの関係

`?test=1` のテストモード（`Feature/test-mode`）は別の Supabase プロジェクトに接続し、`test-senior-001` のような仮のユーザーIDを使う。
LINE のユーザーIDの形（`U` + 32桁）でない ID は、送信前に自動で除く（`skipped` として数える）ので、混ざっていても他の人への送信は止まらない。

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
curl -X POST "https://xxxx.supabase.co/functions/v1/daily-checkin-reminder" -H "x-cron-secret: <CRON_SECRET>"
curl -X POST "https://xxxx.supabase.co/functions/v1/overdue-alert" -H "x-cron-secret: <CRON_SECRET>"
```

家族へ通知するまでの時間は、高齢者ごとの `users.send_notification_days`（登録フォームの「通知までの日数」）× 24時間。
テストのときは `supabase secrets set OVERDUE_HOURS=1` で全員を1時間にすると、すぐ通知まで確かめられる（終わったら `supabase secrets unset OVERDUE_HOURS`）。
