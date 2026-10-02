import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

function getSecret(): string {
  const secret: string | undefined = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET not found");
  return secret;
}

export function hashPassword(password: string): Promise<String> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(
  password: string,
  hashed: string,
): Promise<boolean> {
  return bcrypt.compare(password, hashed);
}

export function createToken(userId: number): string {
  return jwt.sign({ userId }, getSecret(), { expiresIn: "7d" });
}

export function verifyToken(token: string): number | null {
  try {
    const payload = jwt.verify(token, getSecret()) as { userId: number };
    return payload.userId;
  } catch {
    return null;
  }
}
