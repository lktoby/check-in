// LINE公式アカウント（Messaging API）でメッセージを送る共通処理
// どの Edge Function からでも次のように使える:
//   import { sendPushMessage } from "../_shared/line.ts";
//   await sendPushMessage(userId, "こんにちは");
//
// 必要な環境変数（supabase secrets set で登録）:
//   LINE_CHANNEL_ACCESS_TOKEN … Messaging API チャネル（公式アカウント）の長期チャネルアクセストークン
//
// 注意:
//   - 送れるのは、公式アカウントを友だち追加している人だけ
//   - 公式アカウントは、LIFF（ミニアプリ）と同じプロバイダーで作ること（違うとユーザーIDが一致しない）
//   - 無料プランは月200通まで（超えると 429 エラー）

const LINE_API = "https://api.line.me/v2/bot/message";

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  // 値が無いときは、仮の値で進めずにすぐエラーにする（原因が分かりやすい）
  if (!value) throw new Error(`${name} が設定されていません`);
  return value;
}

/**
 * LINE のユーザーID の形（U + 32桁の16進数）か。
 * テスト用のID（"test-senior-001" など）が1つでも混ざると multicast 全体が 400 になるので、送る前に除く
 */
export function isLineUserId(id: string): boolean {
  return /^U[0-9a-f]{32}$/.test(id);
}

async function callLine(path: string, body: unknown) {
  const res = await fetch(`${LINE_API}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${requireEnv("LINE_CHANNEL_ACCESS_TOKEN")}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // 例: 400 = ユーザーIDの間違い、401 = トークンの間違い、429 = 送りすぎ・月の上限
    throw new Error(`LINE API エラー (${res.status}): ${await res.text()}`);
  }
}

function toMessage(message: string | object) {
  return typeof message === "string" ? { type: "text", text: message } : message;
}

/** 1人に送る（テキストでも、ボタン付きメッセージでもOK） */
export async function sendPushMessage(to: string, message: string | object) {
  if (!isLineUserId(to)) throw new Error(`LINE のユーザーIDではありません: ${to}`);
  await callLine("push", { to, messages: [toMessage(message)] });
}

/** 複数人にまとめて送る（500人ずつに分けて送る）。LINE のユーザーIDでないものは除く */
export async function sendMulticast(to: string[], message: string | object): Promise<number> {
  const ids = to.filter(isLineUserId);
  for (let i = 0; i < ids.length; i += 500) {
    await callLine("multicast", { to: ids.slice(i, i + 500), messages: [toMessage(message)] });
  }
  return ids.length;
}
