import { useEffect, useRef, useState } from "react";
import type { ChatMessage, ServerToClientMessage } from "./types";
import { WsClient } from "./wsClient";

const API_BASE = "http://localhost:4000";
const WS_URL = "ws://localhost:4000/ws";

interface PendingMessage extends ChatMessage {
  pending?: boolean;
}

export default function App() {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem("token"),
  );
  const [userId, setUserId] = useState<number | null>(
    Number(localStorage.getItem("userId")) || null,
  );
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [otherUserId, setOtherUserId] = useState("");
  const [messages, setMessages] = useState<PendingMessage[]>([]);
  const [draft, setDraft] = useState("");
  const wsRef = useRef<WsClient | null>(null);

  useEffect(() => {
    if (!token) return;
    const client = new WsClient(WS_URL, token);
    client.onMessage(handleServerMessage);
    client.connect();
    wsRef.current = client;
    return () => client.close();
  }, [token]);

  function handleServerMessage(msg: ServerToClientMessage) {
    if (msg.type === "ack") {
      setMessages((prev) =>
        prev.map((m) =>
          String(m.messageId) === msg.clientTempId
            ? {
                ...m,
                messageId: msg.messageId,
                createdAt: msg.createdAt,
                pending: false,
              }
            : m,
        ),
      );
    } else if (msg.type === "message") {
      setMessages((prev) => [...prev, msg.message]);
    } else if (msg.type === "sync_result") {
      setMessages((prev) => [...prev, ...msg.messages]);
    }
  }

  function handleAuthSuccess(token: string, userId: number) {
    localStorage.setItem("token", token);
    localStorage.setItem("userId", String(userId));
    setToken(token);
    setUserId(userId);
  }

  function LoginForm({
    onAuth,
  }: {
    onAuth: (token: string, userId: number) => void;
  }) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);

    async function submit(mode: "login" | "register") {
      setError(null);
      const res = await fetch(`${API_BASE}/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.token) {
        onAuth(data.token, data.userId);
      } else {
        setError(data.error ?? "unknown_error");
      }
    }

    return (
      <div style={{ padding: 24, maxWidth: 320 }}>
        <h3>Login / Register</h3>
        <input
          placeholder="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{ display: "block", marginBottom: 8, width: "100%" }}
        />
        <input
          placeholder="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ display: "block", marginBottom: 8, width: "100%" }}
        />
        <button onClick={() => submit("login")}>Login</button>
        <button onClick={() => submit("register")} style={{ marginLeft: 8 }}>
          Register
        </button>
        {error && <p style={{ color: "red" }}>{error}</p>}
      </div>
    );
  }
  async function startConversation() {
    const res = await fetch(`${API_BASE}/api/conversations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ otherUserId: Number(otherUserId) }),
    });
    const data = await res.json();
    setConversationId(data.conversationId);
    setMessages([]);
    //currently fetching every message in conversation. okay right now because number of messages is still small
    //will be an issue for high volume conversations.
    //will have to save the prev latest message id into state and pass that in
    wsRef.current?.send({
      type: "sync",
      conversationId: data.conversationId,
      sinceId: 0,
    });
  }

  function sendMessage() {
    if (!conversationId || !draft.trim()) return;
    // clientTempId is generated locally so the (pending) message
    // rendered immediately can later be matched against the server's ack
    // and reconciled with the real messageId -- text alone isn't a safe
    // match key since duplicate message content is common.
    const clientTempId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      {
        messageId: clientTempId as unknown as number,
        conversationId,
        senderId: userId!,
        body: draft,
        createdAt: new Date().toISOString(),
        pending: true,
      },
    ]);
    wsRef.current?.send({
      type: "message",
      conversationId,
      clientTempId,
      body: draft,
    });
    setDraft("");
  }

  if (!token) {
    return <LoginForm onAuth={handleAuthSuccess} />;
  }

  return (
    <div style={{ padding: 24, maxWidth: 480 }}>
      <p>Logged in as user #{userId}</p>
      <input
        placeholder="other user id"
        value={otherUserId}
        onChange={(e) => setOtherUserId(e.target.value)}
      />
      <button onClick={startConversation}>Start conversation</button>

      {conversationId && (
        <>
          <div
            style={{
              border: "1px solid #ccc",
              height: 300,
              overflowY: "auto",
              margin: "12px 0",
              padding: 8,
            }}
          >
            {messages.map((m) => (
              <div
                key={String(m.messageId)}
                style={{ opacity: m.pending ? 0.5 : 1 }}
              >
                <b>{m.senderId === userId ? "me" : m.senderId}:</b> {m.body}
              </div>
            ))}
          </div>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          />
          <button onClick={sendMessage}>Send</button>
        </>
      )}
    </div>
  );
}
