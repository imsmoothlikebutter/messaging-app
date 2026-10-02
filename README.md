# 1:1 Real-Time Messaging MVP

Full-stack real-time 1:1 messaging app. Built for a take-home assessment
with a hard constraint: the core real-time delivery mechanism must be
hand-built on raw WebSockets (`ws`), not a framework like Socket.io that
implements messaging/rooms/broadcast for you.

## Run it

```bash
docker compose up --build
```

Open **two separate browser profiles** (e.g. one normal window + one
incognito, so `localStorage` sessions don't collide) at
`http://localhost:8080`. Register a different user in each, note both
user ids (shown after login), and use "start conversation" with the
other user's id in each window.

<img width="1438" height="819" alt="Screenshot 2026-10-02 at 10 19 51 AM" src="https://github.com/user-attachments/assets/1001a809-fc17-4996-b4e3-171ec3324917" />

<img width="718" height="810" alt="Screenshot 2026-10-02 at 10 21 58 AM" src="https://github.com/user-attachments/assets/fb56eb4b-2cb3-4088-8abc-ec933b67a14f" />

<img width="1080" height="608" alt="2026-10-02 10-20-42" src="https://github.com/user-attachments/assets/abde5616-a1fd-4dab-97ae-61002fdc46a2" />




## Architecture

- `server/` — Express (REST: auth, conversations, message history) +
  raw `ws` WebSocket server (live messaging), Postgres via `pg`.
- `client/` — React + TypeScript, native `WebSocket` API, no chat
  framework.
- Auth: bcrypt password hashing, JWT session tokens — same token used
  for REST (`Authorization: Bearer`) and as the first message over the
  WebSocket handshake.

### Core real-time design

- **Connection registry**: `Map<userId, Set<WebSocket>>` on the server,
  tracking every open socket per user (supports multiple tabs/devices).
- **Auth-first handshake**: a WebSocket carries no identity on connect.
  The first message on every socket must be `{type: "auth", token}`;
  nothing else is accepted until that succeeds.
- **Ordering**: message order is driven by the database's auto-increment
  `message_id`, not client timestamps, since client clocks can't be
  trusted under network jitter or clock skew.
- **Delivery**: on send, the server persists the message, acks the
  sender (flips UI from "sending" to "sent"), then pushes live to the
  recipient's open sockets if any exist. If the recipient is offline,
  the message is simply left persisted.
- **Optimistic UI**: the client renders a message immediately with a
  locally-generated `clientTempId`, then reconciles it with the real
  `messageId` once the server's ack arrives.

## Current known limitations
- **No read receipts** — sent/delivered only.
- **Reconnect-sync is simplified.** `sync` always requests from
  `sinceId: 0` (full history) rather than tracking the highest message
  id already held per conversation and requesting only the delta. It's
  also only called manually on opening a conversation, not wired into
  the WebSocket client's automatic reconnect path — so a message sent
  while a tab is disconnected won't appear until the conversation is
  reopened.
- **No duplicate-send protection server-side.** `clientTempId` exists
  specifically to support this (as an idempotency key) but the server
  doesn't currently check for/reject a resend of an already-processed
  message.
- **No offline message queueing on the client** — a send attempted
  while disconnected is dropped, not queued for retry on reconnect.
- **Schema applied via a single SQL file** mounted into Postgres's
  init directory, not a versioned migration tool — fine for one static
  schema, not for iterating on it over time.

## What I'd do next with more time

- Proper incremental reconnect-sync (track per-conversation high-water
  mark, wire into `WsClient`'s `onopen`).
- Read receipts, typing indicators.
- Client-side send queue for offline resilience.
- Rate limiting on the WS message handler.
