import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import UserAuth from "../models/user-auth.model.js";

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

function sanitizeName(name) {
  return String(name || "").trim();
}

function ensureJwtConfigured() {
  if (!env.jwtSecret || env.jwtSecret.length < 16) {
    throw httpError("JWT_SECRET must be set to a strong secret.", 500);
  }
}

function signToken(payload) {
  ensureJwtConfigured();
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiry });
}

function toAuthResponse(userDoc) {
  const token = signToken({
    sub: String(userDoc._id),
    email: userDoc.email
  });

  return {
    token,
    user: {
      email: userDoc.email,
      name: userDoc.name || ""
    }
  };
}

export async function signup({ name, email, password }) {
  ensureConnected();

  const normalizedEmail = normalizeEmail(email);
  const cleanedName = sanitizeName(name);
  const rawPassword = String(password || "");

  if (!cleanedName) throw httpError("name is required.", 400);
  if (!normalizedEmail) throw httpError("email is required.", 400);
  if (rawPassword.length < 8) throw httpError("password must be at least 8 characters.", 400);

  const existing = await UserAuth.findOne({ email: normalizedEmail });
  if (existing) {
    throw httpError("An account with this email already exists.", 409);
  }

  const passwordHash = await bcrypt.hash(rawPassword, 12);
  const created = await UserAuth.create({
    email: normalizedEmail,
    name: cleanedName,
    passwordHash
  });

  return toAuthResponse(created);
}

export async function login({ email, password }) {
  ensureConnected();

  const normalizedEmail = normalizeEmail(email);
  const rawPassword = String(password || "");
  if (!normalizedEmail || !rawPassword) {
    throw httpError("email and password are required.", 400);
  }

  const user = await UserAuth.findOne({ email: normalizedEmail });
  if (!user) {
    throw httpError("Invalid email or password.", 401);
  }

  const ok = await bcrypt.compare(rawPassword, user.passwordHash);
  if (!ok) {
    throw httpError("Invalid email or password.", 401);
  }

  return toAuthResponse(user);
}

export function verifyToken(token) {
  ensureJwtConfigured();
  try {
    return jwt.verify(token, env.jwtSecret);
  } catch {
    throw httpError("Invalid or expired token.", 401);
  }
}
