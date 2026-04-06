import app from "./app.js";
import { closeDatabaseConnection, connectToDatabase } from "./config/db.js";
import { env } from "./config/env.js";

let server;

async function startServer() {
  await connectToDatabase();

  server = app.listen(env.port, () => {
    console.log(`Skill Recommendation System backend running at http://localhost:${env.port}`);
  });
}

async function shutdown(signal) {
  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await closeDatabaseConnection();
    console.log(`Server closed on ${signal}.`);
    process.exit(0);
  } catch (error) {
    console.error(`Shutdown failed on ${signal}.`, error);
    process.exit(1);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startServer().catch((error) => {
  console.error("Failed to start backend.", error);
  process.exit(1);
});
