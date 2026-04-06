import { Router } from "express";
import { postLogin, postSignup } from "../controllers/auth.controller.js";

const authRouter = Router();

authRouter.post("/signup", postSignup);
authRouter.post("/login", postLogin);

export default authRouter;
