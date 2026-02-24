import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export type AuthUser = {
  userId: string;
  role: "ADMIN" | "MANAGER" | "TEAM_LEAD" | "MEMBER";
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing or invalid Authorization header" });
  }

  const token = header.slice("Bearer ".length);

  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthUser;
    req.auth = decoded;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

export function requireRoles(allowed: AuthUser["role"][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!allowed.includes(req.auth.role)) {
      return res.status(403).json({ message: "Forbidden: insufficient role" });
    }
    return next();
  };
}