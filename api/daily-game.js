const { randomUUID } = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");

const GAME_TYPES = ["color", "pick", "daily", "sequence", "wordmatch"];
const COLOR_NAMES = ["赤", "青", "黄色", "緑", "オレンジ", "紫"];

const GAME_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    gameType: { type: "string", enum: GAME_TYPES },
    prompt: { type: ["string", "null"] },
    questions: {
      type: ["array", "null"],
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          prompt: { type: "string" },
          choices: { type: "array", items: { type: "string" } },
          answer: { type: "string" },
        },
        required: ["prompt", "choices", "answer"],
      },
    },
    words: { type: ["array", "null"], items: { type: "string" } },
    colors: { type: ["array", "null"], items: { type: "string", enum: COLOR_NAMES } },
  },
  required: ["gameType", "prompt", "questions", "words", "colors"],
};

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

function validateAndNormalizeGame(game) {
  if (!game || !GAME_TYPES.includes(game.gameType)) throw new Error("Unsupported game type.");

  const normalized = {
    gameType: game.gameType,
    prompt: null,
    questions: null,
    words: null,
    colors: null,
  };

  if (game.gameType === "daily") {
    if (!isText(game.prompt, 120)) throw new Error("Invalid daily prompt.");
    normalized.prompt = game.prompt.trim();
  } else if (game.gameType === "pick") {
    if (
      !Array.isArray(game.questions) ||
      game.questions.length !== 3 ||
      !game.questions.every((question) =>
        question &&
        isText(question.prompt, 120) &&
        isDistinctTextList(question.choices, 3, 40) &&
        isText(question.answer, 40) &&
        question.choices.some((choice) => choice.trim() === question.answer.trim())
      )
    ) {
      throw new Error("Invalid pick questions.");
    }
    normalized.questions = game.questions.map((question) => ({
      prompt: question.prompt.trim(),
      choices: question.choices.map((choice) => choice.trim()),
      answer: question.answer.trim(),
    }));
  } else if (game.gameType === "sequence") {
    if (!isDistinctTextList(game.words, 4, 30)) throw new Error("Invalid sequence words.");
    normalized.words = game.words.map((word) => word.trim());
  } else if (game.gameType === "wordmatch") {
    if (!isDistinctTextList(game.words, 2, 30)) throw new Error("Invalid word-match words.");
    normalized.words = game.words.map((word) => word.trim());
  } else if (game.gameType === "color") {
    if (
      !Array.isArray(game.colors) ||
      game.colors.length !== 3 ||
      !game.colors.every((color) => COLOR_NAMES.includes(color)) ||
      new Set(game.colors).size !== 3
    ) {
      throw new Error("Invalid color palette.");
    }
    normalized.colors = [...game.colors];
  }

  return normalized;
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server credentials are missing.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function getJstDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getBearerToken(req) {
  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

async function verifyLineIdToken(idToken) {
  const channelId = process.env.LINE_CHANNEL_ID;
  if (!channelId) throw new Error("LINE channel ID is missing.");

  const body = new URLSearchParams({ id_token: idToken, client_id: channelId });
  const response = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("LINE token verification failed.");

  const result = await response.json();
  if (typeof result.sub !== "string" || !result.sub) throw new Error("LINE token has no user ID.");
  return result.sub;
}

async function generateGame() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = "gpt-6-luna";
  if (!apiKey || !model) throw new Error("OpenAI server configuration is missing.");

  const response = await fetch("https://api.openai.iniad.org/api/v1", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: 1000,
      input: [
        {
          role: "system",
          content:
            "Create one short, friendly Japanese mini-game for a Japanese-speaking player. Choose exactly one supported game type: color, pick, daily, sequence, or wordmatch. Use familiar everyday words, simple language, and unambiguous answers. Never return code, personal information, sensitive topics, or new game rules. Return only the fields required by the schema. For pick, create exactly three questions, each with three distinct choices and one correct answer included among them. For daily, create one open-ended question with no correct answer. For sequence, return exactly four distinct everyday words. For wordmatch, return exactly two distinct everyday words. For color, return exactly three distinct allowed Japanese color names.",
        },
        {
          role: "user",
          content: "Choose a supported game type and create its content for today's round.",
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "daily_game",
          strict: true,
          schema: GAME_SCHEMA,
        },
      },
    }),
    signal: AbortSignal.timeout(20000),
  });

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("OpenAI Responses API error:", response.status, result?.error?.message || "request failed");
    throw new Error("OpenAI request failed.");
  }
  if (result?.status !== "completed") throw new Error("OpenAI response was incomplete.");

  const message = result.output?.find((item) => item.type === "message");
  const refusal = message?.content?.find((item) => item.type === "refusal");
  if (refusal) throw new Error("OpenAI declined to generate a game.");

  const outputText = message?.content?.find((item) => item.type === "output_text")?.text;
  if (typeof outputText !== "string") throw new Error("OpenAI response did not contain game data.");
  return validateAndNormalizeGame(JSON.parse(outputText));
}

