import { useEffect, useRef, useState } from "react";
import liff from "@line/liff";
import { supabase } from "./supabaseClient";
import { ColorMatchGame } from "./games/color";
import { DailyPromptGame } from "./games/daily";
import { PickGame } from "./games/pick";
import { SequenceTapGame } from "./games/sequence";
import { WordMatchGame } from "./games/wordmatch";
import { Completion } from "./Completion";
import { HomeScreen } from "./HomeScreen";
import RegistrationForm from "./components/RegistrationForm";
import { chooseLocalGameType, requestDailyGame } from "./services/gameGenerator";
import "./App.css";
import "bootstrap/dist/css/bootstrap.css";

function App() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isGeneratingGame, setIsGeneratingGame] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [activeGame, setActiveGame] = useState(null);
  const [userRecord, setUserRecord] = useState(null);
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
          .select("*")
          .eq("line_user_id", lineProfile.userId)
          .maybeSingle();

        if (lookupError) throw lookupError;
        if (cancelled) return;

        setUserRecord(registeredUser);
        const registrationComplete = Boolean(registeredUser?.prefecture && registeredUser?.city);
        setIsRegistered(registrationComplete);
        setMessage(
          registrationComplete
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

  async function startGame({ fresh = false } = {}) {
    if (!profile || !isRegistered || isGeneratingGame) return;

    setError("");
    setMessage(fresh ? "テスト用のゲームを生成しています..." : "チェックイン状況を確認しています...");
    setIsGeneratingGame(true);
    let checkingEligibility = !fresh;

    try {
      if (!fresh) {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: recentCheckIn, error: checkInLookupError } = await supabase
          .from("check_ins")
          .select("created_at")
          .eq("line_user_id", profile.userId)
          .gte("created_at", cutoff)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (checkInLookupError) throw checkInLookupError;
        if (recentCheckIn) {
          window.history.pushState({}, "", "/complete");
          setIsCompletionPage(true);
          return;
        }
        checkingEligibility = false;
      }

      setMessage(fresh ? "テスト用のゲームを生成しています..." : "今日のゲームを準備しています...");
      const game = await requestDailyGame({ idToken: liff.getIDToken(), fresh });
      setActiveGame({
        gameType: game.gameType,
        gameData: game,
        source: "ai",
        isTest: fresh,
        checkInId: crypto.randomUUID(),
      });
      setMessage(fresh ? "テスト用のAIゲームです。" : "今日のゲームです。");
    } catch (e) {
      if (checkingEligibility) {
        setMessage("チェックイン状況を確認できませんでした。");
        setError(e?.message || String(e));
        return;
      }

      console.error("Failed to generate a game; starting a local game:", e);
      setActiveGame({
        gameType: chooseLocalGameType(),
        gameData: null,
        source: "local",
        isTest: fresh,
        checkInId: crypto.randomUUID(),
      });
      setMessage("AIに接続できなかったため、ローカルゲームを始めます。");
    } finally {
      setIsGeneratingGame(false);
    }
  }

  async function saveCheckIn() {
    if (!profile || !isRegistered || !activeGame || checkInLock.current) return;

    if (activeGame.isTest) {
      window.history.pushState({}, "", "/complete?test=1");
      setIsCompletionPage(true);
      return;
    }

    checkInLock.current = true;
    setIsCheckingIn(true);
    setError("");
    setMessage("チェックインを記録しています...");

    try {
      const { data: savedCheckIn, error: checkInError } = await supabase
        .from("check_ins")
        .insert({
          id: activeGame.checkInId,
          line_user_id: profile.userId,
          display_name: profile.displayName,
        })
        .select("id, line_user_id, created_at")
        .maybeSingle();

      if (checkInError && checkInError.code !== "23505") throw checkInError;
      if (!savedCheckIn && checkInError?.code !== "23505") {
        throw new Error("Supabase did not return the saved check-in row.");
      }

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

  if (isCompletionPage) {
    return <Completion isTest={new URLSearchParams(window.location.search).get("test") === "1"} />;
  }

  if (profile && isRegistered) {
    return (
      <HomeScreen
        profile={profile}
        userName={userRecord?.name || profile.displayName}
        message={message}
        error={error}
        isGeneratingGame={isGeneratingGame}
        isCheckingIn={isCheckingIn}
        activeGame={activeGame}
        onStartGame={() => startGame()}
        onGenerateTestGame={() => startGame({ fresh: true })}
        onRetryCheckIn={saveCheckIn}
        game={renderActiveGame()}
      />
    );
  }

  if (profile && !isRegistered) {
    return (
      <RegistrationForm
        profile={profile}
        initialUser={userRecord}
        onComplete={(savedUser) => {
          setUserRecord(savedUser);
          setIsRegistered(true);
          setMessage("登録内容を保存しました。");
          setError("");
        }}
      />
    );
  }

  return (
    <div className="App">
      {message && <p role="status">{message}</p>}
      {error && <p role="alert"><code>{error}</code></p>}
    </div>
  );
}

export default App;
