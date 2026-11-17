// LINE でメッセージを送る共通関数（services/lineService.js の Edge Function 版）
// どの Edge Function からでも次のように使える:
//   import { sendPushMessage } from "../_shared/line.ts";
//   await sendPushMessage(userId, "こんにちは");
//
// 必要な環境変数: LINE_CHANNEL_ACCESS_TOKEN（supabase secrets set で登録）

const LINE_API = "https://api.line.me/v2/bot/message";

function getToken(): string {
  const token = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
  // トークンが無いときは、仮の値で進めずにすぐエラーにする（原因が分かりやすい）
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN が設定されていません");
  return token;
}

async function callLine(path: string, body: unknown) {
  const res = await fetch(`${LINE_API}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // 例: 400 = ユーザーIDの間違い、401 = トークンの間違い、429 = 送りすぎ・月の上限
    throw new Error(`LINE API エラー (${res.status}): ${await res.text()}`);
  }
}

/** 1人に送る（テキストでも、ボタン付きメッセージでもOK） */
export async function sendPushMessage(to: string, message: string | object) {
  const msg = typeof message === "string" ? { type: "text", text: message } : message;
  await callLine("push", { to, messages: [msg] });
}

/** 複数人にまとめて送る（500人ずつに分けて送る） */
export async function sendMulticast(to: string[], message: string | object) {
  const msg = typeof message === "string" ? { type: "text", text: message } : message;
  for (let i = 0; i < to.length; i += 500) {
    await callLine("multicast", { to: to.slice(i, i + 500), messages: [msg] });
  }
}
