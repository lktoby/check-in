import { useEffect, useRef, useState } from "react";

const WORDS = ["さくら", "りんご", "電車", "ねこ", "お茶", "時計", "本", "自転車", "空", "海"];

function shuffle(items) {
    const shuffled = [...items];

    for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
}

function GenerateCard({ card, onClick, disabled }) {
    const cardStyle = {
        width: "min(38vw, 180px)",
        minHeight: "120px",
        border: "2px solid #333",
        borderRadius: "12px",
        padding: "12px",
        backgroundColor: card.matched ? "#d8f3dc" : "white",
        color: "#222",
        fontSize: "1.5rem",
        fontWeight: "bold",
        cursor: disabled ? "default" : "pointer",
    };

    return (
        <button
            key={card.id}
            type="button"
            style={cardStyle}
            onClick={() => onClick(card.id)}
            disabled={disabled || card.matched}
            aria-label={card.revealed || card.matched ? card.word : "伏せられたカード"}
        >
            {card.revealed || card.matched ? card.word : "？"}
        </button>
    );
}

function GenerateDeck() {
    const words = shuffle(WORDS).slice(0, 2);
    const cards = words.flatMap((word, pairIndex) => [
        { id: `${pairIndex}-a`, word, revealed: false, matched: false },
        { id: `${pairIndex}-b`, word, revealed: false, matched: false },
    ]);

    return shuffle(cards);
}

export function WordMatchGame() {
    const [gameStart, setGameStart] = useState(false);
    const [cards, setCards] = useState([]);
    const [selectedCards, setSelectedCards] = useState([]);
    const [locked, setLocked] = useState(false);
    const [complete, setComplete] = useState(false);
    const mismatchTimeout = useRef(null);

    useEffect(() => () => clearTimeout(mismatchTimeout.current), []);

    function startGame() {
        clearTimeout(mismatchTimeout.current);
        setCards(GenerateDeck());
        setSelectedCards([]);
        setLocked(false);
        setComplete(false);
        setGameStart(true);
    }

    function selectCard(cardId) {
        if (locked || complete) return;

        const card = cards.find((item) => item.id === cardId);
        if (!card || card.revealed || card.matched) return;

        const revealedCards = cards.map((item) =>
            item.id === cardId ? { ...item, revealed: true } : item
        );
        setCards(revealedCards);

        if (selectedCards.length === 0) {
            setSelectedCards([cardId]);
            return;
        }

        const firstCardId = selectedCards[0];
        const firstCard = cards.find((item) => item.id === firstCardId);
        setSelectedCards([]);

        if (firstCard.word === card.word) {
            const matchedCards = revealedCards.map((item) =>
                item.id === firstCardId || item.id === cardId
                    ? { ...item, revealed: true, matched: true }
                    : item
            );
            setCards(matchedCards);

            if (matchedCards.every((item) => item.matched)) {
                setComplete(true);
            }
            return;
        }

        setLocked(true);
        mismatchTimeout.current = setTimeout(() => {
            setCards((currentCards) =>
                currentCards.map((item) =>
                    item.id === firstCardId || item.id === cardId
                        ? { ...item, revealed: false }
                        : item
                )
            );
            setLocked(false);
        }, 1000);
    }

    return (
        <section style={{ maxWidth: "440px", margin: "0 auto", padding: "24px", textAlign: "center" }}>
            {!gameStart && (
                <>
                    <p>同じ言葉のカードを2枚見つけてください。</p>
                    <p>カードを2枚ずつめくって、すべてのペアをそろえましょう。</p>
                    <button className="btn btn-primary" type="button" onClick={startGame}>ゲームを始める</button>
                </>
            )}

            {gameStart && !complete && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px", justifyItems: "center" }}>
                    {cards.map((card) => (
                        <GenerateCard
                            key={card.id}
                            card={card}
                            onClick={selectCard}
                            disabled={locked}
                        />
                    ))}
                </div>
            )}

            {complete && (
                <>
                    <h2>クリア！</h2>
                    <p>すべてのペアがそろいました。</p>
                    <button className="btn btn-primary" type="button" onClick={startGame}>もう一度遊ぶ</button>
                </>
            )}
        </section>
    );
}