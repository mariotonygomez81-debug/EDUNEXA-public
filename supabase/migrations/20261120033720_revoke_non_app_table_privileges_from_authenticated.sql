-- Authenticated clients never need schema-management or bulk-table privileges.
-- RLS continues to decide row-level access; this removes privileges that RLS does not govern.
REVOKE TRUNCATE, REFERENCES, TRIGGER
ON ALL TABLES IN SCHEMA public
FROM authenticated;
