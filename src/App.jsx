import { useEffect, useState } from "react";
import liff from "@line/liff";
import { supabase } from "./supabaseClient";
import "./App.css";
import "bootstrap/dist/css/bootstrap.css";

function App() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  useEffect(() => {
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
  }, []);

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

  return (
    <div className="App">
      <h1>LINE 仮登録</h1>

      {message && <p>{message}</p>}
      {error && <p><code>{error}</code></p>}

      {profile && (
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

          <button type="submit" disabled={isRegistering || isRegistered}>
            {isRegistering ? "登録中..." : isRegistered ? "登録済み" : "仮登録する"}
          </button>
        </form>
      )}

      {profile && isRegistered && (
        <button
          type="button"
          className="check-in-button"
          onClick={checkIn}
          disabled={isCheckingIn}
        >
          {isCheckingIn ? "記録中..." : "チェックイン"}
        </button>
      )}
    </div>
  );
}

export default App;
