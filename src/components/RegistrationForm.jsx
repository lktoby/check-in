
import { useEffect, useState } from "react";
import "./RegistrationForm.css";

const prefectures = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
  "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府",
  "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県",
  "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県",
  "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県",
  "宮崎県", "鹿児島県", "沖縄県"
];

function RegistrationForm() {
  const [registrant, setRegistrant] = useState("senior");
  const [notificationDays, setNotificationDays] = useState("2");
  const [prefecture, setPrefecture] = useState("");
  const [city, setCity] = useState("");
  const [municipalities, setMunicipalities] = useState([]);
  const [loadingCities, setLoadingCities] = useState(true);
  const [cityError, setCityError] = useState("");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [completed, setCompleted] = useState(false);

  const isGuardian = registrant === "guardian";

  // 全国の市区町村データを読み込む
  useEffect(() => {
    let cancelled = false;

    async function loadMunicipalities() {
      try {
        const response = await fetch(
          "https://code4fukui.github.io/localgovjp/localgovjp.json"
        );

        if (!response.ok) {
          throw new Error("データの取得に失敗しました");
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
          throw new Error("データの形式が正しくありません");
        }

        if (!cancelled) {
          setMunicipalities(data);
          setCityError("");
        }
      } catch {
        if (!cancelled) {
          setCityError(
            "市区町村一覧を読み込めませんでした。ネット接続を確認してください。"
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingCities(false);
        }
      }
    }

    loadMunicipalities();

    return () => {
      cancelled = true;
    };
  }, []);

  // 選択した都道府県に対応する自治体だけを表示
  const filteredCities = municipalities
    .filter((item) => item.pref === prefecture && item.city)
    .sort((a, b) => a.city.localeCompare(b.city, "ja"));

  function handlePrefectureChange(event) {
    setPrefecture(event.target.value);
    setCity("");
  }

  // 仮の連携用URLを発行する
  // API接続後に、本物のURLを発行する処理へ変更する
  function generateCode() {
    const demoUrl =
      `${window.location.origin}/guardian-preview.html?link=` +
      Math.random().toString(36).slice(2, 10);

    setCode(demoUrl);
    setCopied(false);
  }

  // URLをコピーする
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      window.prompt("URLを選択してコピーしてください", code);
    }
  }

  // LINEの共有画面を開く
  function shareToLine() {
    if (!code) return;

    const shareUrl =
      "https://line.me/R/share?text=" +
      encodeURIComponent(
        `見守りアプリの連携はこちらから：${code}`
      );

    window.open(shareUrl, "_blank", "noopener,noreferrer");
  }

  function handleSubmit(event) {
    event.preventDefault();
    setCompleted(true);
  }

  // 登録内容の確認画面
  if (completed) {
    return (
      <main className="registration-page">
        <div className="registration-container">
          <p className="registration-subtitle">登録内容の確認</p>
          <div className="flourish">〜 ✳ 〜</div>

          <section className="registration-section hand-drawn">
            <h2>☆ 登録内容</h2>
            <p>
              登録者：{isGuardian ? "家族・保護者" : "高齢者本人"}
            </p>
            <p>通知までの日数：{notificationDays}日後</p>
            <p>お住まいの地域：{prefecture} {city}</p>
          </section>

          <p className="registration-note">
            ※現在は画面確認用です。登録情報は保存されていません。
          </p>

          <button
            type="button"
            className="primary-button"
            onClick={() => setCompleted(false)}
          >
            入力画面に戻る
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="registration-page">
      <div className="registration-container">
        <p className="registration-subtitle">見守り登録フォーム</p>

        <p className="registration-description">
          {isGuardian
            ? "毎日のチェックインで、高齢者の安否を確認しましょう。"
            : "毎日のチェックインで、ご自身の安心を守りましょう。"}
        </p>

        <form onSubmit={handleSubmit}>
          {/* 1. 登録者 */}
          <section className="registration-section hand-drawn">
            <h2>☆ 1. 登録者</h2>
            <p>どなたが登録しますか？</p>

            <div className="registration-options">
              <label className="registration-choice">
                <input
                  type="radio"
                  name="registrant"
                  value="senior"
                  checked={registrant === "senior"}
                  onChange={(event) => setRegistrant(event.target.value)}
                />
                <span>高齢者本人</span>
              </label>

              <label className="registration-choice">
                <input
                  type="radio"
                  name="registrant"
                  value="guardian"
                  checked={registrant === "guardian"}
                  onChange={(event) => setRegistrant(event.target.value)}
                />
                <span>家族・保護者</span>
              </label>
            </div>
          </section>

          {/* 2. 通知までの日数 */}
          <section className="registration-section hand-drawn">
            <h2>☆ 2. 通知までの日数</h2>
            <p>
              {isGuardian
                ? "高齢者のチェックインがない場合、何日後に通知しますか？"
                : "チェックインがない場合、何日後に家族へ通知しますか？"}
            </p>

            <div className="day-options">
              {["1", "2", "3"].map((day) => (
                <label
                  className={`day-option ${
                    notificationDays === day ? "selected" : ""
                  }`}
                  key={day}
                >
                  <input
                    type="radio"
                    name="notificationDays"
                    value={day}
                    checked={notificationDays === day}
                    onChange={(event) =>
                      setNotificationDays(event.target.value)
                    }
                  />
                  <span>{day}日後</span>
                </label>
              ))}
            </div>
          </section>

          {/* 3. お住まいの地域 */}
          <section className="registration-section hand-drawn">
            <h2>☆ 3. お住まいの地域</h2>
            <p>
              {isGuardian
                ? "高齢者様のお住まいの地域を選択してください。"
                : "ご自身のお住まいの地域を選択してください。"}
            </p>

            <label className="registration-field">
              <span>都道府県</span>
              <select
                value={prefecture}
                onChange={handlePrefectureChange}
                required
              >
                <option value="">選択してください</option>
                {prefectures.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            <label className="registration-field">
              <span>市区町村</span>
              <select
                value={city}
                onChange={(event) => setCity(event.target.value)}
                disabled={!prefecture || loadingCities || !!cityError}
                required
              >
                <option value="">
                  {!prefecture
                    ? "先に都道府県を選択してください"
                    : loadingCities
                      ? "読み込み中..."
                      : cityError
                        ? "一覧を読み込めませんでした"
                        : "市区町村を選択してください"}
                </option>

                {filteredCities.map((item, index) => (
                  <option
                    key={`${item.pref}-${item.city}-${index}`}
                    value={item.city}
                  >
                    {item.city}
                  </option>
                ))}
              </select>

              {cityError && (
                <span className="registration-note">{cityError}</span>
              )}
            </label>
          </section>

          {/* 4. 連携用URL */}
          <section className="registration-section hand-drawn">
            <h2>☆ 4. 緊急連絡先との連携</h2>
            <p>
              {isGuardian
                ? "連携用URLを発行して、高齢者本人に送りましょう。"
                : "連携用URLを発行して、家族・保護者に送りましょう。"}
            </p>

            <button
              type="button"
              className="secondary-button"
              onClick={generateCode}
            >
              連携用URLを発行する
            </button>

            {code && (
              <div className="code-card">
                <p className="code-label">連携用URL</p>

                <div className="code-row">
                  <input
                    aria-label="連携用URL"
                    value={code}
                    readOnly
                  />

                  <button
                    type="button"
                    className="copy-button"
                    onClick={copyCode}
                  >
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

                <p className="registration-note">
                  {copied
                    ? "URLをコピーしました。LINEで相手に送りましょう。"
                    : "URLをコピーするか、LINEで共有してください。"}
                </p>
              </div>
            )}

            <p className="registration-note">
              ※現在は仮のURLです。実際の連携機能はまだ接続されていません。
            </p>
          </section>

          <button type="submit" className="primary-button">
            登録内容を確認する　→
          </button>
        </form>

      </div>
    </main>
  );
}

export default RegistrationForm;
