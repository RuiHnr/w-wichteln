-- Migration number: 0005
-- Assignments made by the draw (#6): one row per giver. Each participant gives once and
-- receives once, never to themselves. The API only ever reads the caller's own row (ADR 0003).

CREATE TABLE assignments (
  giver_id TEXT PRIMARY KEY REFERENCES participants (id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL UNIQUE REFERENCES participants (id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (giver_id != recipient_id)
);

CREATE INDEX assignments_group ON assignments (group_id);
