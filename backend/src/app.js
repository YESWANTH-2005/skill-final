import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getDatabaseStatus } from "./config/db.js";
import { env } from "./config/env.js";
import { aiLimiter, authLimiter, profileLimiter } from "./middleware/rate-limit.middleware.js";
import aiRouter from "./routes/ai.routes.js";
import authRouter from "./routes/auth.routes.js";
import dbRouter from "./routes/db.routes.js";
import userProfileRouter from "./routes/user-profile.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const frontendDir = resolve(__dirname, "../../frontend");
const frontendFile = resolve(__dirname, "../../frontend/skill-recommendation-system.html");
const corsOrigins = env.corsOrigin.split(",").map((origin) => origin.trim());
const defaultLocalOrigins = new Set([
  "http://localhost:4000",
  "http://127.0.0.1:4000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:5173",
  "http://127.0.0.1:5173"
]);

const app = express();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (corsOrigins.includes("*")) {
        callback(null, true);
        return;
      }
      const allowed = new Set([...corsOrigins, ...defaultLocalOrigins]);
      if (allowed.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed by CORS"));
    },
    credentials: false
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.static(frontendDir));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "skill-recommendation-system-backend",
    database: getDatabaseStatus()
  });
});

app.use("/api/auth", authLimiter, authRouter);
app.use("/api/ai", aiLimiter, aiRouter);
app.use("/api/db", dbRouter);
app.use("/api/users", profileLimiter, userProfileRouter);

app.get("/", (_req, res) => {
  if (existsSync(frontendFile)) {
    return res.sendFile(frontendFile);
  }
  return res.status(404).send("Frontend file not found. Expected frontend/skill-recommendation-system.html in project root.");
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found." });
});

app.use((error, _req, res, _next) => {
  if (!error.statusCode || error.statusCode >= 500) {
    console.error(error);
  }
  res.status(error.statusCode || 500).json({ error: error.message || "Internal server error." });
});

export default app;

