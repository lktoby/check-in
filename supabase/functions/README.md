# Edge Functions（API・通知まわり）

通知は **LINEミニアプリのサービスメッセージ** で送る（LINE公式アカウント・Messaging API は使わない）。

| 関数 | 呼び出し元 | 役割 |
|---|---|---|
| `checkin` | LIFF（`src/lineApi.js` の `checkIn()`） | ID トークンで本人確認してチェックインを記録し、翌朝用の通知トークンを保存 |
| `notify-subscribe` | LIFF（`subscribeNotifications()`） | 登録・見守り連携のときに通知トークンを発行して保存 |
| `daily-checkin-reminder` | pg_cron（毎朝8時） | 今日まだチェックインしていない高齢者に「元気ですか？」を送る |
| `overdue-alert` | pg_cron（毎時） | `send_notification_days` 日チェックインがない高齢者の見守る側に通知 |

共通処理は `_shared/` にある（`line.ts` = サービスメッセージ送信、`notificationTokens.ts` = 通知トークンの保存、`auth.ts` = ID トークン検証、`checkin.ts` = 日付計算・最終チェックイン、`cors.ts`）。

## サービスメッセージの仕組みと制約

サービスメッセージは「ユーザーが操作したとき」に LIFF アクセストークンから **通知トークン** を発行し、それを使って **その本人にだけ** 後から送れる。
送るたびに新しい通知トークンと残り回数が返るので、`service_notification_tokens` テーブルに上書き保存していく。

| 通知 | 通知トークンを発行する操作 | purpose |
|---|---|---|
| 高齢者への毎朝の通知 | チェックイン（`checkin`）・高齢者の登録完了（`notify-subscribe`） | `checkin` |
| 見守る側への未チェックイン通知 | 見守る側の登録完了・見守り連携の完了（`notify-subscribe`） | `guardian` |

- 1つの操作で送れる回数に上限がある（目安 5回）。高齢者はチェックインのたびに更新されるが、見守る側は使い切ると、もう一度アプリで操作するまで届かない
- **認証済ミニアプリでのみ利用可能**。未認証のうちは **開発用の内部チャネル** でだけ使え、受け取れるのはそのチャネルの **Admin / Tester** 権限を持つ人だけ
- 文面は自由に書けず、LINE が用意したテンプレートから選ぶ。本番公開には審査があり、使用事例と違う使い方は利用停止になることがある
- 仕様: https://developers.line.biz/ja/docs/line-mini-app/develop/service-messages/

## LINE 側の準備

1. LINE Developers コンソールで、LIFF が入っている **LINEミニアプリチャネル（開発用）** を開く
2. 「チャネル基本設定」のチャネルID・チャネルシークレットを控える
3. サービスメッセージのテンプレートを2つ追加する（毎朝の通知用・見守る側への通知用）。テンプレート名と変数名を控える
4. テストに使う LINE アカウント（高齢者役・見守る側役）を「権限設定」で Tester に追加する
5. LIFF アプリの Scope に `openid`（と `profile`）を入れる。入っていないと `liff.getIDToken()` が null になる

## シークレット

```sh
supabase secrets set \
  LINE_CHANNEL_ID=... \
  LINE_CHANNEL_SECRET=... \
  CRON_SECRET=... \
  CHECK_INTERVAL_HOURS=1 \
  SERVICE_TEMPLATE_REMINDER=<テンプレート名>_ja \
  SERVICE_TEMPLATE_ALERT=<テンプレート名>_ja \
  SERVICE_PARAMS_REMINDER='{"<変数名>":"{{name}}さん、今日の元気確認をお願いします"}' \
  SERVICE_PARAMS_ALERT='{"<変数名>":"{{senior_name}}さんの元気確認が{{span}}以上ありません"}'
```

- `SERVICE_PARAMS_*` はテンプレート変数の JSON。テンプレートごとに変数名が違うので、コンソールで確認した名前を入れる（必須の変数が無いとエラーになる）
- 置き換わる値: 毎朝の通知 = `{{name}}`、見守る側への通知 = `{{senior_name}}` `{{span}}`（例: 2日）
- `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` は Supabase が自動で入れてくれる

## DB

`supabase/migrations/20261118090000_add_service_notification_tokens.sql` で `service_notification_tokens` テーブルを作る。
RLS を有効にしてポリシーは作っていないので、ブラウザからは読めず、Edge Function（service_role）からだけ使える。

## デプロイ

```sh
supabase functions deploy checkin
supabase functions deploy notify-subscribe
supabase functions deploy daily-checkin-reminder
supabase functions deploy overdue-alert
```

JWT 検証は `supabase/config.toml` の `verify_jwt = false` で切っている。理由: LIFF から呼ぶ2つは LINE の ID トークンで、cron の2つは `x-cron-secret` で認証しているため。

## 画面から呼ぶところ（`src/lineApi.js`）

```js
import { checkIn, subscribeNotifications } from "./lineApi";

await checkIn();                           // チェックインボタン（App.jsx）
await subscribeNotifications("checkin");   // 高齢者の登録完了時（RegistrationForm）
await subscribeNotifications("guardian");  // 見守る側の登録完了時（RegistrationForm）・見守り連携の完了時（GuardianLink）
```

`subscribeNotifications` は users に登録した **後** に呼ぶ（未登録だと 404）。同じ LIFF アクセストークンで短時間に続けて発行すると LINE 側で 400 になるので、1回の操作で1回だけ呼ぶ。

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

レスポンスの `no_token` は「通知トークンが無い（未発行・使い切り）ので送れなかった人数」。

家族へ通知するまでの時間は、高齢者ごとの `users.send_notification_days`（登録フォームの「通知までの日数」）× 24時間。
テストのときは `supabase secrets set OVERDUE_HOURS=1` で全員を1時間にすると、すぐ通知まで確かめられる（終わったら `supabase secrets unset OVERDUE_HOURS`）。
