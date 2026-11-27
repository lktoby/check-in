const GAME_TYPES = ["color", "pick", "daily", "sequence", "wordmatch"];
const COLOR_NAMES = ["赤", "青", "黄色", "緑", "オレンジ", "紫"];

function isText(value, maxLength) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
}

function isDistinctTextList(values, count, maxLength) {
  return (
    Array.isArray(values) &&
    values.length === count &&
    values.every((value) => isText(value, maxLength)) &&
    new Set(values.map((value) => value.trim())).size === count
  );
}

export function validateGameData(game) {
  if (!game || !GAME_TYPES.includes(game.gameType)) return false;

  if (game.gameType === "daily") return isText(game.prompt, 120);

  if (game.gameType === "sequence") return isDistinctTextList(game.words, 4, 30);
  if (game.gameType === "wordmatch") return isDistinctTextList(game.words, 2, 30);
  if (game.gameType === "color") {
    return (
      Array.isArray(game.colors) &&
      game.colors.length === 3 &&
      game.colors.every((color) => COLOR_NAMES.includes(color)) &&
      new Set(game.colors).size === 3
    );
  }

  return (
    Array.isArray(game.questions) &&
    game.questions.length === 3 &&
    game.questions.every((question) =>
      question &&
      isText(question.prompt, 120) &&
      isDistinctTextList(question.choices, 3, 40) &&
      isText(question.answer, 40) &&
      question.choices.some((choice) => choice.trim() === question.answer.trim())
    )
  );
}

export async function requestDailyGame({ idToken, fresh = false }) {
  if (!idToken) throw new Error("LINE ID token is unavailable.");

  const response = await fetch("/api/daily-game", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ fresh }),
  });

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || "Game generation failed.");
  }
  if (!validateGameData(result?.game)) {
    throw new Error("The game response was invalid.");
  }

  return result.game;
}

export function chooseLocalGameType() {
  return GAME_TYPES[Math.floor(Math.random() * GAME_TYPES.length)];
}

