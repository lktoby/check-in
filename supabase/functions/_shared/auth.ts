// LIFF の ID トークンを LINE に検証してもらい、本人の userId を得る
// （ブラウザから送られてくる userId は偽装できるので、必ずサーバー側で確かめる）
import { requireEnv } from "./line.ts";

export async function verifyIdToken(idToken: string): Promise<{ userId: string; name?: string } | null> {
  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: requireEnv("LINE_CHANNEL_ID") }),
  });
  if (!res.ok) return null; // 改ざん・期限切れ・別チャネルのトークン
  const payload = await res.json();
  return { userId: payload.sub, name: payload.name };
}
