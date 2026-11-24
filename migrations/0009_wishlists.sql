-- Migration number: 0009
-- Wishlists (#9): free text a participant writes, one row per participant who wrote one.
-- The API shows a wishlist only to its owner and to the owner's giver.

CREATE TABLE wishlists (
  participant_id TEXT PRIMARY KEY REFERENCES participants (id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
