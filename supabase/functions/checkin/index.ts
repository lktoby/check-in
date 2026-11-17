// チェックインを記録する Edge Function（LIFF から呼ぶ）
//
// ブラウザから直接 check_ins に insert すると、他人の line_user_id でもチェックインできてしまう。
// そこで LIFF の ID トークンを LINE のサーバーで検証し、本人の userId だけを記録する。
//
// リクエスト: POST { "idToken": liff.getIDToken() の値 }
// レスポンス: 200 { ok: true, checked_in_at }
//            400 idToken なし / 401 トークンが無効・期限切れ / 404 ユーザー未登録
//
// 必要な環境変数:
//   LINE_LOGIN_CHANNEL_ID … LIFF アプリを作った「LINEログイン」チャネルのチャネルID
// デプロイ: supabase functions deploy checkin --no-verify-jwt

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** ID トークンを LINE に検証してもらい、本人の userId と表示名を返す */
async function verifyIdToken(idToken: string): Promise<{ userId: string; name?: string } | null> {
  const clientId = Deno.env.get("LINE_LOGIN_CHANNEL_ID");
  if (!clientId) throw new Error("LINE_LOGIN_CHANNEL_ID が設定されていません");

  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: clientId }),
  });
  if (!res.ok) return null; // 改ざん・期限切れ・別チャネルのトークン
  const payload = await res.json();
  return { userId: payload.sub, name: payload.name };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { idToken } = await req.json().catch(() => ({}));
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
      .select("checked_in_at")
      .single();
    if (error) throw error;

    return json({ ok: true, checked_in_at: data.checked_in_at });
  } catch (e) {
    console.error("[checkin]", e);
    return json({ error: "internal_error" }, 500);
  }
});
