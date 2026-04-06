import { Router } from "express";
import { postChat, postRecommendations } from "../controllers/ai.controller.js";

const aiRouter = Router();

aiRouter.post("/recommendations", postRecommendations);
aiRouter.post("/chat", postChat);

export default aiRouter;
