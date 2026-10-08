-- Web Push (PWA guide: "push notifications"): one row per browser that agreed to notifications.
CREATE TABLE push_subscriptions (
  endpoint     TEXT PRIMARY KEY CHECK (endpoint ~ '^https://'),
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id);
