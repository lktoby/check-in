// 一定時間チェックインがない高齢者を見つけて、見守る側（relationships の guardian）に LINE で知らせる Edge Function
// pg_cron から 1時間に1回呼び出す（supabase/functions/README.md を参照）
//
// 判定: 最終チェックイン（一度もなければ users.created_at）からの経過時間が
//       OVERDUE_HOURS 以上、OVERDUE_HOURS + CHECK_INTERVAL_HOURS 未満の人
//   → cron が CHECK_INTERVAL_HOURS ごとに動いていれば、1回の未チェックインにつき通知はちょうど1回になる
//   （通知済みを記録するテーブルを作らずに済ませるための方法。cron が止まると通知が漏れる点に注意）
//
// TODO: 電話・メール・自治体への段階的な連絡（スライド22）は緊急連絡先担当の処理につなぐ
//
// 必要な環境変数:
//   LINE_CHANNEL_ACCESS_TOKEN, CRON_SECRET
//   OVERDUE_HOURS        … 何時間チェックインがなければ通知するか（省略時 48 = 2日）
//   CHECK_INTERVAL_HOURS … cron の間隔（省略時 1）。cron の設定と必ず揃えること

import { createClient } from "npm:@supabase/supabase-js@2";
import { sendPushMessage } from "../_shared/line.ts";
import { getLastCheckins, HOUR } from "../_shared/checkin.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const OVERDUE_HOURS = Number(Deno.env.get("OVERDUE_HOURS") ?? 48);
const CHECK_INTERVAL_HOURS = Number(Deno.env.get("CHECK_INTERVAL_HOURS") ?? 1);

function alertMessage(seniorName: string) {
  const days = Math.floor(OVERDUE_HOURS / 24);
  const span = days >= 1 && OVERDUE_HOURS % 24 === 0 ? `${days}日` : `${OVERDUE_HOURS}時間`;
  return `【見守りアプリ】\n${seniorName}さんの元気確認が${span}以上ありません。\nお手数ですが、電話などで様子を確認してください。`;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // 1. 高齢者の一覧
    const { data: seniors, error } = await supabase
      .from("users")
      .select("line_user_id, name, created_at")
      .contains("roles", ["senior"]);
    if (error) throw error;

    // 2. ちょうど今、未チェックインの時間を超えた人を探す
    const lastCheckins = await getLastCheckins(supabase);
    const now = Date.now();
    const overdue = (seniors ?? []).filter((s) => {
      const base = lastCheckins.get(s.line_user_id) ?? s.created_at;
      const elapsedHours = (now - new Date(base).getTime()) / HOUR;
      return elapsedHours >= OVERDUE_HOURS && elapsedHours < OVERDUE_HOURS + CHECK_INTERVAL_HOURS;
    });
    if (overdue.length === 0) return Response.json({ overdue: 0, sent: 0 });

    // 3. その人たちの見守る側を取得
    const { data: relations, error: relError } = await supabase
      .from("relationships")
      .select("senior_id, guardian_id")
      .in("senior_id", overdue.map((s) => s.line_user_id));
    if (relError) throw relError;

    // 4. 見守る側に1人ずつ送る（1人が失敗しても他の人には送る）
    const names = new Map(overdue.map((s) => [s.line_user_id, s.name]));
    const results = await Promise.allSettled(
      (relations ?? []).map((r) => sendPushMessage(r.guardian_id, alertMessage(names.get(r.senior_id)!))),
    );
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    failed.forEach((f) => console.error("[overdue-alert] 送信失敗:", f.reason));

    // 見守る側が1人も登録されていない高齢者（別の手段で連絡が必要）
    const withGuardian = new Set((relations ?? []).map((r) => r.senior_id));
    const noGuardian = overdue.filter((s) => !withGuardian.has(s.line_user_id)).map((s) => s.line_user_id);
    if (noGuardian.length > 0) console.warn("[overdue-alert] 見守る側が未登録:", noGuardian);

    return Response.json({
      overdue: overdue.length,
      sent: results.length - failed.length,
      failed: failed.length,
      no_guardian: noGuardian.length,
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
});
