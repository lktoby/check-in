
const resourceUrl =
  "https://data.bodik.jp/dataset/afadd732-1610-451c-8306-d35bf4d858ad/resource/048f095c-40a7-46f5-ae3c-6e12d0c8a944/download/gomibunbetujiten.csv";

async function main() {
  const response = await fetch(resourceUrl);

  console.log("HTTP status:", response.status);
  console.log(
    "Content-Type:",
    response.headers.get("content-type")
  );

  if (!response.ok) {
    throw new Error("データの取得に失敗しました");
  }

  const text = await response.text();

  console.log("\n--- CSVの先頭3000文字 ---\n");
  console.log(text.slice(0, 3000));
}

main().catch(console.error);

