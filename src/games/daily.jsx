import { useRef, useState } from "react";

const PROMPTS = [
    "今日のおやつにするなら、何がいいですか？",
    "散歩でどんなものを見かけるとうれしいですか？",
    "どんなお茶が好きですか？",
    "のんびり過ごすとき、何をしたいですか？",
    "好きな花や植物はありますか？",
    "朝ごはんには何を食べましたか？",
];

function choosePrompt() {
    return PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
}

export function DailyPromptGame({ gameData, onComplete }) {
    const [started, setStarted] = useState(false);
    const [prompt, setPrompt] = useState(null);
    const [answer, setAnswer] = useState("");
    const [submittedAnswer, setSubmittedAnswer] = useState("");
    const completionNotified = useRef(false);

    function startGame() {
        setPrompt(gameData?.prompt || choosePrompt());
        setAnswer("");
        setSubmittedAnswer("");
        completionNotified.current = false;
        setStarted(true);
    }

    function submitAnswer(event) {
        event.preventDefault();
        setSubmittedAnswer(answer.trim());
        if (!completionNotified.current) {
            completionNotified.current = true;
            onComplete?.();
        }
    }

    return (
        <section style={{ maxWidth: "440px", margin: "0 auto", padding: "24px", textAlign: "center" }}>
            {!started && (
                <>
                    <p>質問をひとつ読み、思いついたことを入力してください。</p>
                    <p>正解・不正解はありません。入力した内容は保存されません。</p>
                    <button className="btn btn-primary" type="button" onClick={startGame}>
                        ゲームを始める
                    </button>
                </>
            )}

            {started && !submittedAnswer && prompt && (
                <div>
                    <h2>{prompt}</h2>
                    <form onSubmit={submitAnswer}>
                        <label className="form-label" htmlFor="daily-prompt-answer">
                            あなたの回答
                        </label>
                        <textarea
                            id="daily-prompt-answer"
                            className="form-control"
                            rows="3"
                            maxLength={200}
                            required
                            value={answer}
                            onChange={(event) => setAnswer(event.target.value)}
                            placeholder="ここに入力してください"
                        />
                        <button
                            className="btn btn-primary"
                            type="submit"
                            disabled={!answer.trim()}
                            style={{ marginTop: "16px" }}
                        >
                            回答する
                        </button>
                    </form>
                </div>
            )}

            {submittedAnswer && (
                <>
                    <h2>ありがとうございました。</h2>
                    <p>「{submittedAnswer}」なんですね。お話しくださってありがとうございます。</p>
                    <p>今日のひとことは以上です。</p>
                    {!onComplete && (
                        <button className="btn btn-primary" type="button" onClick={startGame}>
                            もう一度遊ぶ
                        </button>
                    )}
                </>
            )}
        </section>
    );
}
