
import { useEffect, useState } from "react";
import liff from "@line/liff";
import "./GuardianLink.css";

function GuardianLink() {
  const [confirmed, setConfirmed] = useState(false);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const params = new URLSearchParams(window.location.search);
  const linkToken = params.get("link");

  // LINEの初期化とプロフィール取得
  useEffect(() => {
    async function initialize() {
      try {
        await liff.init({
          liffId: import.meta.env.VITE_LIFF_ID,
        });

        if (!liff.isLoggedIn()) {
          liff.login({
            redirectUri: window.location.href,
          });
          return;
        }

        const lineProfile = await liff.getProfile();
        setProfile(lineProfile);
      } catch (e) {
        console.error(e);
        setError("LINEの情報を取得できませんでした。");
      } finally {
        setLoading(false);
      }
    }

    initialize();
  }, []);

  // 読み込み中
  if (loading) {
    return (
      <main className="guardian-page">
        <section className="guardian-card">
          <p>LINE情報を確認しています...</p>
        </section>
      </main>
    );
  }

  // 確認後の画面
  if (confirmed) {
    return (
      <main className="guardian-page">
        <section className="guardian-card">
          <div className="guardian-icon">✓</div>
          <h1>確認しました</h1>
          <p>連携の確認画面を終了します。</p>

          <p className="guardian-note">
            ※現在は画面確認用です。
            実際の連携はまだ完了していません。
          </p>

          <button
            className="guardian-button"
            onClick={() => setConfirmed(false)}
          >
            戻る
          </button>
        </section>
      </main>
    );
  }

  // 保護者向け連携画面
  return (
    <main className="guardian-page">
      <section className="guardian-card">
        <div className="guardian-icon">♡</div>

        <p className="guardian-subtitle">
          FAMILY SUPPORT
        </p>

        <h1>見守り連携のご案内</h1>

        <p className="guardian-description">
          ご家族の見守りを始めましょう。
          以下の内容を確認してください。
        </p>

        <div className="guardian-info">
          <p className="guardian-info-title">
            <span>✿</span> 連携について
          </p>

          <p>
            高齢者本人のチェックインが一定期間ない場合、
            ご家族に通知するための連携を行います。
          </p>
        </div>

        <div className="guardian-person">
          <div className="guardian-avatar">♧</div>

          <div>
            <p className="guardian-label">
              連携する保護者
            </p>

            <p className="guardian-person-name">
              {profile?.displayName || "LINEユーザー"}
            </p>
          </div>
        </div>

        {error && (
          <p className="guardian-warning">
            {error}
          </p>
        )}

        {!linkToken && (
          <p className="guardian-warning">
            連携用URLの情報が見つかりません。
            ご家族から送られたURLをもう一度開いてください。
          </p>
        )}

        <button
          className="guardian-button"
          disabled={!linkToken || !profile}
          onClick={() => setConfirmed(true)}
        >
          この人と連携する
        </button>

        <p className="guardian-note">
          ※現在は画面確認用です。
          ボタンを押しても実際の連携は完了しません。
        </p>

        <p className="guardian-footer">
          安心できる毎日を、家族みんなで。
        </p>
      </section>
    </main>
  );
}

export default GuardianLink;
