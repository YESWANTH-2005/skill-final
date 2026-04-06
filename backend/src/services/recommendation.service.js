import { SKILLS_CATALOG } from "../data/skills.catalog.js";

function parseUpperSalaryLpa(salaryText) {
  if (!salaryText || typeof salaryText !== "string") {
    return 0;
  }
  const matches = salaryText.match(/\d+/g);
  if (!matches || matches.length === 0) {
    return 0;
  }
  return Number.parseInt(matches[matches.length - 1], 10) || 0;
}

function normalizeExperienceLevel(levelText) {
  const level = String(levelText || "").toLowerCase();
  if (level.includes("beginner") || level.includes("complete")) return "beginner";
  if (level.includes("advanced")) return "intermediate";
  if (level.includes("intermediate")) return "intermediate";
  if (level.includes("some")) return "beginner";
  return "";
}

function getCategoryHints(fieldValue) {
  const field = (fieldValue || "").toLowerCase();
  if (field.includes("tech") || field.includes("development")) return ["tech", "data"];
  if (field.includes("data") || field.includes("analytics")) return ["data", "tech"];
  if (field.includes("design") || field.includes("ux")) return ["design", "creative"];
  if (field.includes("marketing") || field.includes("growth")) return ["marketing", "creative"];
  if (field.includes("business") || field.includes("strategy")) return ["business", "data", "tech"];
  if (field.includes("finance")) return ["business", "data"];
  if (field.includes("content") || field.includes("writing")) return ["creative", "marketing"];

  return [field];
}

function scoreForTimePreference(durationWeeks, timePreference) {
  const text = (timePreference || "").toLowerCase();
  const isShort = durationWeeks <= 6;
  const isMedium = durationWeeks >= 7 && durationWeeks <= 12;
  const isLong = durationWeeks >= 13;

  if (text.includes("1-3") || text.includes("1–3") || text.includes("under") || text.includes("<")) {
    if (isShort) return 8;
    if (isMedium) return 3;
    return -3;
  }

  if (text.includes("4-8") || text.includes("4–8") || text.includes("5-10") || text.includes("5 to 10")) {
    if (isMedium) return 8;
    if (isShort || isLong) return 3;
    return 0;
  }

  if (text.includes("8-15") || text.includes("8–15") || text.includes("10+") || text.includes("more") || text.includes("full-time")) {
    if (isLong) return 8;
    if (isMedium) return 4;
    return 1;
  }

  return 0;
}

function scoreForGoal(skill, goalValue) {
  const goal = (goalValue || "").toLowerCase();

  if (!goal) return 0;

  if (goal.includes("switch") || goal.includes("new career")) {
    return skill.level === "beginner" ? 7 : 2;
  }

  if (goal.includes("promotion") || goal.includes("lead")) {
    return skill.level === "intermediate" ? 6 : 2;
  }

  if (goal.includes("salary") || goal.includes("pay") || goal.includes("money")) {
    const salaryTop = parseUpperSalaryLpa(skill.salary);
    if (salaryTop >= 30) return 8;
    if (salaryTop >= 20) return 6;
    if (salaryTop >= 14) return 4;
    return 2;
  }

  if (goal.includes("portfolio") || goal.includes("freelance")) {
    return skill.tags?.includes("Design") || skill.tags?.includes("Frontend") ? 6 : 2;
  }

  return 3;
}

function buildReason(skill, quizAnswers) {
  const field = quizAnswers.field || "career";
  const level = quizAnswers.level || skill.level || "current";
  const time = quizAnswers.time || "your schedule";

  return `${skill.title} matches your ${field} focus, fits your ${level} experience level, and aligns with ${time.toLowerCase()} commitment.`;
}

function buildSummary(quizAnswers, recommendations) {
  const goal = quizAnswers.goal || "career growth";
  const field = quizAnswers.field || "your chosen field";
  const level = quizAnswers.level || "current";
  const time = quizAnswers.time || "available";

  const topTitles = recommendations.slice(0, 2).map((item) => item.title).join(" and ");

  return `Based on your goal of ${goal}, these recommendations prioritize ${field} skills while staying aligned with your ${level} starting point. The path balances your ${time.toLowerCase()} schedule so you can build momentum quickly, starting with ${topTitles || "high-impact skills"}.`;
}

function clampMatch(value) {
  if (value < 60) return 60;
  if (value > 99) return 99;
  return Math.round(value);
}

export function buildRecommendationsPayload({ quizAnswers }) {
  const safeAnswers = quizAnswers && typeof quizAnswers === "object" ? quizAnswers : {};
  const preferredCategories = getCategoryHints(safeAnswers.field);
  const normalizedLevel = normalizeExperienceLevel(safeAnswers.level);

  const scored = SKILLS_CATALOG
    .filter((skill) => skill && typeof skill.id === "number")
    .map((skill) => {
      const base = typeof skill.match === "number" ? skill.match * 0.65 : 68;
      const categoryBonus = preferredCategories.some((category) =>
        Array.isArray(skill.categories) ? skill.categories.includes(category) : false
      )
        ? 14
        : 0;
      const levelBonus =
        normalizedLevel && skill.level === normalizedLevel
          ? 8
          : normalizedLevel
            ? -2
            : 0;
      const timeBonus = scoreForTimePreference(skill.durationWks || 0, safeAnswers.time);
      const goalBonus = scoreForGoal(skill, safeAnswers.goal);
      const isNewBonus = skill.isNew ? 2 : 0;

      const match = clampMatch(base + categoryBonus + levelBonus + timeBonus + goalBonus + isNewBonus);
      const reason = buildReason(skill, safeAnswers);

      return { ...skill, match, reason };
    })
    .sort((a, b) => b.match - a.match);

  const top = scored.slice(0, 6);
  const summary = buildSummary(safeAnswers, top);

  return {
    summary,
    recommendations: top.map((skill) => ({
      id: skill.id,
      match: skill.match,
      reason: skill.reason
    }))
  };
}
