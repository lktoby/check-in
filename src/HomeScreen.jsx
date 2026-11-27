import "./HomeScreen.css";

export function HomeScreen({
  profile,
  userName,
  message,
  error,
  isGeneratingGame,
  isCheckingIn,
  activeGame,
  onStartGame,
  onGenerateTestGame,
  onRetryCheckIn,
  game,
}) {
  return (
    <main className="home-screen">
      <div className="home-screen__card">
        <p className="home-screen__eyebrow">まいにちの安心</p>
        <h1 className="home-screen__title">ホーム画面</h1>
        <div className="home-screen__flourish" aria-hidden="true">〜 ✳ 〜</div>

        {message && <p className="home-screen__status" role="status">{message}</p>}
        {error && <p className="home-screen__error" role="alert">{error}</p>}

        <section className="home-screen__section">
          <h2>{userName} さん</h2>
          <p>今日も元気に過ごしていますか？</p>
          {profile?.displayName && profile.displayName !== userName && (
            <p className="home-screen__detail">LINE: {profile.displayName}</p>
          )}
        </section>

        {!activeGame && (
          <section className="home-screen__section">
            <h2>今日のチェックイン</h2>
            <p>ゲームをクリアするとチェックインが記録されます。</p>
            <button
              className="home-screen__button home-screen__button--primary"
              type="button"
              onClick={onStartGame}
              disabled={isGeneratingGame}
            >
              {isGeneratingGame ? "準備中..." : "今日も元気です！（チェックイン）"}
            </button>
            {import.meta.env.DEV && (
              <details className="home-screen__dev-tools">
                <summary>開発用メニュー</summary>
                <button
                  className="home-screen__button home-screen__button--secondary"
                  type="button"
                  onClick={onGenerateTestGame}
                  disabled={isGeneratingGame}
                >
                  テスト用に新しいAIゲームを生成
                </button>
              </details>
            )}
          </section>
        )}

        {activeGame && (
          <section className="home-screen__section" aria-label={activeGame.source === "ai" ? "AIゲーム" : "ローカルゲーム"}>
            {game}
            {error && (
              <button
                className="home-screen__button home-screen__button--primary"
                type="button"
                onClick={onRetryCheckIn}
                disabled={isCheckingIn}
              >
                {isCheckingIn ? "記録中..." : "チェックインを再試行"}
              </button>
            )}
          </section>
        )}

        <div className="home-screen__flower" aria-hidden="true">✿</div>
      </div>
    </main>
  );
}
