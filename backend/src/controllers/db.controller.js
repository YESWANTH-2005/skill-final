import { getDatabaseStatus } from "../config/db.js";

export function getDbStatus(_req, res) {
  return res.json({ database: getDatabaseStatus() });
}
