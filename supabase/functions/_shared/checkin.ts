// チェックイン関係の共通処理（日付計算・最終チェックインの集計）
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
const JST_OFFSET = 9 * HOUR;

/** 日本時間での日付（"2026-11-17" の形） */
export function jstDate(t: Date | string | number): string {
  return new Date(new Date(t).getTime() + JST_OFFSET).toISOString().slice(0, 10);
}

/** 日本時間の日付で数えて、from から to まで何日たったか（同じ日なら 0） */
export function jstDaysBetween(from: Date | string, to: Date | string = new Date()): number {
  return Math.round((Date.parse(jstDate(to)) - Date.parse(jstDate(from))) / DAY);
}

/** 最終チェックインから thresholdHours 以上たっているか（記録なしなら true） */
export function isOverdue(lastCheckinAt: string | null, thresholdHours = 24): boolean {
  if (!lastCheckinAt) return true;
  return Date.now() - new Date(lastCheckinAt).getTime() >= thresholdHours * HOUR;
}

/**
 * 直近 lookbackDays 日のチェックインから、ユーザーごとの最終チェックイン日時を返す
 * （それより前にしかチェックインしていない人は Map に入らない）
 */
export async function getLastCheckins(
  supabase: SupabaseClient,
  lookbackDays = 60,
): Promise<Map<string, string>> {
  const since = new Date(Date.now() - lookbackDays * DAY).toISOString();
  const { data, error } = await supabase
    .from("check_ins")
    .select("line_user_id, checked_in_at")
    .gte("checked_in_at", since);
  if (error) throw error;

  const last = new Map<string, string>();
  for (const row of data ?? []) {
    const prev = last.get(row.line_user_id);
    if (!prev || Date.parse(row.checked_in_at) > Date.parse(prev)) last.set(row.line_user_id, row.checked_in_at);
  }
  return last;
}
