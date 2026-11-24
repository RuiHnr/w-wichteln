-- Migration number: 0003
-- Participant names are unique within a group regardless of (ASCII) case (#3).
-- The join query checks this first; this index settles two joins racing with "Max" and "max".

CREATE UNIQUE INDEX participants_group_name_nocase ON participants (group_id, name COLLATE NOCASE);
