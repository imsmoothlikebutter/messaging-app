import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "./middleware";

const router = Router();

router.get("/:conversationId", requireAuth, async (req, res) => {
  const { conversationId } = req.params;
  const result = await pool.query(
    `SELECT message_id, conversation_id, sender_id, message_content, created_at
     FROM messages WHERE conversation_id = $1
     ORDER BY message_id ASC LIMIT 100`,
    [conversationId],
  );
  res.json(result.rows);
});

export default router;
