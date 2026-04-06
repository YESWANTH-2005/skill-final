import { env } from "../config/env.js";

const ADVISOR_SYSTEM_PROMPT = `You are Skill Recommendation System AI, a friendly and knowledgeable career advisor for a skill learning platform.
You help people discover which skills to learn, understand career paths, and make confident learning decisions.
Keep responses concise (2-4 short paragraphs max), practical, and encouraging.
Use specific examples and data where helpful. Format with line breaks for readability. No markdown headers.
Always end with a relevant follow-up question or actionable next step.`;

let cachedGeminiModel = "";

function buildFallbackReply(message) {
  const text = (message || "").toLowerCase();

  if (text.includes("data")) {
    return "A strong data path is SQL, Python, and data visualization, in that order, because each step unlocks real project work quickly.\nIf you can spend 5-10 hours weekly, target one portfolio dashboard every 2 weeks to build interview-ready proof.\nWould you like a 6-week beginner data plan tailored to your current level?";
  }

  if (text.includes("design")) {
    return "For product design, prioritize UX research basics, wireframing, and then Figma components so your work shows both process and craft.\nA focused case study with problem framing, user insights, and final UI screens is usually more valuable than multiple unfinished projects.\nDo you want a portfolio checklist you can use for your next design project?";
  }

  if (text.includes("marketing")) {
    return "A practical growth marketing sequence is SEO fundamentals, analytics tracking, and lifecycle email automation.\nTry running one small experiment each week and document the metric impact so you build measurable outcomes for interviews.\nShould I help you define your first 30-day growth experiment plan?";
  }

  if (text.includes("react") || text.includes("frontend") || text.includes("web")) {
    return "For web development, build momentum with JavaScript fundamentals first, then React components, and then API integration projects.\nA good checkpoint is creating one full app that includes auth, CRUD, and deployment, since that mirrors real-world hiring expectations.\nWant me to suggest 3 project ideas based on your current skill level?";
  }

  return "A good way to choose your next skill is to align three things: your career goal, your weekly time availability, and one measurable outcome (project, certification, or job-ready milestone).\nStart with one core skill for 4-6 weeks, then layer one complementary skill to increase employability without context switching too much.\nIf you share your goal and available hours per week, I can create a personalized learning path.";
}

async function queryAnthropic(message) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.anthropicApiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: env.anthropicModel,
      max_tokens: 1000,
      system: ADVISOR_SYSTEM_PROMPT,
      messages: [{ role: "user", content: message }]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic request failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  const text = Array.isArray(data.content)
    ? data.content
        .filter((part) => part && part.type === "text" && typeof part.text === "string")
        .map((part) => part.text)
        .join("\n")
        .trim()
    : "";

  if (!text) {
    throw new Error("Anthropic returned an empty response.");
  }

  return text;
}

async function queryGemini(message) {
  const model = await resolveGeminiModel();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${env.geminiApiKey}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: ADVISOR_SYSTEM_PROMPT }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: message }]
        }
      ],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 1000
      }
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  const text = Array.isArray(data?.candidates)
    ? data.candidates
        .map((candidate) => candidate?.content?.parts || [])
        .flat()
        .filter((part) => part && typeof part.text === "string")
        .map((part) => part.text)
        .join("\n")
        .trim()
    : "";

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return text;
}

function cleanModelName(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  return raw.startsWith("models/") ? raw.slice("models/".length) : raw;
}

async function resolveGeminiModel() {
  if (cachedGeminiModel) {
    return cachedGeminiModel;
  }

  const preferred = cleanModelName(env.geminiModel);
  const candidates = await listGeminiModels();
  const available = new Set(candidates.map(cleanModelName).filter(Boolean));

  if (preferred && available.has(preferred)) {
    cachedGeminiModel = preferred;
    return cachedGeminiModel;
  }

  const priority = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro"
  ];

  for (const model of priority) {
    if (available.has(model)) {
      cachedGeminiModel = model;
      return cachedGeminiModel;
    }
  }

  const first = candidates.find(Boolean);
  if (first) {
    cachedGeminiModel = cleanModelName(first);
    return cachedGeminiModel;
  }

  // If list API fails or returns empty, try configured model as-is.
  cachedGeminiModel = preferred || "gemini-1.5-flash";
  return cachedGeminiModel;
}

async function listGeminiModels() {
  if (!env.geminiApiKey) return [];

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${env.geminiApiKey}`;
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { "content-type": "application/json" }
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const models = Array.isArray(data?.models) ? data.models : [];
    return models
      .filter((model) => Array.isArray(model?.supportedGenerationMethods) && model.supportedGenerationMethods.includes("generateContent"))
      .map((model) => cleanModelName(model?.name))
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function getChatReply(message) {
  if (!message || typeof message !== "string") {
    return "Share your goal and weekly time commitment, and I will help you plan your next skill step.";
  }

  const providerOrder =
    env.aiProvider === "gemini"
      ? ["gemini", "anthropic"]
      : env.aiProvider === "anthropic"
        ? ["anthropic", "gemini"]
        : ["gemini", "anthropic"];

  for (const provider of providerOrder) {
    try {
      if (provider === "gemini" && env.geminiApiKey) {
        try {
          return await queryGemini(message);
        } catch (error) {
          // If chosen model is invalid, clear cache and retry once with discovered models.
          if (String(error.message || "").includes("404")) {
            cachedGeminiModel = "";
            return await queryGemini(message);
          }
          throw error;
        }
      }
      if (provider === "anthropic" && env.anthropicApiKey) {
        return await queryAnthropic(message);
      }
    } catch (error) {
      console.error(`Chat provider ${provider} failed, trying fallback.`, error.message);
    }
  }

  return buildFallbackReply(message);
}
