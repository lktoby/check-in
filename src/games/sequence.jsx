import { useRef, useState } from "react";

const WORDS = ["りんご", "電車", "お茶", "ねこ", "花", "時計", "海", "本"];

function shuffle(items) {
    const shuffled = [...items];

    for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
}

function createRound(sourceWords = WORDS) {
    const words = shuffle(sourceWords);
    const sequence = words.slice(0, 3);
    const choices = shuffle([...sequence, words[3]]);

    return { sequence, choices };
}

export function SequenceTapGame({ gameData, onComplete }) {
    const [started, setStarted] = useState(false);
    const [showingSequence, setShowingSequence] = useState(true);
    const [sequence, setSequence] = useState([]);
    const [choices, setChoices] = useState([]);
    const [selectedWords, setSelectedWords] = useState([]);
    const [feedback, setFeedback] = useState("");
    const [complete, setComplete] = useState(false);
    const completionNotified = useRef(false);

    function startGame() {
        const round = createRound(Array.isArray(gameData?.words) ? gameData.words : WORDS);
        setSequence(round.sequence);
        setChoices(round.choices);
        setSelectedWords([]);
        setFeedback("");
        setComplete(false);
        setShowingSequence(true);
        setStarted(true);
        completionNotified.current = false;
    }

    function finishGame() {
        setComplete(true);
        if (!completionNotified.current) {
            completionNotified.current = true;
            onComplete?.();
        }
    }

    function selectWord(word) {
        if (selectedWords.includes(word) || complete) return;

        const expectedWord = sequence[selectedWords.length];
        if (word !== expectedWord) {
            setFeedback("wrong");
            return;
        }

        const nextSelectedWords = [...selectedWords, word];
        setSelectedWords(nextSelectedWords);
        setFeedback("correct");

        if (nextSelectedWords.length === sequence.length) {
            finishGame();
        }
    }

    return (
        <section style={{ maxWidth: "440px", margin: "0 auto", padding: "24px", textAlign: "center" }}>
            {!started && (
                <>
                    <p>表示された3つの言葉を順番に覚えてください。</p>
                    <p>隠れた後に、同じ順番で言葉をタップしましょう。</p>
                    <button className="btn btn-primary" type="button" onClick={startGame}>
                        ゲームを始める
                    </button>
                </>
            )}

            {started && !complete && showingSequence && (
                <div>
                    <h2>この順番を覚えてください</h2>
                    <ol style={{ display: "inline-block", textAlign: "left", fontSize: "1.5rem" }}>
                        {sequence.map((word) => <li key={word}>{word}</li>)}
                    </ol>
                    <div>
                        <button
                            className="btn btn-primary"
                            type="button"
                            onClick={() => setShowingSequence(false)}
                        >
                            覚えました。次へ
                        </button>
                    </div>
                </div>
            )}

            {started && !complete && !showingSequence && (
                <div>
                    <p>選んだ言葉: {selectedWords.length ? selectedWords.join("、") : "まだありません"}</p>
                    <p>順番どおりにタップしてください（{selectedWords.length + 1} / {sequence.length}）。</p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px", margin: "24px 0" }}>
                        {choices.map((word) => (
                            <button
                                className="btn btn-outline-primary"
                                key={word}
                                type="button"
                                onClick={() => selectWord(word)}
                                disabled={selectedWords.includes(word)}
                            >
                                {word}
                            </button>
                        ))}
                    </div>

                    {feedback === "wrong" && <p role="status">順番が違います。もう一度選んでください。</p>}
                    {feedback === "correct" && selectedWords.length < sequence.length && (
                        <p role="status">正解です。次の言葉を選んでください。</p>
                    )}
                </div>
            )}

            {complete && (
                <>
                    <h2>クリア！</h2>
                    <p>3つの言葉を順番どおりに選べました。</p>
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
