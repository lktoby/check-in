
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

  // UTF-8とShift-JISの文字コードに対応
  const bytes = new Uint8Array(buffer);
  let text;

  try {
    text = new TextDecoder("utf-8", {
      fatal: true
    }).decode(bytes);
  } catch {
    text = new TextDecoder("shift-jis").decode(bytes);
  }

  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/);

  console.log("\n取得成功！");
  console.log(`行数: ${lines.length}`);
  console.log("\n--- CSVの先頭20行 ---\n");

  console.log(lines.slice(0, 20).join("\n"));
}

main().catch((error) => {
  console.error("エラー:", error);
  process.exitCode = 1;
});
