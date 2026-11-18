import { useEffect, useState } from "react";
import liff from "@line/liff";
import { supabase } from "../supabaseClient";
import "./RegistrationForm.css";

export default function HomeScreen({ user, onEditProfile }) {
  const isGuardian = user?.roles?.includes("guardian");
  const isSenior = !isGuardian; // デフォルトは高齢者側

  const [lastCheckIn, setLastCheckIn] = useState(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [seniorsList, setSeniorsList] = useState([]);
  const [inviteUrl, setInviteUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    if (!user?.line_user_id) return;
    if (isSenior) {
      fetchLastCheckIn();
    } else {
      fetchWatchedSeniors();
    }
  }, [user]);

  // 【高齢者用】最新のチェックインを取得
  async function fetchLastCheckIn() {
    const { data } = await supabase
      .from("check_ins")
      .select("created_at")
      .eq("line_user_id", user.line_user_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) setLastCheckIn(data.created_at);
  }

  // 【高齢者用】チェックイン記録
  async function handleCheckIn() {
    if (isCheckingIn) return;
    setIsCheckingIn(true);
    setStatusMessage("");

    const { data, error } = await supabase
      .from("check_ins")
      .insert({
        line_user_id: user.line_user_id,
        display_name: user.name,
      })
      .select("created_at")
      .single();

    if (error) {
      alert("チェックインに失敗しました：" + error.message);
    } else {
      setLastCheckIn(data.created_at);
      setStatusMessage("今日のチェックインを記録しました！");
    }
    setIsCheckingIn(false);
  }

  // 【保護者用】見守り対象（高齢者）の最新状況を取得
  async function fetchWatchedSeniors() {
    const { data: rels, error } = await supabase
      .from("relationships")
      .select(`
        senior_id,
        relationship_type,
        users!relationships_senior_id_fkey (
          name,
          prefecture,
          city,
          send_notification_days
        )
      `)
      .eq("guardian_id", user.line_user_id);

    if (error || !rels) return;

    const results = await Promise.all(
      rels.map(async (rel) => {
        const { data: latest } = await supabase
          .from("check_ins")
          .select("created_at")
          .eq("line_user_id", rel.senior_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        return {
          seniorId: rel.senior_id,
          name: rel.users?.name || "名前未設定",
          location: [rel.users?.prefecture, rel.users?.city].filter(Boolean).join(" "),
          notifyDays: rel.users?.send_notification_days ?? 2,
          lastCheckIn: latest?.created_at || null,
        };
      })
    );
    setSeniorsList(results);
  }

  // 【共通】追加で家族と連携するためのURL発行
  async function generateInviteUrl() {
    const newCode = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase.from("pair_codes").insert({
      code: newCode,
      issuer_id: user.line_user_id,
      issuer_role: isGuardian ? "guardian" : "senior",
      expires_at: expiresAt,
    });

    if (error) {
      alert("招待URLの発行に失敗しました：" + error.message);
      return;
    }

    const url = `https://liff.line.me/${import.meta.env.VITE_LIFF_ID}?link=${newCode}`;
    setInviteUrl(url);
    setCopied(false);
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
    } catch {
      window.prompt("URLを選択してコピーしてください", inviteUrl);
    }
  }

  async function shareToLine() {
    if (!inviteUrl) return;
    if (!liff.isApiAvailable("shareTargetPicker")) {
      alert("LINEアプリ内から開き直してください。");
      return;
    }
    await liff.shareTargetPicker(
      [{ type: "text", text: `見守りアプリの連携はこちらから：\n${inviteUrl}` }],
      { isMultiple: false }
    );
  }

  function formatDate(isoString) {
    if (!isoString) return "まだ記録がありません";
    return new Date(isoString).toLocaleString("ja-JP", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <main className="registration-page">
      <div className="registration-container">
        <p className="registration-subtitle">ホーム画面</p>
        <div className="flourish">〜 ✳ 〜</div>

        {/* ユーザー情報ヘッダー */}
        <section className="registration-section hand-drawn">
          <h2>☆ {user.name} さん</h2>
          <p>役割：{isGuardian ? "家族・保護者" : "高齢者本人"}</p>
          <p>
            地域：{user.prefecture} {user.city}（未確認通知：{user.send_notification_days}日後）
          </p>
          <button
            type="button"
            className="secondary-button"
            onClick={onEditProfile}
          >
            登録内容を編集する
          </button>
        </section>

        {statusMessage && (
          <p className="registration-note" style={{ fontWeight: "bold", color: "#2e7d32" }}>
            {statusMessage}
          </p>
        )}

        {/* 高齢者向け：チェックインボタン */}
        {isSenior && (
          <section className="registration-section hand-drawn">
            <h2>☆ 今日のチェックイン</h2>
            <p>最終チェックイン：{formatDate(lastCheckIn)}</p>
            <button
              type="button"
              className="primary-button"
              onClick={handleCheckIn}
              disabled={isCheckingIn}
            >
              {isCheckingIn ? "記録中..." : "今日も元気です！（チェックイン）"}
            </button>
          </section>
        )}

        {/* 保護者向け：見守り中のご家族一覧 */}
        {isGuardian && (
          <section className="registration-section hand-drawn">
            <h2>☆ 見守り中のご家族</h2>
            {seniorsList.length === 0 ? (
              <p className="registration-note">
                まだ連携されているご家族がいません。下のボタンから連携用URLを送ってください。
              </p>
            ) : (
              seniorsList.map((senior) => (
                <div key={senior.seniorId} className="code-card" style={{ marginBottom: "12px" }}>
                  <p style={{ fontWeight: "bold", margin: "0 0 4px" }}>{senior.name} さん</p>
                  <p style={{ margin: "0 0 4px", fontSize: "0.9rem" }}>地域：{senior.location}</p>
                  <p style={{ margin: 0 }}>
                    最終チェックイン：<strong>{formatDate(senior.lastCheckIn)}</strong>
                  </p>
                </div>
              ))
            )}
          </section>
        )}

        {/* 共通：追加の家族連携 */}
        <section className="registration-section hand-drawn">
          <h2>☆ 家族を追加連携する</h2>
          <p>
            {isGuardian
              ? "高齢者本人に連携用URLを送って紐付けます。"
              : "家族・保護者に連携用URLを送って紐付けます。"}
          </p>
          <button
            type="button"
            className="secondary-button"
            onClick={generateInviteUrl}
          >
            連携用URLを発行する
          </button>

          {inviteUrl && (
            <div className="code-card">
              <div className="code-row">
                <input value={inviteUrl} readOnly />
                <button type="button" className="copy-button" onClick={copyUrl}>
                  {copied ? "コピー済み ✓" : "URLをコピー"}
                </button>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={shareToLine}
              >
                LINEで共有
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}