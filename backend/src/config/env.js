import "dotenv/config";

function toPort(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: toPort(process.env.PORT, 4000),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:4000",
  aiProvider: (process.env.AI_PROVIDER || "auto").trim().toLowerCase(),
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-1.5-flash",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
  mongodbUri: process.env.MONGODB_URI || "",
  mongodbDbName: process.env.MONGODB_DB_NAME || "skill_recommendation_system",
  requireDatabase: toBoolean(process.env.REQUIRE_DATABASE, false),
  jwtSecret: process.env.JWT_SECRET || "",
  jwtExpiry: process.env.JWT_EXPIRY || "7d",
  rateLimitWindowMs: toPort(process.env.RATE_LIMIT_WINDOW_MS, 900000),
  rateLimitMaxAi: toPort(process.env.RATE_LIMIT_MAX_AI, 60),
  rateLimitMaxProfile: toPort(process.env.RATE_LIMIT_MAX_PROFILE, 120),
  rateLimitMaxAuth: toPort(process.env.RATE_LIMIT_MAX_AUTH, 30)
};
