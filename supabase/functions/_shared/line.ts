// LINEミニアプリの「サービスメッセージ」を送る共通処理（公式アカウント・Messaging API は使わない）
//
// 流れ:
//   1. ユーザーが操作したとき、LIFF アクセストークン（liff.getAccessToken()）から
//      サービス通知トークンを発行する（issueNotificationToken）
//   2. そのトークンで、あとからそのユーザー本人にだけサービスメッセージを送れる（sendServiceMessage）
//      送るたびに新しいトークンと残り回数（remainingCount）が返ってくるので、保存し直す
//
// 必要な環境変数（supabase secrets set で登録）:
//   LINE_CHANNEL_ID     … LINEミニアプリチャネルのチャネルID
//   LINE_CHANNEL_SECRET … 同じチャネルのチャネルシークレット
//
// 仕様: https://developers.line.biz/ja/docs/line-mini-app/develop/service-messages/

const LINE_API = "https://api.line.me";

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  // 値が無いときは、仮の値で進めずにすぐエラーにする（原因が分かりやすい）
  if (!value) throw new Error(`${name} が設定されていません`);
  return value;
}

// ステートレスチャネルアクセストークン（15分有効）。同じ実行中は使い回す
let cachedToken: { value: string; expiresAt: number } | null = null;

/** ミニアプリチャネルのチャネルアクセストークン（チャネルID + シークレットから発行） */
export async function getChannelAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const res = await fetch(`${LINE_API}/oauth2/v3/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: requireEnv("LINE_CHANNEL_ID"),
      client_secret: requireEnv("LINE_CHANNEL_SECRET"),
    }),
  });
  if (!res.ok) throw new Error(`チャネルアクセストークンの発行に失敗 (${res.status}): ${await res.text()}`);

  const { access_token, expires_in } = await res.json();
  cachedToken = { value: access_token, expiresAt: Date.now() + expires_in * 1000 };
  return access_token;
}

/** 通知トークン発行・サービスメッセージ送信のレスポンス */
export type NotifierToken = {
  notificationToken: string;
  expiresIn: number; // 秒。送信時に 0 なら「送れたがトークンは更新されなかった」= もう使えない
  remainingCount: number;
  sessionId: string;
};

/** LINE API のエラー（status で原因を見分ける） */
export class LineApiError extends Error {
  constructor(public status: number, body: string) {
    super(`LINE API エラー (${status}): ${body}`);
  }
}

async function callNotifier(path: string, body: unknown): Promise<NotifierToken> {
  const res = await fetch(`${LINE_API}/message/v3/notifier/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await getChannelAccessToken()}`,
    },
    body: JSON.stringify(body),
  });
  // 400 = 内容の間違い / 同じ LIFF トークンで連続発行 / 送り先がいない
  // 401 = トークン無効（LIFF を閉じると LIFF アクセストークンは無効になる）
  // 403 = 権限なし（未認証ミニアプリの公開用チャネル等）/ テンプレートが見つからない
  if (!res.ok) throw new LineApiError(res.status, await res.text());
  return await res.json();
}

/** ユーザーの操作時に、LIFF アクセストークンからサービス通知トークンを発行する */
export function issueNotificationToken(liffAccessToken: string): Promise<NotifierToken> {
  return callNotifier("token", { liffAccessToken });
}

/** サービス通知トークンの持ち主にサービスメッセージを送る */
export function sendServiceMessage(
  templateName: string,
  params: Record<string, string>,
  notificationToken: string,
): Promise<NotifierToken> {
  return callNotifier("send?target=service", { templateName, params, notificationToken });
}

/**
 * テンプレート変数を環境変数の JSON から作る。値の中の {{key}} を values で置き換える
 * 例: SERVICE_PARAMS_ALERT='{"title":"{{senior_name}}さんの元気確認がありません","button_uri_1":"/"}'
 * テンプレートごとに変数名が違うため、コードではなく設定で決められるようにしている
 */
export function buildParams(envName: string, values: Record<string, string>): Record<string, string> {
  const template = JSON.parse(Deno.env.get(envName) ?? "{}") as Record<string, string>;
  return Object.fromEntries(
    Object.entries(template).map(([k, v]) => [
      k,
      String(v).replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? ""),
    ]),
  );
}
