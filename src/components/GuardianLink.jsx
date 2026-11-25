
import { useEffect, useState } from "react";
import liff from "@line/liff";
import { supabase, isTestMode } from "../supabaseClient";
import "./GuardianLink.css";

function GuardianLink({ profile: selectedProfile }) {
  const [confirmed, setConfirmed] = useState(false);
  const [profile, setProfile] = useState(null);
  const [inviter, setInviter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const params = new URLSearchParams(window.location.search);
  const linkToken = params.get("link");

  // LINE情報またはテストユーザー情報と招待情報を取得
  useEffect(() => {
    async function initialize() {
      try {
        let currentProfile;

        if (isTestMode) {
          // テストモードでは選択されたテストユーザーを使う
          if (!selectedProfile) {
            throw new Error("テストユーザーが選択されていません。");
          }

          currentProfile = selectedProfile;
        } else {
          // 本番モードではLINEを初期化する
          await liff.init({
            liffId: import.meta.env.VITE_LIFF_ID,
          });

          if (!liff.isLoggedIn()) {
            liff.login({
              redirectUri: window.location.href,
            });
            return;
          }

          currentProfile = await liff.getProfile();
        }

        setProfile(currentProfile);

        if (!linkToken) {
          throw new Error("連携用URLの情報が見つかりません。");
        }

        // 招待コードを検索
        const { data: codeData, error: codeError } = await supabase
          .from("pair_codes")
          .select("issuer_id, issuer_role, expires_at")
          .eq("code", linkToken)
          .maybeSingle();

        if (codeError) throw codeError;

        if (!codeData) {
          throw new Error("招待コードが見つかりません。URLを確認してください。");
        }

        // 有効期限を確認
        if (new Date(codeData.expires_at) < new Date()) {
          throw new Error("この招待URLは有効期限が切れています。");
        }

        // 自分自身が発行したURLではないか確認
        if (codeData.issuer_id === currentProfile.userId) {
          throw new Error("自分が発行したURLからは連携できません。");
        }

        // 招待した人の名前を取得
        const { data: inviterData, error: inviterError } = await supabase
          .from("users")
          .select("line_user_id, name")
          .eq("line_user_id", codeData.issuer_id)
          .maybeSingle();

        if (inviterError) throw inviterError;

        if (!inviterData) {
          throw new Error("招待した人の登録情報が見つかりません。");
        }

        setInviter({
          ...inviterData,
          role: codeData.issuer_role,
        });
      } catch (e) {
        console.error(e);
        setError(e.message || "連携情報を取得できませんでした。");
      } finally {
        setLoading(false);
      }
    }

    initialize();
  }, [linkToken, selectedProfile]);

  // 連携を承認する
  async function handleConfirm() {
    if (!profile || !inviter || saving) return;

    setSaving(true);
    setError("");

    try {
      // 招待された側の役割を決める
      const recipientRole =
        inviter.role === "senior" ? "guardian" : "senior";

      // 招待された側の情報をusersに登録
      const { error: recipientError } = await supabase
        .from("users")
        .upsert(
          {
            line_user_id: profile.userId,
            name: profile.displayName,
            roles: [recipientRole],
          },
          { onConflict: "line_user_id", ignoreDuplicates: true }
        );

      if (recipientError) throw recipientError;

      // 本人と保護者のIDを振り分ける
      const seniorId =
        inviter.role === "senior"
          ? inviter.line_user_id
          : profile.userId;

      const guardianId =
        inviter.role === "guardian"
          ? inviter.line_user_id
          : profile.userId;

      // relationshipsに連携情報を保存
      const { error: insertError } = await supabase
        .from("relationships")
        .insert({
          senior_id: seniorId,
          guardian_id: guardianId,
          relationship_type: "family",
        });

      if (insertError) throw insertError;

      setConfirmed(true);
    } catch (e) {
      console.error(e);
      setError(e.message || "連携に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  // 読み込み中
  if (loading) {
    return (
      <main className="guardian-page">
        <section className="guardian-card">
          <p>LINE情報と連携情報を確認しています...</p>
        </section>
      </main>
    );
  }

  // 連携完了画面
  if (confirmed) {
    return (
      <main className="guardian-page">
        <section className="guardian-card">
          <div className="guardian-icon">✓</div>
          <h1>連携が完了しました</h1>
          <p>
            {inviter?.name}さんとの見守り連携が完了しました。
          </p>
          <p className="guardian-note">
            これからよろしくお願いします。
          </p>
        </section>
      </main>
    );
  }

  const inviterRoleName =
    inviter?.role === "senior"
      ? "高齢者本人"
      : "家族・保護者";

  const recipientRoleName =
    inviter?.role === "senior"
      ? "家族・保護者"
      : "高齢者本人";

  // 招待内容の確認画面
  return (
    <main className="guardian-page">
      <section className="guardian-card">
        <div className="guardian-icon">♡</div>

        <p className="guardian-subtitle">
          FAMILY SUPPORT
        </p>

        <h1>見守り連携のご案内</h1>

        <p className="guardian-description">
          以下の内容を確認して、連携を行ってください。
        </p>

        {inviter && (
          <>
            <div className="guardian-person">
              <div className="guardian-avatar">♧</div>
              <div>
                <p className="guardian-label">
                  招待した人（{inviterRoleName}）
                </p>
                <p className="guardian-person-name">
                  {inviter.name || "LINEユーザー"}
                </p>
              </div>
            </div>

            <div className="guardian-info">
              <p className="guardian-info-title">
                ✿ 連携する相手
              </p>
              <p>
                {profile?.displayName || "LINEユーザー"}さん
                （{recipientRoleName}）
              </p>
            </div>
          </>
        )}

        {error && (
          <p className="guardian-warning">
            {error}
          </p>
        )}

        <button
          className="guardian-button"
          disabled={!linkToken || !profile || !inviter || saving || !!error}
          onClick={handleConfirm}
        >
          {saving ? "連携しています..." : "この人と連携する"}
        </button>

        <p className="guardian-note">
          承認すると、本人と保護者の連携情報が登録されます。
        </p>

        <p className="guardian-footer">
          安心できる毎日を、家族みんなで。
        </p>
      </section>
    </main>
  );
}

export default GuardianLink;
