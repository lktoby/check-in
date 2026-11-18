// サービス通知トークンの保存・取り出し・送信（service_notification_tokens テーブル）
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { issueNotificationToken, LineApiError, type NotifierToken, sendServiceMessage } from "./line.ts";

export type Purpose = "checkin" | "guardian";

export type StoredToken = {
  line_user_id: string;
  purpose: Purpose;
  notification_token: string;
  remaining_count: number;
  expires_at: string;
};

async function save(supabase: SupabaseClient, userId: string, purpose: Purpose, t: NotifierToken) {
  const { error } = await supabase.from("service_notification_tokens").upsert({
    line_user_id: userId,
    purpose,
    notification_token: t.notificationToken,
    remaining_count: t.remainingCount,
    expires_at: new Date(Date.now() + t.expiresIn * 1000).toISOString(),
    session_id: t.sessionId,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function remove(supabase: SupabaseClient, userId: string, purpose: Purpose) {
  const { error } = await supabase
    .from("service_notification_tokens")
    .delete()
    .eq("line_user_id", userId)
    .eq("purpose", purpose);
  if (error) throw error;
}

/** ユーザーの操作時に通知トークンを発行して保存する（新しいトークンで上書き） */
export async function issueAndSave(
  supabase: SupabaseClient,
  userId: string,
  purpose: Purpose,
  liffAccessToken: string,
): Promise<NotifierToken> {
  const t = await issueNotificationToken(liffAccessToken);
  await save(supabase, userId, purpose, t);
  return t;
}

/** まだ使えるトークンを userId ごとに返す */
export async function getUsableTokens(
  supabase: SupabaseClient,
  userIds: string[],
  purpose: Purpose,
): Promise<Map<string, StoredToken>> {
  if (userIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("service_notification_tokens")
    .select("line_user_id, purpose, notification_token, remaining_count, expires_at")
    .eq("purpose", purpose)
    .in("line_user_id", userIds)
    .gt("remaining_count", 0)
    .gt("expires_at", new Date().toISOString());
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.line_user_id as string, row as StoredToken]));
}

/**
 * 保存済みトークンでサービスメッセージを送り、返ってきた新しいトークンを保存し直す。
 * 使えなくなったトークン（使い切り・無効）は消す。戻り値は更新後のトークン（使い切りなら null）
 */
export async function sendWithStoredToken(
  supabase: SupabaseClient,
  token: StoredToken,
  templateName: string,
  params: Record<string, string>,
): Promise<StoredToken | null> {
  try {
    const t = await sendServiceMessage(templateName, params, token.notification_token);
    if (t.expiresIn === 0 && t.remainingCount === 0) {
      // 送れたが、これ以上このトークンでは送れない
      await remove(supabase, token.line_user_id, token.purpose);
      return null;
    }
    await save(supabase, token.line_user_id, token.purpose, t);
    return {
      ...token,
      notification_token: t.notificationToken,
      remaining_count: t.remainingCount,
      expires_at: new Date(Date.now() + t.expiresIn * 1000).toISOString(),
    };
  } catch (e) {
    // トークンが無効（401）なら、次から使わないよう消しておく
    if (e instanceof LineApiError && e.status === 401) await remove(supabase, token.line_user_id, token.purpose);
    throw e;
  }
}
