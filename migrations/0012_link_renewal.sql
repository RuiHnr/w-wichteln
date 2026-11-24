-- Migration number: 0012
-- Link Renewal (#33, ADR 0004): the latest renewal of each participant's Personal Link, shown to
-- everyone in the group. The renewer's name is copied, so the trace stays after they are removed.

ALTER TABLE participants ADD COLUMN link_renewed_by TEXT;
ALTER TABLE participants ADD COLUMN link_renewed_at TEXT;
