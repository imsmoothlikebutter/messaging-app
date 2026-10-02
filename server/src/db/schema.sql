CREATE TABLE users (
  user_id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- user_a_id < user_b_id is enforced at the application layer (in
-- conversations.ts) so there can only be 1 conversation between a user pair
CREATE TABLE conversations (
  conversation_id SERIAL PRIMARY KEY,
  user_a_id INTEGER NOT NULL REFERENCES users(user_id),
  user_b_id INTEGER NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_a_id, user_b_id)
);


-- message_id : one way to have a source of truth for when messages come in to server
CREATE TABLE messages (
  message_id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(conversation_id),
  sender_id INTEGER NOT NULL REFERENCES users(user_id),
  message_content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);