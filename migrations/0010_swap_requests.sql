-- Migration number: 0010
-- Swap Requests (#10). A row is either an open request or a completed swap ('accepted');
-- a declined, withdrawn or expired request is deleted, so it counts for nothing. The swaps
-- a participant took part in are the accepted rows that name them, sender or receiver.
-- 'swapping' only exists inside the transaction that accepts a request.
-- The API never shows the recipients stored here (ADR 0003).

-- The Swap Limit: how many completed swaps each participant may take part in. Fixed at 1
-- for now; the organizer will be able to change it (#11).
ALTER TABLE groups ADD COLUMN swap_limit INTEGER NOT NULL DEFAULT 1 CHECK (swap_limit >= 0);

CREATE TABLE swap_requests (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES participants (id) ON DELETE CASCADE,
  receiver_id TEXT NOT NULL REFERENCES participants (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'swapping', 'accepted')),
  -- Both givers' recipients before the swap, recorded while it is carried out.
  sender_recipient_id TEXT,
  receiver_recipient_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (sender_id != receiver_id)
);

-- Each giver has at most one open outgoing request.
CREATE UNIQUE INDEX swap_requests_one_open_outgoing ON swap_requests (sender_id) WHERE status = 'open';
CREATE INDEX swap_requests_group ON swap_requests (group_id);
CREATE INDEX swap_requests_receiver ON swap_requests (receiver_id);
