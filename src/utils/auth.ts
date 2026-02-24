import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export async function hashPassword(password: string): Promise<string> {
  // 10 salt rounds is a solid baseline
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function signAccessToken(payload: { userId: string; role: string }): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: "2h" });
}