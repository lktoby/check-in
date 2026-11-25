
import { parse } from "csv-parse/sync";
import { mkdir, writeFile } from "node:fs/promises";

const url = process.argv[2];

if (!url) {
  console.error("CSVのURLを指定してください");
  process.exit(1);
}

async function main() {
  console.log("CSV取得中...");

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`取得失敗: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  let csvText;

  try {
    csvText = new TextDecoder("utf-8", {
      fatal: true
    }).decode(bytes);
  } catch {
    csvText = new TextDecoder("shift-jis").decode(bytes);
  }

  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
    relax_column_count: true
  });

  const events = rows
    .filter(row =>
      row["イベント名"] &&
      row["地方公共団体名"]
    )
    .map(row => ({
      municipalityCode: row["全国地方公共団体コード"] || "",
      municipalityName: row["地方公共団体名"] || "",
      eventId: row["ID"] || "",
      title: row["イベント名"] || "",
      description: row["概要"] || row["説明"] || "",
      startDate: row["開始日"] || "",
      endDate: row["終了日"] || "",
      startTime: row["開始時間"] || "",
      endTime: row["終了時間"] || "",
      place: row["場所名称"] || "",
      address: row["所在地_連結表記"] || "",
      latitude: row["緯度"] || "",
      longitude: row["経度"] || "",
      url: row["URL"] || row["コンテンツURL"] || ""
    }));

  await mkdir("data", { recursive: true });

  await writeFile(
    "data/events-iizuka.json",
    JSON.stringify(events, null, 2),
    "utf-8"
  );

  console.log("変換成功！");
  console.log(`取得した行数: ${rows.length}`);
  console.log(`変換したイベント数: ${events.length}`);
  console.log("保存先: data/events-iizuka.json");
}

main().catch(error => {
  console.error("エラー:", error);
  process.exitCode = 1;
});
