import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";

test("GET /api/health returns service metadata", async () => {
  const response = await request(app).get("/api/health");
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(typeof response.body.service, "string");
});

test("POST /api/ai/recommendations returns recommendation list", async () => {
  const response = await request(app).post("/api/ai/recommendations").send({
    quizAnswers: {
      goal: "Career switch",
      field: "Data analytics",
      time: "4-8 hrs/week",
      level: "Beginner"
    }
  });

  assert.equal(response.status, 200);
  assert.equal(typeof response.body.summary, "string");
  assert.equal(Array.isArray(response.body.recommendations), true);
  assert.equal(response.body.recommendations.length > 0, true);
});

test("POST /api/ai/chat validates missing message", async () => {
  const response = await request(app).post("/api/ai/chat").send({});
  assert.equal(response.status, 400);
  assert.match(response.body.error, /message is required/i);
});

test("GET /api/users/profile/me requires auth token", async () => {
  const response = await request(app).get("/api/users/profile/me");
  assert.equal(response.status, 401);
});
