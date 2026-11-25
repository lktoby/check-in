import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import "dotenv/config";

// .envからSupabaseの接続情報を読み込む
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(".envにSupabaseの接続情報がありません");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// JSONファイルを読み込む
const events = JSON.parse(
  await readFile(
    new URL("../data/events-iizuka.json", import.meta.url),
    "utf-8"
  )
);

// Supabase用のデータ形式に変換
const rows = events.map((event) => ({
  municipality_code: event.municipalityCode,
  municipality_name: event.municipalityName,
  event_id: event.eventId,
  title: event.title,
  description: event.description || null,
  start_date: event.startDate || null,
  end_date: event.endDate || null,
  start_time: event.startTime || null,
  end_time: event.endTime || null,
  place: event.place || null,
  address: event.address || null,
  latitude: event.latitude ? Number(event.latitude) : null,
  longitude: event.longitude ? Number(event.longitude) : null,
  url: event.url || null,
  source_url: "https://data.bodik.jp/dataset/35307d73-d7f7-465e-9f9f-1fed968a0562"
}));

// 50件ずつ登録
for (let i = 0; i < rows.length; i += 50) {
  const batch = rows.slice(i, i + 50);

  const { error } = await supabase
    .from("local_events")
    .upsert(batch, {
      onConflict: "municipality_code,event_id"
    });

  if (error) {
    console.error("登録エラー:", error.message);
    process.exit(1);
  }
}

console.log(`登録成功！ ${rows.length}件のイベントを処理しました。`);
