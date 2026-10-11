-- Audit targets include non-UUID singleton keys (e.g. app_settings.id =
-- 'global'). The uuid column rejects those with "invalid input syntax
-- for type uuid: 'global'". Widen to text — UUIDs cast cleanly, every
-- existing row keeps its value, and the (entity_type, entity_id) index
-- is rebuilt automatically.

ALTER TABLE "audit_events"
  ALTER COLUMN "entity_id" TYPE text USING "entity_id"::text;
