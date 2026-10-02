import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../auth";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization; // expect "Bearer <token>"
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "missing token" });
  }

  const userId = verifyToken(token);
  if (!userId) {
    return res.status(401).json({ error: "invalid token" });
  }

  (req as any).userId = userId;
  next();
}
