// 毎朝、チェックインが必要な高齢者に「元気ですか？」の LINE を送る Edge Function
// pg_cron から 1日1回呼び出す（supabase/functions/README.md を参照）
//
// 送る相手: users.roles に "senior" を含み、今日（日本時間）まだチェックインしていない人
//   ※ users.send_notification_days は「何日チェックインがなければ家族へ通知するか」の設定
//     （登録フォームの「通知までの日数」）。こちらでは使わず、overdue-alert で使う
//
// 必要な環境変数（supabase secrets set で登録）:
//   LINE_CHANNEL_ACCESS_TOKEN … Messaging API のアクセストークン
//   LIFF_ID                   … チェックイン画面の LIFF ID（ボタンから開く）
//   CRON_SECRET               … cron からの呼び出しか確認する合言葉

import { createClient } from "npm:@supabase/supabase-js@2";
import { sendMulticast } from "../_shared/line.ts";
import { getLastCheckins, jstDaysBetween } from "../_shared/checkin.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// 「元気です」ボタン付きのメッセージ。押すとチェックイン画面（LIFF）が開く
// TODO: AIクイズ（チェックイン機能担当）ができたら、ここを3択ボタンのメッセージに差し替える
function reminderMessage() {
  return {
    type: "template",
    altText: "おはようございます。今日の元気確認をお願いします",
    template: {
      type: "buttons",
      text: "おはようございます☀\n今日も元気ですか？\n下のボタンを押してください。",
      actions: [
        { type: "uri", label: "元気です", uri: `https://liff.line.me/${Deno.env.get("LIFF_ID")}` },
      ],
    },
  };
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // 1. 高齢者の一覧
    const { data: seniors, error } = await supabase
      .from("users")
      .select("line_user_id")
      .contains("roles", ["senior"]);
    if (error) throw error;

    // 2. それぞれの最終チェックイン
    const lastCheckins = await getLastCheckins(supabase);

    // 3. 送る相手を決める
    const targets = (seniors ?? [])
      .filter((s) => {
        const last = lastCheckins.get(s.line_user_id);
        return !last || jstDaysBetween(last) >= 1;
      })
      .map((s) => s.line_user_id);

    // 4. まとめて送る
    if (targets.length > 0) await sendMulticast(targets, reminderMessage());

    return Response.json({ sent: targets.length });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
});
