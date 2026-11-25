
import { useEffect, useState } from "react";
import liff from "@line/liff";
import { supabase, isTestMode } from "./supabaseClient";
import "./App.css";
import "bootstrap/dist/css/bootstrap.css";
import RegistrationChoice from "./components/RegistrationChoice";
import GuardianLink from "./components/GuardianLink";
import TestUserSelector from "./components/TestUserSelector";

function App() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  // 招待URLの情報があるか確認
  const params = new URLSearchParams(window.location.search);
  const linkToken = params.get("link");

  useEffect(() => {
    // 招待URLの場合はGuardianLink側でLIFFを初期化する
    if (isTestMode || linkToken) return;

    async function initialize() {
      try {
        await liff.init({
          liffId: import.meta.env.VITE_LIFF_ID,
        });

        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const lineProfile = await liff.getProfile();
        setProfile(lineProfile);
        setMessage("LINE profile loaded. Confirm the details and register.");
      } catch (e) {
        setMessage("Initialization failed.");
        console.error("Failed to initialize LIFF or load the LINE profile:", e);
        setError(e?.message || String(e));
      }
    }

    initialize();
  }, [linkToken]);

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

  async function checkIn() {
    if (!profile || !isRegistered || isCheckingIn) return;

    setError("");
    setIsCheckingIn(true);
    setMessage("Saving check-in...");

    try {
      const { error: checkInError } = await supabase.from("check_ins").insert({
        line_user_id: profile.userId,
        display_name: profile.displayName,
      });

      if (checkInError) throw checkInError;

      setMessage("Check-in saved.");
    } catch (e) {
      console.error("Failed to save check-in:", e);
      setError(e?.message || String(e));
      setMessage("Check-in failed.");
    } finally {
      setIsCheckingIn(false);
    }
  }

  // 招待URLから開いた場合
  if (linkToken && (!isTestMode || profile)) {
    return <GuardianLink profile={profile} />;
  }

  if (isTestMode && !profile) {
    return <TestUserSelector onSelect={setProfile} />;
  }
  
  // 通常アクセスの場合
  return (
    <div className="App">
      {profile && (
        <RegistrationChoice profile={profile} />
      )}
    </div>
  );
}

export default App;
