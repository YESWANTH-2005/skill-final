import { getChatReply } from "../services/chat.service.js";
import { buildRecommendationsPayload } from "../services/recommendation.service.js";

export async function postRecommendations(req, res, next) {
  try {
    const { quizAnswers } = req.body || {};
    if (!quizAnswers || typeof quizAnswers !== "object") {
      return res.status(400).json({ error: "quizAnswers is required." });
    }

    const payload = buildRecommendationsPayload({ quizAnswers });
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}

export async function postChat(req, res, next) {
  try {
    const { message } = req.body || {};
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "message is required." });
    }

    const reply = await getChatReply(message.trim());
    return res.json({ reply });
  } catch (error) {
    return next(error);
  }
}
