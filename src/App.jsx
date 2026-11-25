import { useEffect, useState } from "react";
import liff from "@line/liff";
import { supabase } from "./supabaseClient";
import "./App.css";
import "./base.css";
import "bootstrap/dist/css/bootstrap.css";
import RegistrationForm from "./components/RegistrationForm";
import HomeScreen from "./components/HomeScreen";
import GuardianLink from "./components/GuardianLink";

function App() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [userRecord, setUserRecord] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const linkToken = params.get("link");

  useEffect(() => {
    if (linkToken) {
      setLoading(false);
      return;
    }

    async function initialize() {
      try {
        await liff.init({ liffId: import.meta.env.VITE_LIFF_ID });

        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const lineProfile = await liff.getProfile();
        setProfile(lineProfile);

        // Supabaseから既存の登録情報を取得
        const { data: existingUser } = await supabase
          .from("users")
          .select("*")
          .eq("line_user_id", lineProfile.userId)
          .maybeSingle();

        if (existingUser?.prefecture) {
          setUserRecord(existingUser);
        }
      } catch (e) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    }

    initialize();
  }, [linkToken]);

  if (linkToken) return <GuardianLink />;
  if (loading) return <div className="App"><p>読み込み中...</p></div>;
  if (error) return <div className="App"><p>{error}</p></div>;

  // 登録済みならホーム画面へ
  if (userRecord && !isEditing) {
    return (
      <HomeScreen
        user={userRecord}
        onEditProfile={() => setIsEditing(true)}
      />
    );
  }

  // 未登録・編集時は登録フォームへ
  return (
    <RegistrationForm
      profile={profile}
      initialUser={userRecord}
      onComplete={(savedUser) => {
        setUserRecord(savedUser);
        setIsEditing(false);
      }}
    />
  );
}

export default App;