async function claimDailyGame(supabase, lineUserId, gameDate) {
  const staleBefore = new Date(Date.now() - 90000).toISOString();

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data: existing, error: readError } = await supabase
      .from("daily_games")
      .select("game_date, claim_id, status, game_data, created_at")
      .eq("line_user_id", lineUserId)
      .maybeSingle();
    if (readError) throw readError;

    if (existing?.game_date === gameDate && existing.status === "ready") {
      return { cachedGame: existing.game_data };
    }

    if (existing?.game_date === gameDate && existing.status === "pending") {
      if (existing.created_at > staleBefore) {
        return { conflict: true };
      }

      const claimId = randomUUID();
      const { data: claimed, error: claimError } = await supabase
        .from("daily_games")
        .update({ claim_id: claimId, created_at: new Date().toISOString() })
        .eq("line_user_id", lineUserId)
        .eq("game_date", gameDate)
        .eq("status", "pending")
        .eq("claim_id", existing.claim_id)
        .lt("created_at", staleBefore)
        .select("claim_id")
        .maybeSingle();
      if (claimError) throw claimError;
      if (claimed) return { claimId };
      continue;
    }

    const claimId = randomUUID();
    if (existing) {
      const { data: claimed, error: claimError } = await supabase
        .from("daily_games")
        .update({
          game_date: gameDate,
          claim_id: claimId,
          status: "pending",
          game_data: null,
          created_at: new Date().toISOString(),
        })
        .eq("line_user_id", lineUserId)
        .eq("game_date", existing.game_date)
        .eq("claim_id", existing.claim_id)
        .select("claim_id")
        .maybeSingle();
      if (claimError) throw claimError;
      if (claimed) return { claimId };
      continue;
    }

    const { data: claimed, error: insertError } = await supabase
      .from("daily_games")
      .insert({
        line_user_id: lineUserId,
        game_date: gameDate,
        claim_id: claimId,
        status: "pending",
        game_data: null,
      })
      .select("claim_id")
      .maybeSingle();
    if (claimed) return { claimId };
    if (insertError?.code !== "23505") throw insertError;
  }

  return { conflict: true };
}

function sendJson(res, status, body) {
  res.status(status).json(body);
}

module.exports = async function dailyGameHandler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  let requestBody = req.body;
  if (typeof requestBody === "string") {
    try {
      requestBody = JSON.parse(requestBody);
    } catch {
      return sendJson(res, 400, { error: "Invalid request body." });
    }
  }
  if (!requestBody || typeof requestBody !== "object" || Array.isArray(requestBody)) {
    return sendJson(res, 400, { error: "Invalid request body." });
  }

  const fresh = requestBody.fresh === true;
  const isDevelopment =
    process.env.VERCEL_ENV === "development" ||
    (!process.env.VERCEL_ENV && process.env.NODE_ENV === "development");
  if (fresh && !isDevelopment) return sendJson(res, 403, { error: "Fresh generation is development-only." });

  let claimId;
  let lineUserId;
  let supabase;

  try {
    const idToken = getBearerToken(req);
    if (!idToken) return sendJson(res, 401, { error: "LINE login is required." });

    lineUserId = await verifyLineIdToken(idToken);
    supabase = getSupabaseAdmin();

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("line_user_id")
      .eq("line_user_id", lineUserId)
      .maybeSingle();
    if (userError) throw userError;
    if (!user) return sendJson(res, 403, { error: "Complete registration before starting a game." });

    if (fresh) {
      const game = await generateGame();
      return sendJson(res, 200, { game, source: "ai", fresh: true });
    }

    const gameDate = getJstDate();
    const claim = await claimDailyGame(supabase, lineUserId, gameDate);
    if (claim.cachedGame) return sendJson(res, 200, { game: claim.cachedGame, source: "ai", cached: true });
    if (!claim.claimId) return sendJson(res, 409, { error: "A game is already being generated. Try again shortly." });
    claimId = claim.claimId;

    const game = await generateGame();
    const { data: saved, error: saveError } = await supabase
      .from("daily_games")
      .update({ status: "ready", game_data: game })
      .eq("line_user_id", lineUserId)
      .eq("game_date", gameDate)
      .eq("claim_id", claimId)
      .eq("status", "pending")
      .select("line_user_id")
      .maybeSingle();
    if (saveError) throw saveError;
    if (!saved) throw new Error("Daily game reservation expired.");

    return sendJson(res, 200, { game, source: "ai", cached: false });
  } catch (error) {
    console.error("Daily game generation failed:", error?.message || String(error));
    if (claimId && lineUserId && supabase) {
      await supabase
        .from("daily_games")
        .delete()
        .eq("line_user_id", lineUserId)
        .eq("claim_id", claimId)
        .eq("status", "pending");
    }
    return sendJson(res, 502, { error: "Game generation failed." });
  }
};
