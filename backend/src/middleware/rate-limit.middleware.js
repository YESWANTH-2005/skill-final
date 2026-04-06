import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

function buildLimiter(max, message) {
  return rateLimit({
    windowMs: env.rateLimitWindowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message }
  });
}

export const authLimiter = buildLimiter(env.rateLimitMaxAuth, "Too many auth requests. Please try again later.");
export const aiLimiter = buildLimiter(env.rateLimitMaxAi, "Too many AI requests. Please try again later.");
export const profileLimiter = buildLimiter(env.rateLimitMaxProfile, "Too many profile requests. Please try again later.");
