
import { useEffect, useState } from "react";
import liff from "@line/liff";
import { supabase } from "./supabaseClient";
import "./App.css";
import "bootstrap/dist/css/bootstrap.css";
import RegistrationChoice from "./components/RegistrationChoice";
import GuardianLink from "./components/GuardianLink";

function App() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(null);

  // 招待URLの情報があるか確認
  const params = new URLSearchParams(window.location.search);
  const linkToken = params.get("link");

  useEffect(() => {
    // 招待URLの場合はGuardianLink側でLIFFを初期化する
    if (linkToken) return;

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
        setMessage(`Welcome, ${lineProfile.displayName}`);
      } catch (e) {
        setMessage("Initialization failed.");
        setError(String(e));
      }
    }

    initialize();
  }, [linkToken]);

  async function checkIn() {
    if (!profile) {
      setError("LINE profile is not available.");
      return;
    }

    const { error: insertError } = await supabase
      .from("check_ins")
      .insert({
        line_user_id: profile.userId,
        display_name: profile.displayName,
      });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setMessage("Check-in completed.");
  }

  // 招待URLから開いた場合
  if (linkToken) {
    return <GuardianLink />;
  }

  // 通常アクセスの場合
  return (
    <div className="App">
      <h1>Check in</h1>

      {message && <p>{message}</p>}
      {error && <p><code>{error}</code></p>}

      {profile && (
        <button onClick={checkIn} className="btn btn-primary">
          Check in
        </button>
      )}

      {profile && (
        <RegistrationChoice profile={profile} />
      )}
    </div>
  );
}

export default App;
