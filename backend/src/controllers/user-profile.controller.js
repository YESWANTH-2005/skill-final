import { getProfileByEmail, upsertProfileForUser } from "../services/user-profile.service.js";

export async function postUpsertProfile(req, res, next) {
  try {
    const profile = await upsertProfileForUser(req.auth?.email, req.body || {});
    return res.status(200).json({ profile });
  } catch (error) {
    return next(error);
  }
}

export async function getMyProfile(req, res, next) {
  try {
    const profile = await getProfileByEmail(req.auth?.email || "");
    if (!profile) {
      return res.status(404).json({ error: "Profile not found." });
    }
    return res.json({ profile });
  } catch (error) {
    return next(error);
  }
}
