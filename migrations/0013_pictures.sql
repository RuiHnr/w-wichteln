-- Migration number: 0013
-- Group Picture and Participant Picture (#34): the random key of the image in the R2 bucket, NULL
-- when there is none. Additive, so it can run before the code that uses it is deployed.

ALTER TABLE groups ADD COLUMN picture_key TEXT;
ALTER TABLE participants ADD COLUMN picture_key TEXT;
