// チェックインを記録する Edge Function（LIFF から呼ぶ）
//
// ブラウザから直接 check_ins に insert すると、他人の line_user_id でもチェックインできてしまう。
// そこで LIFF の ID トークンを LINE のサーバーで検証し、本人の userId だけを記録する。
// ※ 今の画面（HomeScreen）は check_ins に直接 insert している。RLS を締めるときにこちらへ切り替える
//
// リクエスト: POST { "idToken": liff.getIDToken() の値 }
// レスポンス: 200 { ok: true, checked_in_at }
//            400 idToken なし / 401 トークンが無効・期限切れ / 404 ユーザー未登録
//
// 必要な環境変数: LIFF_CHANNEL_ID

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { verifyIdToken } from "../_shared/auth.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

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
      .select("created_at")
      .single();
    if (error) throw error;

    return json({ ok: true, checked_in_at: data.created_at });
  } catch (e) {
    console.error("[checkin]", e);
    return json({ error: "internal_error" }, 500);
  }
});
