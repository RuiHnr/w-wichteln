-- Migration number: 0011
-- Automatic cleanup of expired groups (#12): the lazy cleanup looks for groups whose
-- exchange date is older than the retention period on ordinary requests, so it needs an index.

CREATE INDEX groups_exchange_date ON groups (exchange_date);
