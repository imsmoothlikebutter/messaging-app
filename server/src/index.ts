import dotenv from "dotenv";
import express from "express";
import { pool } from "./db";
import http from "http";
import authRouter from "./routes/auth";
import { WebSocketServer, WebSocket, RawData } from "ws";
import { verifyToken } from "./auth";
import conversationsRouter from "./routes/conversations";
import messagesRouter from "./routes/messages";
import cors from "cors";

dotenv.config();

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }));
app.use(express.json());
app.use("/api/auth", authRouter);
app.use("/api/conversations", conversationsRouter);
app.use("/api/messages", messagesRouter);

const server = http.createServer(app);

const wss: WebSocketServer = new WebSocketServer({ server, path: "/ws" });

// Map of userId and Set of Websockets
// allow multi tab for each user, doesn't overwrite the previous websocket connection whenever a new tab is created.
const registry = new Map<number, Set<WebSocket>>();

function addConnection(userId: number, socket: WebSocket) {
  if (!registry.has(userId)) {
    console.log(`userId ${userId} new connection`);
    registry.set(userId, new Set());
  }
  const sockets = registry.get(userId);

  if (sockets) {
    console.log(`userId ${userId} added connection`);
    sockets.add(socket);
  }
}

function removeConnection(userId: number, socket: WebSocket) {
  const sockets = registry.get(userId);
  if (sockets) {
    console.log(`userId ${userId} removed connection`);
    sockets.delete(socket);
    if (sockets.size === 0) {
      registry.delete(userId);
    }
  } else {
    return;
  }
}

wss.on("connection", (socket: WebSocket) => {
  //everytime a client connects
  // Each connection gets its own local userId, starting unauthenticated.
  // Raw WebSocket carries no identity on connect -- the first message
  // on the socket must be an explicit auth handshake before anything
  // else is trusted from it.

  let userId: number | null = null;

  socket.on("message", async (data: RawData) => {
    //everytime a message is received
    console.log("received:", data.toString());
    let msg: any;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      socket.send(JSON.stringify({ type: "error", reason: "invalid json" }));
      return;
    }

    // Anything other than "auth" is rejected until the handshake succeeds
    if (msg.type === "auth") {
      const verifiedUserId = verifyToken(msg.token);
      if (!verifiedUserId) {
        socket.send(JSON.stringify({ type: "auth error" }));
        socket.close();
        return;
      }
      userId = verifiedUserId;
      addConnection(userId, socket);
      socket.send(JSON.stringify({ type: "auth ok", userId }));
      return;
    }

    if (!userId) {
      socket.send(
        JSON.stringify({ type: "error", reason: "not authenticated" }),
      );
      return;
    }

    console.log(`Message from user ${userId}:`, msg);
    if (msg.type === "message") {
      const { conversationId, clientTempId, body } = msg;

      const convResult = await pool.query(
        `SELECT user_a_id, user_b_id FROM conversations WHERE conversation_id = $1`,
        [conversationId],
      );
      const conv = convResult.rows[0];
      // Verify the sender is actually a participant
      //otherwise, other users can hijack conversation by guessing conversation id
      if (!conv || (conv.user_a_id !== userId && conv.user_b_id !== userId)) {
        socket.send(
          JSON.stringify({ type: "error", reason: "not a participant" }),
        );
        return;
      }

      // message_id as source of truth. probably can use server generated changeToken later
      const insertResult = await pool.query(
        `INSERT INTO messages (conversation_id, sender_id, message_content)
                VALUES ($1, $2, $3)
                RETURNING message_id, created_at`,
        [conversationId, userId, body],
      );
      const { message_id, created_at } = insertResult.rows[0];

      // Ack the sender first, independent of whether the recipient is online,
      // so their UI can flip "sending" -> "sent" immediately.
      socket.send(
        JSON.stringify({
          type: "ack",
          clientTempId,
          messageId: message_id,
          createdAt: created_at,
        }),
      );

      const payload = {
        type: "message",
        message: {
          messageId: message_id,
          conversationId,
          senderId: userId,
          body,
          createdAt: created_at,
        },
      };

      // Push to every open socket the recipient has 
      const recipientId =
        conv.user_a_id === userId ? conv.user_b_id : conv.user_a_id;
      const recipientSockets = registry.get(recipientId);
      if (recipientSockets) {
        for (const s of recipientSockets) {
          if (s.readyState === WebSocket.OPEN) s.send(JSON.stringify(payload));
        }
      }
      return;
    }

    if (msg.type === "sync") {
      // Reconnect path: client sends the last message_id it already has,
      // server returns everything newer for that conversation.
      const result = await pool.query(
        `SELECT message_id, conversation_id, sender_id, message_content, created_at
                FROM messages
                WHERE conversation_id = $1 AND message_id > $2
                ORDER BY message_id ASC
                LIMIT 500`,
        [msg.conversationId, msg.sinceId ?? 0],
      );
      socket.send(
        JSON.stringify({
          type: "sync_result",
          conversationId: msg.conversationId,
          messages: result.rows.map((r) => ({
            messageId: r.message_id,
            conversationId: r.conversation_id,
            senderId: r.sender_id,
            body: r.message_content,
            createdAt: r.created_at,
          })),
        }),
      );
      return;
    }
  });

  socket.on("close", () => {
    if (userId) removeConnection(userId, socket);
  });
});

const PORT = process.env.PORT;
server.listen(PORT, () => {
  console.log(`Server is listening on :${PORT}`);
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/db-test", async (_req, res) => {
  const result = await pool.query("SELECT NOW()");
  res.json(result.rows[0]);
});
