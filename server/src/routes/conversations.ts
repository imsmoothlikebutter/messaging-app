import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "./middleware";

const router = Router();

router.post("/", requireAuth, async (req, res) => {
  const userId = (req as any).userId as number;
  const { otherUserId } = req.body ?? {};

  if (!otherUserId) {
    return res.status(400).json({ error: "otherUserId required" });
  }

  if (otherUserId === userId) {
    return res.status(400).json({ error: "cannot message self" });
  }

  // Sort userId, by smaller first, so that there can only be 1 convo between 2 users
  const [a, b] = [userId, otherUserId].sort((x, y) => x - y);
  //currently there's no fetch/list api for conversations
  //so if there is a confilict on userId pairs, return existing conversation instead of error.
  
  const result = await pool.query(
    `INSERT INTO conversations (user_a_id, user_b_id)
     VALUES ($1, $2)
     ON CONFLICT (user_a_id, user_b_id) DO UPDATE SET user_a_id = EXCLUDED.user_a_id
     RETURNING conversation_id`,
    [a, b],
  );

  res.json({ conversationId: result.rows[0].conversation_id });
});

export default router;
