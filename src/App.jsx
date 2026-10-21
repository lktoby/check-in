import * as bootstrap from "bootstrap";
import { useEffect, useState } from "react";
import liff from "@line/liff";
import { supabase } from "./supabaseClient";
import "./App.css";

function App() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(null);

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
        setMessage(`Welcome, ${lineProfile.displayName}`);
      } catch (e) {
        setMessage("Initialization failed.");
        setError(String(e));
      }
    }

    initialize();
  }, []);

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
    </div>
  );
}

export default App;