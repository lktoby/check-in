
const keyword = process.argv[2] || "イベント";

const url = new URL(
  "https://data.bodik.jp/api/3/action/package_search"
);

url.searchParams.set("q", keyword);
url.searchParams.set("rows", "10");

async function main() {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const json = await response.json();

  if (!json.success) {
    throw new Error("データセット検索に失敗しました");
  }

  const datasets = json.result.results;

  console.log(`検索語: ${keyword}`);
  console.log(`検索結果: ${datasets.length}件\n`);

  for (const dataset of datasets) {
    console.log("================================");
    console.log("データセット:", dataset.title);
    console.log("提供組織:", dataset.organization?.title ?? "不明");
    console.log("説明:", dataset.notes ?? "");
    console.log("URL:", dataset.url ?? "");

    console.log("リソース:");

    for (const resource of dataset.resources ?? []) {
      console.log({
        name: resource.name,
        format: resource.format,
        url: resource.url,
        resource_id: resource.id,
      });
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
