// チェックインを記録する Edge Function（LIFF から呼ぶ）
//
// ブラウザから直接 check_ins に insert すると、他人の line_user_id でもチェックインできてしまう。
// そこで LIFF の ID トークンを LINE のサーバーで検証し、本人の userId だけを記録する。
// あわせて、翌朝の「元気ですか？」を送るためのサービス通知トークンを発行して保存する。
//
// リクエスト: POST { "idToken": liff.getIDToken(), "accessToken": liff.getAccessToken() }
// レスポンス: 200 { ok: true, checked_in_at, notification: "saved" | "failed" | "skipped" }
//            400 idToken なし / 401 トークンが無効・期限切れ / 404 ユーザー未登録
//
// 必要な環境変数: LINE_CHANNEL_ID, LINE_CHANNEL_SECRET

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { verifyIdToken } from "../_shared/auth.ts";
import { issueAndSave } from "../_shared/notificationTokens.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { idToken, accessToken } = await req.json().catch(() => ({}));
    if (!idToken) return json({ error: "id_token_required" }, 400);

    const user = await verifyIdToken(idToken);
    if (!user) return json({ error: "invalid_id_token" }, 401);

    // 登録フォームで登録済みの人だけ（check_ins は users を参照しているため）
    const { data: registered, error: userError } = await supabase
      .from("users")
      .select("line_user_id")
      .eq("line_user_id", user.userId)
      .maybeSingle();
    if (userError) throw userError;
    if (!registered) return json({ error: "not_registered" }, 404);

    const { data, error } = await supabase
      .from("check_ins")
      .insert({ line_user_id: user.userId, display_name: user.name ?? null })
      .select("created_at")
      .single();
    if (error) throw error;

    // 翌朝のリマインダー用の通知トークン。失敗してもチェックイン自体は成功として返す
    let notification: "saved" | "failed" | "skipped" = "skipped";
    if (accessToken) {
      try {
        await issueAndSave(supabase, user.userId, "checkin", accessToken);
        notification = "saved";
      } catch (e) {
        console.error("[checkin] 通知トークンの発行に失敗:", e);
        notification = "failed";
      }
    }

    return json({ ok: true, checked_in_at: data.created_at, notification });
  } catch (e) {
    console.error("[checkin]", e);
    return json({ error: "internal_error" }, 500);
  }
});
