-- Migration number: 0002
-- Groups and their participants (#2).

CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  invite_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  budget_cents INTEGER NOT NULL CHECK (budget_cents > 0),
  exchange_date TEXT NOT NULL, -- YYYY-MM-DD
  phase TEXT NOT NULL DEFAULT 'open' CHECK (phase IN ('open', 'drawn')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- A participant is identified by a random token (ADR 0002). Only its SHA-256
-- hash is stored, so a leaked database does not hand out Personal Links.
CREATE TABLE participants (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  is_organizer INTEGER NOT NULL DEFAULT 0 CHECK (is_organizer IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (group_id, name)
);
