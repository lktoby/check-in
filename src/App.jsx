import { useEffect, useRef, useState } from "react";
import liff from "@line/liff";
import { supabase } from "./supabaseClient";
import { ColorMatchGame } from "./games/color";
import { DailyPromptGame } from "./games/daily";
import { PickGame } from "./games/pick";
import { SequenceTapGame } from "./games/sequence";
import { WordMatchGame } from "./games/wordmatch";
import { chooseLocalGameType, requestDailyGame } from "./services/gameGenerator";
import "./App.css";
import "bootstrap/dist/css/bootstrap.css";

function App() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isGeneratingGame, setIsGeneratingGame] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [activeGame, setActiveGame] = useState(null);
  const [isCompletionPage, setIsCompletionPage] = useState(
    () => window.location.pathname === "/complete"
  );
  const checkInLock = useRef(false);

  useEffect(() => {
    function updateRoute() {
      setIsCompletionPage(window.location.pathname === "/complete");
    }
    window.addEventListener("popstate", updateRoute);
    return () => window.removeEventListener("popstate", updateRoute);
  }, []);

  useEffect(() => {
    if (isCompletionPage) return undefined;

    let cancelled = false;

    async function initialize() {
      try {
        await liff.init({ liffId: import.meta.env.VITE_LIFF_ID });

        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const lineProfile = await liff.getProfile();
        if (cancelled) return;
        setProfile(lineProfile);

        const { data: registeredUser, error: lookupError } = await supabase
          .from("users")
          .select("line_user_id, name")
          .eq("line_user_id", lineProfile.userId)
          .maybeSingle();

        if (lookupError) throw lookupError;
        if (cancelled) return;

        setIsRegistered(Boolean(registeredUser));
        setMessage(
          registeredUser
            ? `登録済みです: ${registeredUser.name}`
            : "LINE profile loaded. Confirm the details and register."
        );
      } catch (e) {
        if (cancelled) return;
        setMessage("Initialization failed.");
        console.error("Failed to initialize LIFF or load registration:", e);
        setError(e?.message || String(e));
      }
    }

    initialize();
    return () => {
      cancelled = true;
    };
  }, [isCompletionPage]);

  async function registerUser(event) {
    event.preventDefault();
    if (!profile || isRegistering) return;

    setError("");
    setIsRegistering(true);
    setMessage("Registering user...");

    try {
      const { data: savedUser, error: userError } = await supabase
        .from("users")
        .upsert(
          {
            line_user_id: profile.userId,
            name: profile.displayName,
          },
          { onConflict: "line_user_id" }
        )
        .select("line_user_id, name, created_at")
        .single();

      if (userError) throw userError;
      if (savedUser?.line_user_id !== profile.userId) {
        throw new Error("Supabase did not return the saved user row.");
      }

      setIsRegistered(true);
      setMessage(`Supabase に仮登録しました: ${savedUser.name}`);
    } catch (e) {
      console.error("Failed to register the LINE profile in Supabase:", e);
      const detail = [e?.message, e?.code && `code: ${e.code}`, e?.details, e?.hint]
        .filter(Boolean)
        .join(" — ");
      setMessage("仮登録に失敗しました。");
      setError(detail || String(e));
    } finally {
      setIsRegistering(false);
    }
  }

  async function startGame({ fresh = false } = {}) {
    if (!profile || !isRegistered || isGeneratingGame) return;

    setError("");
    setMessage(fresh ? "テスト用のゲームを生成しています..." : "今日のゲームを準備しています...");
    setIsGeneratingGame(true);

    try {
      const game = await requestDailyGame({ idToken: liff.getIDToken(), fresh });
      setActiveGame({
        gameType: game.gameType,
        gameData: game,
        source: "ai",
        checkInId: crypto.randomUUID(),
      });
      setMessage(fresh ? "テスト用のAIゲームです。" : "今日のゲームです。");
    } catch (e) {
      console.error("Failed to generate a game; starting a local game:", e);
      setActiveGame({
        gameType: chooseLocalGameType(),
        gameData: null,
        source: "local",
        checkInId: crypto.randomUUID(),
      });
      setMessage("AIに接続できなかったため、ローカルゲームを始めます。");
    } finally {
      setIsGeneratingGame(false);
    }
  }

  async function saveCheckIn() {
    if (!profile || !isRegistered || !activeGame || checkInLock.current) return;

    checkInLock.current = true;
    setIsCheckingIn(true);
    setError("");
    setMessage("チェックインを記録しています...");

    try {
      const { error: checkInError } = await supabase.from("check_ins").insert({
        id: activeGame.checkInId,
        line_user_id: profile.userId,
        display_name: profile.displayName,
      });

      if (checkInError && checkInError.code !== "23505") throw checkInError;

      window.history.pushState({}, "", "/complete");
      setIsCompletionPage(true);
    } catch (e) {
      console.error("Failed to save the game completion check-in:", e);
      setMessage("チェックインを記録できませんでした。もう一度お試しください。");
      setError(e?.message || String(e));
    } finally {
      checkInLock.current = false;
      setIsCheckingIn(false);
    }
  }

  function renderActiveGame() {
    if (!activeGame) return null;
    const props = { gameData: activeGame.gameData, onComplete: saveCheckIn };

    switch (activeGame.gameType) {
      case "color":
        return <ColorMatchGame {...props} />;
      case "daily":
        return <DailyPromptGame {...props} />;
      case "pick":
        return <PickGame {...props} />;
      case "sequence":
        return <SequenceTapGame {...props} />;
      case "wordmatch":
        return <WordMatchGame {...props} />;
      default:
        return null;
    }
  }

  if (isCompletionPage) return null;

  return (
    <div className="App">
      <h1>LINE 仮登録</h1>

      {message && <p role="status">{message}</p>}
      {error && <p role="alert"><code>{error}</code></p>}

      {profile && !isRegistered && (
        <form className="registration-form" onSubmit={registerUser}>
          <div className="registration-field">
            <label htmlFor="line-user-id">LINE user ID</label>
            <input id="line-user-id" type="text" value={profile.userId} readOnly />
          </div>

          <div className="registration-field">
            <label htmlFor="line-display-name">LINE ニックネーム</label>
            <input
              id="line-display-name"
              type="text"
              value={profile.displayName}
              readOnly
            />
          </div>

          <button type="submit" disabled={isRegistering}>
            {isRegistering ? "登録中..." : "仮登録する"}
          </button>
        </form>
      )}

      {profile && isRegistered && !activeGame && (
        <section className="game-launcher" aria-labelledby="daily-game-title">
          <h2 id="daily-game-title">今日のゲーム</h2>
          <p>ゲームをクリアするとチェックインが記録されます。</p>
          <button
            className="primary-button"
            type="button"
            onClick={() => startGame()}
            disabled={isGeneratingGame}
          >
            {isGeneratingGame ? "準備中..." : "今日も元気です！（チェックイン）"}
          </button>
          {import.meta.env.DEV && (
            <button
              className="btn btn-outline-secondary dev-game-button"
              type="button"
              onClick={() => startGame({ fresh: true })}
              disabled={isGeneratingGame}
            >
              テスト用に新しいAIゲームを生成
            </button>
          )}
        </section>
      )}

      {activeGame && (
        <section aria-label={activeGame.source === "ai" ? "AIゲーム" : "ローカルゲーム"}>
          {renderActiveGame()}
          {error && (
            <button
              className="primary-button"
              type="button"
              onClick={saveCheckIn}
              disabled={isCheckingIn}
            >
              {isCheckingIn
                ? "記録中..."
                : "チェックインを再試行"}
            </button>
          )}
        </section>
      )}
    </div>
  );
}

export default App;
