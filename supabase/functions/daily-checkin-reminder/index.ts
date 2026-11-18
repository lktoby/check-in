// 毎朝、チェックインが必要な高齢者に「元気ですか？」のサービスメッセージを送る Edge Function
// pg_cron から 1日1回呼び出す（supabase/functions/README.md を参照）
//
// 送る相手: users.roles に "senior" を含み、今日（日本時間）まだチェックインしていない人
//   ※ users.send_notification_days は「何日チェックインがなければ家族へ通知するか」の設定
//     （登録フォームの「通知までの日数」）。こちらでは使わず、overdue-alert で使う
//
// サービスメッセージは、本人の操作（前回のチェックイン・登録）のときに発行した通知トークンで送る。
// 通知トークンが無い・使い切った人には送れない（no_token として数える）
//
// 必要な環境変数（supabase secrets set で登録）:
//   LINE_CHANNEL_ID, LINE_CHANNEL_SECRET … ミニアプリチャネルの ID とシークレット
//   SERVICE_TEMPLATE_REMINDER           … 使うテンプレート名（例: "xxxx_ja"）
//   SERVICE_PARAMS_REMINDER             … テンプレート変数の JSON。{{name}} が本人の名前に置き換わる
//   CRON_SECRET                         … cron からの呼び出しか確認する合言葉

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildParams, requireEnv } from "../_shared/line.ts";
import { getLastCheckins, jstDaysBetween } from "../_shared/checkin.ts";
import { getUsableTokens, sendWithStoredToken } from "../_shared/notificationTokens.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// TODO: AIクイズ（チェックイン機能担当）ができたら、テンプレートのボタンの行き先をクイズ画面にする

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const templateName = requireEnv("SERVICE_TEMPLATE_REMINDER");

    // 1. 高齢者の一覧
    const { data: seniors, error } = await supabase
      .from("users")
      .select("line_user_id, name")
      .contains("roles", ["senior"]);
    if (error) throw error;

    // 2. 今日まだチェックインしていない人
    const lastCheckins = await getLastCheckins(supabase);
    const targets = (seniors ?? []).filter((s) => {
      const last = lastCheckins.get(s.line_user_id);
      return !last || jstDaysBetween(last) >= 1;
    });

    // 3. 通知トークンがある人に1人ずつ送る（1人が失敗しても他の人には送る）
    const tokens = await getUsableTokens(supabase, targets.map((s) => s.line_user_id), "checkin");
    const sendable = targets.filter((s) => tokens.has(s.line_user_id));
    const results = await Promise.allSettled(
      sendable.map((s) =>
        sendWithStoredToken(
          supabase,
          tokens.get(s.line_user_id)!,
          templateName,
          buildParams("SERVICE_PARAMS_REMINDER", { name: s.name ?? "" }),
        )
      ),
    );
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    failed.forEach((f) => console.error("[daily-checkin-reminder] 送信失敗:", f.reason));

    const noToken = targets.filter((s) => !tokens.has(s.line_user_id)).map((s) => s.line_user_id);
    if (noToken.length > 0) console.warn("[daily-checkin-reminder] 通知トークンなし:", noToken);

    return Response.json({
      targets: targets.length,
      sent: results.length - failed.length,
      failed: failed.length,
      no_token: noToken.length,
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
});
