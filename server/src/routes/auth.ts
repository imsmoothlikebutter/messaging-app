import { Router } from "express";
import { pool } from "../db";
import { hashPassword, verifyPassword, createToken } from "../auth";

const router = Router();

router.post("/register", async (req, res) => {
  console.log("/register");
  const { username, password } = req.body ?? {};
  console.log(username, password);
  if (!username || !password) {
    return res.status(400).json({ error: "Username/Password required" });
  }

  try {
    const passwordHash = await hashPassword(password);
    const result = await pool.query(
      `INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING user_id`,
      [username, passwordHash],
    );
    const userId = result.rows[0].user_id;
    res.json({ userId, token: createToken(userId) });
  } catch (err: any) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "username taken" });
    }
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  console.log("Login attempt:", { username, password });

  const result = await pool.query(
    `SELECT user_id, password_hash FROM users WHERE username = $1`,
    [username],
  );
  const user = result.rows[0];
  console.log("DB lookup result:", user);

  if (!user) {
    console.log("No user found for username:", username);
    return res.status(401).json({ error: "invalid_credentials" });
  }

  const passwordMatches = await verifyPassword(
    password ?? "",
    user.password_hash,
  );
  console.log("Password comparison result:", passwordMatches);

  if (!passwordMatches) {
    return res.status(401).json({ error: "invalid_credentials" });
  }

  res.json({ userId: user.user_id, token: createToken(user.user_id) });
});

export default router;
