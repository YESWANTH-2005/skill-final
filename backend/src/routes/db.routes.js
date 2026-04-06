import { Router } from "express";
import { getDbStatus } from "../controllers/db.controller.js";

const dbRouter = Router();

dbRouter.get("/status", getDbStatus);

export default dbRouter;
