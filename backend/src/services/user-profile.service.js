import mongoose from "mongoose";
import UserProfile from "../models/user-profile.model.js";

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function ensureConnected() {
  if (mongoose.connection.readyState !== 1) {
    throw httpError("Database not connected. Configure MongoDB Atlas and retry.", 503);
  }
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function sanitizeArrayNumbers(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => !Number.isNaN(item));
}

function sanitizeEnrolledCourses(value, legacyIds) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        const id = Number.parseInt(item?.id, 10);
        if (Number.isNaN(id)) {
          return null;
        }

        const progress = Number.isFinite(Number(item?.progress))
          ? Math.max(0, Math.min(100, Number(item.progress)))
          : 0;
        const enrolledAt = String(item?.enrolledAt || "").trim() || new Date().toLocaleString();

        return { id, progress, enrolledAt };
      })
      .filter(Boolean);
  }

  return sanitizeArrayNumbers(legacyIds).map((id) => ({
    id,
    progress: 0,
    enrolledAt: new Date().toLocaleString()
  }));
}

function sanitizeActivity(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item) => item && typeof item.text === "string")
    .map((item) => ({
      text: String(item.text).trim(),
      time: String(item.time || new Date().toLocaleString()).trim()
    }))
    .slice(-200);
}

function sanitizeRecommendationHistory(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => item && Array.isArray(item.recommendations))
    .map((item) => ({
      createdAt: String(item.createdAt || new Date().toLocaleString()).trim(),
      summary: String(item.summary || "AI recommendation run").trim(),
      recommendations: item.recommendations
        .map((rec) => {
          const id = Number.parseInt(rec?.id, 10);
          if (Number.isNaN(id)) return null;
          return {
            id,
            title: String(rec?.title || "").trim(),
            match: Number.isFinite(Number(rec?.match)) ? Math.max(0, Math.min(100, Number(rec.match))) : 0
          };
        })
        .filter(Boolean)
        .slice(0, 6)
    }))
    .slice(-20);
}

function toPublicProfile(doc) {
  if (!doc) {
    return null;
  }

  return {
    email: doc.email,
    name: doc.name,
    quizAnswers: doc.quizAnswers || {},
    savedSkills: doc.savedSkills || [],
    enrolledCourses: doc.enrolledCourses || [],
    activityLog: doc.activityLog || [],
    recommendationHistory: doc.recommendationHistory || [],
    updatedAt: doc.updatedAt || null
  };
}

export async function upsertProfile(input) {
  ensureConnected();

  const email = normalizeEmail(input.email);
  if (!email) {
    throw httpError("email is required.", 400);
  }

  const update = {
    email,
    name: typeof input.name === "string" ? input.name.trim() : "",
    quizAnswers: input.quizAnswers && typeof input.quizAnswers === "object" ? input.quizAnswers : {},
    savedSkills: sanitizeArrayNumbers(input.savedSkills),
    enrolledCourses: sanitizeEnrolledCourses(input.enrolledCourses, input.enrolledCourseIds),
    activityLog: sanitizeActivity(input.activityLog),
    recommendationHistory: sanitizeRecommendationHistory(input.recommendationHistory)
  };

  const doc = await UserProfile.findOneAndUpdate({ email }, update, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true
  });

  return toPublicProfile(doc);
}

export async function getProfileByEmail(emailInput) {
  ensureConnected();

  const email = normalizeEmail(emailInput);
  if (!email) {
    throw httpError("email is required.", 400);
  }

  const doc = await UserProfile.findOne({ email });
  if (!doc) {
    return null;
  }

  return toPublicProfile(doc);
}

export async function upsertProfileForUser(emailInput, input) {
  return upsertProfile({ ...(input || {}), email: normalizeEmail(emailInput) });
}
