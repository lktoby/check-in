export function Completion({ isTest = false }) {
  return <h1>{isTest ? "テスト完了" : "チェックイン完了"}</h1>;
}
