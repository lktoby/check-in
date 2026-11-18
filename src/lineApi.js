// Edge Function（supabase/functions/）を LIFF から呼ぶための関数
//
// ブラウザから送る userId は偽装できるので、LIFF の ID トークンを送ってサーバー側で本人確認する。
// LIFF アクセストークンは、サービスメッセージ（LINEミニアプリの通知）の通知トークン発行に使う。
// ※ LIFF の Scope に openid が必要（無いと liff.getIDToken() が null になる）
import liff from "@line/liff";
import { supabase } from "./supabaseClient";

function liffTokens() {
  const idToken = liff.getIDToken();
  if (!idToken) {
    throw new Error("IDトークンを取得できません。LIFF の Scope に openid が入っているか確認してください。");
  }
  return { idToken, accessToken: liff.getAccessToken() };
}

async function invoke(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // エラー時のレスポンス本文（{ error: "not_registered" } など）を取り出す
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? error.message);
  }
  return data;
}

/**
 * チェックインを記録する（翌朝の「元気ですか？」用の通知トークンも保存される）
 * @returns {Promise<{ ok: true, checked_in_at: string, notification: "saved" | "failed" | "skipped" }>}
 */
export function checkIn() {
  return invoke("checkin", liffTokens());
}

/**
 * 通知を受け取れるようにする。登録完了・見守り連携の完了のときに呼ぶ
 * @param {"checkin" | "guardian"} purpose
 *   "checkin"  … 高齢者が登録したとき（毎朝の「元気ですか？」）
 *   "guardian" … 見守る側が登録・連携したとき（未チェックインの通知）
 */
export function subscribeNotifications(purpose) {
  return invoke("notify-subscribe", { ...liffTokens(), purpose });
}
