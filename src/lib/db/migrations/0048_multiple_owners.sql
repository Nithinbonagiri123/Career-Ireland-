-- Session 33 — allow multiple business owners (co-founders / partners).
-- The former partial unique index enforced "exactly one owner";
-- replaced by a service-layer rule that always keeps >=1 owner alive.

DROP INDEX IF EXISTS "users_single_owner";
