-- Migration number: 0004
-- Exclusions between two participants of a group (#5). An exclusion works in both
-- directions, so each pair is stored once, with the smaller participant id first.
-- Removing a participant removes their exclusions.

CREATE TABLE exclusions (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  participant_a TEXT NOT NULL REFERENCES participants (id) ON DELETE CASCADE,
  participant_b TEXT NOT NULL REFERENCES participants (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (participant_a < participant_b),
  UNIQUE (participant_a, participant_b)
);

CREATE INDEX exclusions_group ON exclusions (group_id);
CREATE INDEX exclusions_participant_b ON exclusions (participant_b);
