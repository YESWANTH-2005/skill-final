import { login, signup } from "../services/auth.service.js";

export async function postSignup(req, res, next) {
  try {
    const auth = await signup(req.body || {});
    return res.status(201).json(auth);
  } catch (error) {
    return next(error);
  }
}

export async function postLogin(req, res, next) {
  try {
    const auth = await login(req.body || {});
    return res.status(200).json(auth);
  } catch (error) {
    return next(error);
  }
}
