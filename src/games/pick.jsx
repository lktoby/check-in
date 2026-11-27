import { useRef, useState } from "react";

const QUESTIONS = [
    { id: "food", prompt: "食べ物を選んでください。", choices: ["りんご", "くつ", "傘"], answer: "りんご" },
    { id: "drink", prompt: "飲み物を選んでください。", choices: ["お茶", "時計", "鉛筆"], answer: "お茶" },
    { id: "household", prompt: "家で使うものを選んでください。", choices: ["まくら", "みかん", "電車"], answer: "まくら" },
    { id: "stationery", prompt: "文房具を選んでください。", choices: ["鉛筆", "いちご", "せっけん"], answer: "鉛筆" },
    { id: "transport", prompt: "乗り物を選んでください。", choices: ["バス", "ねこ", "皿"], answer: "バス" },
    { id: "clothing", prompt: "身につけるものを選んでください。", choices: ["帽子", "お米", "まな板"], answer: "帽子" },
    { id: "vegetable", prompt: "野菜を選んでください。", choices: ["にんじん", "電話", "くつ"], answer: "にんじん" },
    { id: "kitchen", prompt: "台所で使うものを選んでください。", choices: ["フライパン", "桜", "切符"], answer: "フライパン" },
    { id: "flower", prompt: "花を選んでください。", choices: ["チューリップ", "牛乳", "ラジオ"], answer: "チューリップ" },
];

function shuffle(items) {
    const shuffled = [...items];

    for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
}

function createRound() {
    return shuffle(QUESTIONS)
        .slice(0, 3)
        .map((question) => ({ ...question, choices: shuffle(question.choices) }));
}

export function PickGame({ gameData, onComplete }) {
    const [started, setStarted] = useState(false);
    const [questions, setQuestions] = useState([]);
    const [questionIndex, setQuestionIndex] = useState(0);
    const [feedback, setFeedback] = useState("");
    const [complete, setComplete] = useState(false);
    const completionNotified = useRef(false);

    function startGame() {
        const sourceQuestions = Array.isArray(gameData?.questions) ? gameData.questions : null;
        setQuestions(sourceQuestions
            ? sourceQuestions.map((question) => ({ ...question, choices: shuffle(question.choices) }))
            : createRound());
        setQuestionIndex(0);
        setFeedback("");
        setComplete(false);
        completionNotified.current = false;
        setStarted(true);
    }

    function finishGame() {
        setComplete(true);
        if (!completionNotified.current) {
            completionNotified.current = true;
            onComplete?.();
        }
    }

    function selectChoice(choice) {
        if (feedback === "correct") return;

        if (choice === questions[questionIndex].answer) {
            setFeedback("correct");
        } else {
            setFeedback("wrong");
        }
    }

    function goToNextQuestion() {
        if (questionIndex === questions.length - 1) {
            finishGame();
            return;
        }

        setQuestionIndex((currentIndex) => currentIndex + 1);
        setFeedback("");
    }

    const currentQuestion = questions[questionIndex];

    return (
        <section style={{ maxWidth: "440px", margin: "0 auto", padding: "24px", textAlign: "center" }}>
            {!started && (
                <>
                    <p>質問に合う言葉を選んでください。</p>
                    <p>3問に正解するとゲームクリアです。間違えても、正解するまで何度でも選べます。</p>
                    <button className="btn btn-primary" type="button" onClick={startGame}>
                        ゲームを始める
                    </button>
                </>
            )}

            {started && !complete && currentQuestion && (
                <div>
                    <p>問題 {questionIndex + 1} / {questions.length}</p>
                    <h2>{currentQuestion.prompt}</h2>
                    <div style={{ display: "grid", gap: "12px", margin: "24px 0" }}>
                        {currentQuestion.choices.map((choice) => (
                            <button
                                className="btn btn-outline-primary"
                                key={choice}
                                type="button"
                                onClick={() => selectChoice(choice)}
                                disabled={feedback === "correct"}
                            >
                                {choice}
                            </button>
                        ))}
                    </div>

                    {feedback === "wrong" && <p role="status">もう一度選んでください。</p>}
                    {feedback === "correct" && (
                        <>
                            <p role="status">正解です。</p>
                            <button className="btn btn-primary" type="button" onClick={goToNextQuestion}>
                                {questionIndex === questions.length - 1 ? "ゲームを終える" : "次へ"}
                            </button>
                        </>
                    )}
                </div>
            )}

            {complete && (
                <>
                    <h2>クリア！</h2>
                    <p>3問すべてに正解しました。</p>
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
