-- Migration number: 0012
-- Link Renewal (#33, ADR 0004): the latest renewal of each participant's Personal Link, shown to
-- everyone in the group. The renewer's name and id are copied, not referenced, so the trace stays
-- after they are removed; the id tells the renewer apart from someone who later joins under that name.

ALTER TABLE participants ADD COLUMN link_renewed_by TEXT;
ALTER TABLE participants ADD COLUMN link_renewed_by_id TEXT;
ALTER TABLE participants ADD COLUMN link_renewed_at TEXT;
