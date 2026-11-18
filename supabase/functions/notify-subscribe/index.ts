// 通知を受け取れるようにする Edge Function（LIFF から呼ぶ）
//
// サービスメッセージは「ユーザーが操作したときに発行した通知トークン」でしか送れない。
// そこで、次の操作のときにこの関数を呼んで、通知トークンを発行・保存しておく。
//   - 高齢者が登録したとき            → purpose: "checkin"（まだ一度もチェックインしていない人にも毎朝送るため）
//   - 見守る側が登録・見守り連携したとき → purpose: "guardian"（未チェックイン通知を受け取るため）
//   （高齢者のチェックイン時は checkin 関数の中で発行するので、ここを呼ぶ必要はない）
//
// リクエスト: POST { idToken, accessToken, purpose: "checkin" | "guardian" }
// レスポンス: 200 { ok: true, remaining_count }
//            400 入力不足 / 401 ID トークン無効 / 403 その役割で登録されていない / 404 未登録
//            502 LINE 側で通知トークンを発行できなかった
//
// 必要な環境変数: LINE_CHANNEL_ID, LINE_CHANNEL_SECRET

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { verifyIdToken } from "../_shared/auth.ts";
import { LineApiError } from "../_shared/line.ts";
import { issueAndSave, type Purpose } from "../_shared/notificationTokens.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// 通知の種類ごとに、users.roles に必要な役割
const REQUIRED_ROLE: Record<Purpose, string> = { checkin: "senior", guardian: "guardian" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { idToken, accessToken, purpose } = await req.json().catch(() => ({}));
    if (!idToken || !accessToken || !(purpose in REQUIRED_ROLE)) {
      return json({ error: "id_token_access_token_and_purpose_required" }, 400);
    }

    const user = await verifyIdToken(idToken);
    if (!user) return json({ error: "invalid_id_token" }, 401);

    const { data: registered, error: userError } = await supabase
      .from("users")
      .select("roles")
      .eq("line_user_id", user.userId)
      .maybeSingle();
    if (userError) throw userError;
    if (!registered) return json({ error: "not_registered" }, 404);
    if (!(registered.roles ?? []).includes(REQUIRED_ROLE[purpose as Purpose])) {
      return json({ error: "role_mismatch" }, 403);
    }

    try {
      const t = await issueAndSave(supabase, user.userId, purpose, accessToken);
      return json({ ok: true, remaining_count: t.remainingCount });
    } catch (e) {
      if (e instanceof LineApiError) {
        console.error("[notify-subscribe]", e.message);
        return json({ error: "notification_token_failed", line_status: e.status }, 502);
      }
      throw e;
    }
  } catch (e) {
    console.error("[notify-subscribe]", e);
    return json({ error: "internal_error" }, 500);
  }
});
