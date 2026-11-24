-- Migration number: 0014
-- Group Pictures and Participant Pictures (#34, ADR 0005) are stored in D1 itself. A picture
-- belongs to its group and goes with it (Expiry, Group Deletion). `picture_key` on groups and
-- participants (0013) points at the current one. Additive, so it can run before the code that
-- uses it is deployed.

CREATE TABLE pictures (
  key TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  content_type TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX pictures_group_id ON pictures (group_id);
