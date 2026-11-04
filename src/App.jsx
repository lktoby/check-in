import { useEffect, useState } from "react";
import liff from "@line/liff";
import { supabase } from "./supabaseClient";
import "./App.css";
import "bootstrap/dist/css/bootstrap.css";

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

        setMessage("Saving your profile...");

        // Update only the LINE identity fields; leave later registration fields intact.
        const { data: savedUser, error: userError } = await supabase
          .from("users")
          .upsert(
            {
              line_user_id: lineProfile.userId,
              name: lineProfile.displayName,
            },
            { onConflict: "line_user_id" }
          )
          .select("line_user_id")
          .single();

        if (userError) throw userError;
        if (savedUser?.line_user_id !== lineProfile.userId) {
          throw new Error("Supabase did not return the saved user row.");
        }

        setProfile(lineProfile);
        setMessage(`Profile saved to Supabase. Welcome, ${lineProfile.displayName}`);
      } catch (e) {
        setMessage("Initialization failed.");
        console.error("Failed to initialize LINE or save the Supabase profile:", e);
        setError(e?.message || String(e));
      }
    }

    initialize();
  }, []);

  async function checkIn() {
    if (!profile) {
      setError("LINE profile is not available.");
      return;
    }

    setError("");
    setMessage("Processing check-in...");

    try {
      // Ensure the referenced user row exists in the same database before inserting.
      const { data: savedUser, error: userError } = await supabase
        .from("users")
        .upsert(
          {
            line_user_id: profile.userId,
            name: profile.displayName,
          },
          { onConflict: "line_user_id" }
        )
        .select("line_user_id")
        .single();

      if (userError) throw userError;
      if (savedUser?.line_user_id !== profile.userId) {
        throw new Error("Could not confirm the user row before check-in.");
      }

      // check_ins テーブルに新しいチェックイン履歴を記録
      const { error: insertError } = await supabase.from("check_ins").insert({
        line_user_id: profile.userId,
        display_name: profile.displayName,
      });

      if (insertError) throw insertError;

      setMessage("Check-in completed successfully!");
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to check in.");
    }
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
