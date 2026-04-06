import { Router } from "express";
import { getMyProfile, postUpsertProfile } from "../controllers/user-profile.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const userProfileRouter = Router();

userProfileRouter.post("/profile", requireAuth, postUpsertProfile);
userProfileRouter.get("/profile/me", requireAuth, getMyProfile);

export default userProfileRouter;
