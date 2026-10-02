export interface ChatMessage {
  messageId: number;
  conversationId: number;
  senderId: number;
  body: string;
  createdAt: string;
}

export type ClientToServerMessage =
  | { type: "auth"; token: string }
  | {
      type: "message";
      conversationId: number;
      clientTempId: string;
      body: string;
    }
  | { type: "sync"; conversationId: number; sinceId: number };

export type ServerToClientMessage =
  | { type: "auth_ok"; userId: number }
  | { type: "auth_error" }
  | { type: "ack"; clientTempId: string; messageId: number; createdAt: string }
  | { type: "message"; message: ChatMessage }
  | { type: "sync_result"; conversationId: number; messages: ChatMessage[] }
  | { type: "error"; reason: string };
