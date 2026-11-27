import { useEffect, useRef, useState } from "react";
import liff from "@line/liff";
import { supabase } from "./supabaseClient";
import { ColorMatchGame } from "./games/color";
import { DailyPromptGame } from "./games/daily";
import { PickGame } from "./games/pick";
import { SequenceTapGame } from "./games/sequence";
import { WordMatchGame } from "./games/wordmatch";
import { Completion } from "./Completion";
import HomeScreen from "./components/HomeScreen";
import RegistrationForm from "./components/RegistrationForm";
import GuardianLink from "./components/GuardianLink";
import { chooseLocalGameType, requestDailyGame } from "./services/gameGenerator";
import "./App.css";
import "./base.css";
import "bootstrap/dist/css/bootstrap.css";

function App() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [userRecord, setUserRecord] = useState(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isGeneratingGame, setIsGeneratingGame] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [activeGame, setActiveGame] = useState(null);
  const [isCompletionPage, setIsCompletionPage] = useState(
    () => window.location.pathname === "/complete"
  );
  const checkInLock = useRef(false);
  const linkToken = new URLSearchParams(window.location.search).get("link");

  useEffect(() => {
    function updateRoute() {
      setIsCompletionPage(window.location.pathname === "/complete");
    }
    window.addEventListener("popstate", updateRoute);
    return () => window.removeEventListener("popstate", updateRoute);
  }, []);

  useEffect(() => {
    if (isCompletionPage || linkToken) {
      setLoading(false);
      return undefined;
    }

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

        const { data: existingUser, error: lookupError } = await supabase
          .from("users")
          .select("*")
          .eq("line_user_id", lineProfile.userId)
          .maybeSingle();

        if (lookupError) throw lookupError;
        if (cancelled) return;

        setUserRecord(existingUser);
        const registrationComplete = Boolean(existingUser?.prefecture && existingUser?.city);
        setIsRegistered(registrationComplete);
        setMessage(
          registrationComplete
            ? `登録済みです: ${existingUser.name}`
            : "登録内容を入力してください。"
        );
      } catch (e) {
        if (cancelled) return;
        setMessage("初期化に失敗しました。");
        console.error("Failed to initialize LIFF or load registration:", e);
        setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    initialize();
    return () => {
      cancelled = true;
    };
  }, [isCompletionPage, linkToken]);

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
      case "color": return <ColorMatchGame {...props} />;
      case "daily": return <DailyPromptGame {...props} />;
      case "pick": return <PickGame {...props} />;
      case "sequence": return <SequenceTapGame {...props} />;
      case "wordmatch": return <WordMatchGame {...props} />;
      default: return null;
    }
  }

  if (isCompletionPage) {
    return <Completion isTest={new URLSearchParams(window.location.search).get("test") === "1"} />;
  }
  if (linkToken) return <GuardianLink />;
  if (loading) return <div className="App"><p>読み込み中...</p></div>;
  if (error && !profile) return <div className="App"><p role="alert">{error}</p></div>;

  if (userRecord && isRegistered && !isEditing) {
    return (
      <HomeScreen
        user={userRecord}
        onEditProfile={() => setIsEditing(true)}
        onStartGame={() => startGame()}
        onGenerateTestGame={() => startGame({ fresh: true })}
        isGeneratingGame={isGeneratingGame}
        isCheckingIn={isCheckingIn}
        activeGame={activeGame}
        game={renderActiveGame()}
        error={error}
        message={message}
        onRetryCheckIn={saveCheckIn}
      />
    );
  }

  return (
    <RegistrationForm
      profile={profile}
      initialUser={userRecord}
      onComplete={(savedUser) => {
        setUserRecord(savedUser);
        setIsRegistered(true);
        setIsEditing(false);
        setMessage("登録内容を保存しました。");
        setError("");
      }}
    />
  );
}

export default App;
