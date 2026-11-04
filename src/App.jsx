import { useEffect, useState } from "react";
import liff from "@line/liff";
import { supabase } from "./supabaseClient";
import "./App.css";
import "bootstrap/dist/css/bootstrap.css";

function App() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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

        setMessage(`Profile saved to Supabase. Welcome, ${lineProfile.displayName}`);
      } catch (e) {
        setMessage("Initialization failed.");
        console.error("Failed to initialize LINE or save the Supabase profile:", e);
        setError(e?.message || String(e));
      }
    }

    initialize();
  }, []);

  return (
    <div className="App">
      <h1>LINE Login</h1>

      {message && <p>{message}</p>}
      {error && <p><code>{error}</code></p>}
    </div>
  );
}

export default App;
