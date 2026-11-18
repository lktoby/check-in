// 一定時間チェックインがない高齢者を見つけて、見守る側（relationships の guardian）にサービスメッセージで知らせる Edge Function
// pg_cron から 1時間に1回呼び出す（supabase/functions/README.md を参照）
//
// 判定: 最終チェックイン（一度もなければ users.created_at）からの経過時間が
//       しきい値以上、しきい値 + CHECK_INTERVAL_HOURS 未満の人
//   しきい値 = 高齢者ごとの users.send_notification_days × 24時間（登録フォームの「通知までの日数」）
//   ※ 見守る側が招待した場合、高齢者の行は DB の初期値（1日）になる点に注意
//   → cron が CHECK_INTERVAL_HOURS ごとに動いていれば、1回の未チェックインにつき通知はちょうど1回になる
//   （通知済みを記録するテーブルを作らずに済ませるための方法。cron が止まると通知が漏れる点に注意）
//
// サービスメッセージは、見守る側が登録・見守り連携したときに発行した通知トークン（purpose = guardian）で送る。
// 1つの通知トークンで送れる回数には上限があるので、使い切った見守る側には送れない（no_token として数える）
//
// TODO: 電話・メール・自治体への段階的な連絡（スライド22）は緊急連絡先担当の処理につなぐ
//
// 必要な環境変数:
//   LINE_CHANNEL_ID, LINE_CHANNEL_SECRET, CRON_SECRET
//   SERVICE_TEMPLATE_ALERT … 使うテンプレート名（例: "xxxx_ja"）
//   SERVICE_PARAMS_ALERT   … テンプレート変数の JSON。{{senior_name}} {{span}} が置き換わる
//   CHECK_INTERVAL_HOURS   … cron の間隔（省略時 1）。cron の設定と必ず揃えること
//   OVERDUE_HOURS          … テスト用（任意）。設定すると全員のしきい値をこの時間にする

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildParams, requireEnv } from "../_shared/line.ts";
import { getLastCheckins, HOUR } from "../_shared/checkin.ts";
import { getUsableTokens, sendWithStoredToken, type StoredToken } from "../_shared/notificationTokens.ts";

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

/** 「2日」「3時間」のような表記 */
function spanText(hours: number) {
  const days = Math.floor(hours / 24);
  return days >= 1 && hours % 24 === 0 ? `${days}日` : `${hours}時間`;
}

type Senior = { line_user_id: string; name: string; send_notification_days: number | null };

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const templateName = requireEnv("SERVICE_TEMPLATE_ALERT");

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

    // 3. その人たちの見守る側を取得し、見守る側ごとにまとめる
    const { data: relations, error: relError } = await supabase
      .from("relationships")
      .select("senior_id, guardian_id")
      .in("senior_id", overdue.map((s) => s.line_user_id));
    if (relError) throw relError;

    const byId = new Map(overdue.map((s) => [s.line_user_id, s] as const));
    const seniorsByGuardian = new Map<string, Senior[]>();
    for (const r of relations ?? []) {
      const list = seniorsByGuardian.get(r.guardian_id) ?? [];
      list.push(byId.get(r.senior_id)!);
      seniorsByGuardian.set(r.guardian_id, list);
    }

    // 4. 見守る側に送る。同じ見守る側には、送るたびに返ってくる新しいトークンで順番に送る
    //    （見守る側どうしは並行。1人が失敗しても他の人には送る）
    const tokens = await getUsableTokens(supabase, [...seniorsByGuardian.keys()], "guardian");
    let sent = 0;
    let failed = 0;
    let noToken = 0;
    await Promise.all(
      [...seniorsByGuardian].map(async ([guardianId, list]) => {
        let token: StoredToken | null = tokens.get(guardianId) ?? null;
        for (const s of list) {
          if (!token) {
            noToken++;
            console.warn("[overdue-alert] 通知トークンなし（使い切り・未発行）:", guardianId);
            continue;
          }
          try {
            token = await sendWithStoredToken(
              supabase,
              token,
              templateName,
              buildParams("SERVICE_PARAMS_ALERT", {
                senior_name: s.name ?? "",
                span: spanText(thresholdHours(s.send_notification_days)),
              }),
            );
            sent++;
          } catch (e) {
            failed++;
            console.error("[overdue-alert] 送信失敗:", guardianId, e);
            token = null; // 無効なトークンで続けて送らない
          }
        }
      }),
    );

    // 見守る側が1人も登録されていない高齢者（別の手段で連絡が必要）
    const withGuardian = new Set((relations ?? []).map((r) => r.senior_id));
    const noGuardian = overdue.filter((s) => !withGuardian.has(s.line_user_id)).map((s) => s.line_user_id);
    if (noGuardian.length > 0) console.warn("[overdue-alert] 見守る側が未登録:", noGuardian);

    return Response.json({
      overdue: overdue.length,
      sent,
      failed,
      no_token: noToken,
      no_guardian: noGuardian.length,
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
});
