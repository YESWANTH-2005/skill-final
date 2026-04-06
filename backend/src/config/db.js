import mongoose from "mongoose";
import { env } from "./env.js";

function stateName(state) {
  const states = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting"
  };

  return states[state] || "unknown";
}

export function getDatabaseStatus() {
  const readyState = mongoose.connection.readyState;
  return {
    enabled: Boolean(env.mongodbUri),
    connected: readyState === 1,
    state: stateName(readyState),
    dbName: mongoose.connection.name || env.mongodbDbName || null
  };
}

export async function connectToDatabase() {
  if (!env.mongodbUri) {
    console.warn("MongoDB is not configured. Set MONGODB_URI to enable Atlas/cloud persistence.");
    return;
  }

  try {
    await mongoose.connect(env.mongodbUri, {
      dbName: env.mongodbDbName || undefined,
      serverSelectionTimeoutMS: 10000
    });
    console.log(`MongoDB connected (${mongoose.connection.name}).`);
  } catch (error) {
    const status = getDatabaseStatus();
    console.error("MongoDB connection failed.", error.message);
    if (env.requireDatabase) {
      throw error;
    }
    console.warn(`Continuing without DB because REQUIRE_DATABASE=false (state: ${status.state}).`);
  }
}

export async function closeDatabaseConnection() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
}
