import { useState } from "react";

const COLORS = [
    { name: "赤", value: "#dc3545" },
    { name: "青", value: "#0d6efd" },
    { name: "黄色", value: "#ffc107" },
    { name: "緑", value: "#198754" },
    { name: "オレンジ", value: "#fd7e14" },
    { name: "紫", value: "#6f42c1" },
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
    return shuffle(COLORS)
        .slice(0, 3)
        .map((target) => {
            const choices = shuffle([
                target,
                ...shuffle(COLORS.filter((color) => color.name !== target.name)).slice(0, 2),
            ]);

            return { target, choices };
        });
}

function ColorSwatch({ color }) {
    return (
        <span
            aria-hidden="true"
            style={{
                display: "inline-block",
                width: "36px",
                height: "36px",
                marginRight: "12px",
                border: "1px solid #555",
                borderRadius: "6px",
                backgroundColor: color.value,
                verticalAlign: "middle",
            }}
        />
    );
}

export function ColorMatchGame() {
    const [started, setStarted] = useState(false);
    const [round, setRound] = useState([]);
    const [questionIndex, setQuestionIndex] = useState(0);
    const [feedback, setFeedback] = useState("");
    const [complete, setComplete] = useState(false);

    function startGame() {
        setRound(createRound());
        setQuestionIndex(0);
        setFeedback("");
        setComplete(false);
        setStarted(true);
    }

    function selectColor(color) {
        if (feedback === "correct") return;

        setFeedback(color.name === round[questionIndex].target.name ? "correct" : "wrong");
    }

    function goToNextQuestion() {
        if (questionIndex === round.length - 1) {
            setComplete(true);
            return;
        }

        setQuestionIndex((currentIndex) => currentIndex + 1);
        setFeedback("");
    }

    const currentQuestion = round[questionIndex];

    return (
        <section style={{ maxWidth: "440px", margin: "0 auto", padding: "24px", textAlign: "center" }}>
            {!started && (
                <>
                    <p>見本と同じ色を選んでください。</p>
                    <p>3問に正解するとゲームクリアです。</p>
                    <button className="btn btn-primary" type="button" onClick={startGame}>
                        ゲームを始める
                    </button>
                </>
            )}

            {started && !complete && currentQuestion && (
                <div>
                    <p>問題 {questionIndex + 1} / {round.length}</p>
                    <h2>見本の色</h2>
                    <p style={{ fontSize: "1.25rem" }}>
                        <ColorSwatch color={currentQuestion.target} />
                        {currentQuestion.target.name}
                    </p>
                    <p>同じ色を選んでください。</p>
                    <div style={{ display: "grid", gap: "12px", margin: "24px 0" }}>
                        {currentQuestion.choices.map((color) => (
                            <button
                                className="btn btn-outline-primary"
                                key={color.name}
                                type="button"
                                onClick={() => selectColor(color)}
                                disabled={feedback === "correct"}
                                aria-label={`${color.name}の色`}
                            >
                                <ColorSwatch color={color} />
                                {color.name}
                            </button>
                        ))}
                    </div>

                    {feedback === "wrong" && <p role="status">もう一度選んでください。</p>}
                    {feedback === "correct" && (
                        <>
                            <p role="status">正解です。</p>
                            <button className="btn btn-primary" type="button" onClick={goToNextQuestion}>
                                {questionIndex === round.length - 1 ? "ゲームを終える" : "次へ"}
                            </button>
                        </>
                    )}
                </div>
            )}

            {complete && (
                <>
                    <h2>クリア！</h2>
                    <p>3問すべてに正解しました。</p>
                    <button className="btn btn-primary" type="button" onClick={startGame}>
                        もう一度遊ぶ
                    </button>
                </>
            )}
        </section>
    );
}
