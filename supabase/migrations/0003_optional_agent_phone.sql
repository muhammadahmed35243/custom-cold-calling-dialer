-- An agent's phone number is only needed for phone-bridge calling (it's the
-- number that rings first). Browser calling works without one, so the column
-- can be empty.
--
-- Run this in the Supabase SQL editor. Safe to run even if already nullable.

alter table agents alter column phone_number drop not null;
