// 一定時間チェックインがない高齢者を見つけて、見守る側（relationships の guardian）に LINE公式アカウントから知らせる Edge Function
// pg_cron から 1時間に1回呼び出す（supabase/functions/README.md を参照）
//
// 判定: 最終チェックイン（一度もなければ users.created_at）からの経過時間が
//       しきい値以上、しきい値 + CHECK_INTERVAL_HOURS 未満の人
//   しきい値 = 高齢者ごとの users.send_notification_days × 24時間（登録フォームの「通知までの日数」）
//   ※ 見守る側が招待した場合、高齢者の行は DB の初期値（1日）になる点に注意
//   → cron が CHECK_INTERVAL_HOURS ごとに動いていれば、1回の未チェックインにつき通知はちょうど1回になる
//   （通知済みを記録するテーブルを作らずに済ませるための方法。cron が止まると通知が漏れる点に注意）
//
// TODO: 電話・メール・自治体への段階的な連絡（スライド22）は緊急連絡先担当の処理につなぐ
//
// 必要な環境変数:
//   LINE_CHANNEL_ACCESS_TOKEN, CRON_SECRET
//   CHECK_INTERVAL_HOURS … cron の間隔（省略時 1）。cron の設定と必ず揃えること
//   OVERDUE_HOURS        … テスト用（任意）。設定すると全員のしきい値をこの時間にする

import { createClient } from "npm:@supabase/supabase-js@2";
import { isLineUserId, sendPushMessage } from "../_shared/line.ts";
import { getLastCheckins, HOUR } from "../_shared/checkin.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const OVERDUE_HOURS_OVERRIDE = Deno.env.get("OVERDUE_HOURS") ? Number(Deno.env.get("OVERDUE_HOURS")) : null;
const CHECK_INTERVAL_HOURS = Number(Deno.env.get("CHECK_INTERVAL_HOURS") ?? 1);

/** その高齢者について、何時間チェックインがなければ通知するか */
function thresholdHours(sendNotificationDays: number | null): number {
  return OVERDUE_HOURS_OVERRIDE ?? Math.max(1, sendNotificationDays ?? 1) * 24;
}

function alertMessage(seniorName: string, hours: number) {
  const days = Math.floor(hours / 24);
  const span = days >= 1 && hours % 24 === 0 ? `${days}日` : `${hours}時間`;
  return `【見守りアプリ】\n${seniorName}さんの元気確認が${span}以上ありません。\nお手数ですが、電話などで様子を確認してください。`;
}

type Senior = { line_user_id: string; name: string; send_notification_days: number | null };

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // 1. 高齢者の一覧
    const { data: seniors, error } = await supabase
      .from("users")
      .select("line_user_id, name, created_at, send_notification_days")
      .contains("roles", ["senior"]);
    if (error) throw error;

    // 2. ちょうど今、未チェックインの時間を超えた人を探す
    const lastCheckins = await getLastCheckins(supabase);
    const now = Date.now();
    const overdue = (seniors ?? []).filter((s) => {
      const base = lastCheckins.get(s.line_user_id) ?? s.created_at;
      const elapsedHours = (now - new Date(base).getTime()) / HOUR;
      const limit = thresholdHours(s.send_notification_days);
      return elapsedHours >= limit && elapsedHours < limit + CHECK_INTERVAL_HOURS;
    }) as Senior[];
    if (overdue.length === 0) return Response.json({ overdue: 0, sent: 0 });

    // 3. その人たちの見守る側を取得（テスト用IDなど、LINE のユーザーIDでない見守る側は除く）
    const { data: relations, error: relError } = await supabase
      .from("relationships")
      .select("senior_id, guardian_id")
      .in("senior_id", overdue.map((s) => s.line_user_id));
    if (relError) throw relError;
    const sendable = (relations ?? []).filter((r) => isLineUserId(r.guardian_id));

    // 4. 見守る側に1人ずつ送る（1人が失敗しても他の人には送る）
    const byId = new Map(overdue.map((s) => [s.line_user_id, s] as const));
    const results = await Promise.allSettled(
      sendable.map((r) => {
        const s = byId.get(r.senior_id)!;
        return sendPushMessage(r.guardian_id, alertMessage(s.name, thresholdHours(s.send_notification_days)));
      }),
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
      skipped: (relations ?? []).length - sendable.length,
      no_guardian: noGuardian.length,
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
});
