import { verifyToken } from "../services/auth.service.js";

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      throw httpError("Authorization token is required.", 401);
    }

    const claims = verifyToken(token);
    req.auth = {
      userId: String(claims.sub || ""),
      email: String(claims.email || "").toLowerCase()
    };
    return next();
  } catch (error) {
    return next(error);
  }
}
