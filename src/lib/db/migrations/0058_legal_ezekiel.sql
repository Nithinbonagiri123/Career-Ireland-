-- No-op — snapshot realignment only.
--
-- Migrations 0055–0057 were written by hand (with IF NOT EXISTS guards
-- and a notes→column backfill drizzle-kit cannot express) and have
-- already been applied everywhere. They updated _journal.json but not
-- drizzle's meta snapshots, so `drizzle-kit generate` kept re-emitting
-- their DDL. This migration carries the regenerated 0058_snapshot.json
-- that brings the snapshot chain back in sync with the TS schema; the
-- SQL itself intentionally does nothing.
SELECT 1;
