-- New Supabase projects no longer grant table privileges to service_role automatically.
-- The extract-label function uses service_role to enforce the per-user daily limit and to log usage.
grant select, insert on public.label_extraction_log to service_role;
grant usage on all sequences in schema public to service_role;

-- Hygiene: TRUNCATE ignores RLS, so public roles must never hold it.
revoke truncate on all tables in schema public from anon, authenticated;
revoke truncate on all tables in schema titck from anon, authenticated;
