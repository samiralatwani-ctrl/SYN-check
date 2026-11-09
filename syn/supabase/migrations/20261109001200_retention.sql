-- Phase 7: retention promised in the privacy policy (docs/store/privacy-*.md), enforced daily.
--   label_extraction_log: 30 days (only needed for the daily limit and cost control)
--   scans + reports (stored only when the user sends a report): 24 months, or earlier via delete_my_data()
create or replace function public.purge_expired_data()
returns jsonb language plpgsql security definer set search_path = public as $$
declare n_logs int; n_reports int; n_scans int;
begin
  delete from label_extraction_log where created_at < now() - interval '30 days';
  get diagnostics n_logs = row_count;
  delete from reports where created_at < now() - interval '24 months';
  get diagnostics n_reports = row_count;
  delete from scans s where s.created_at < now() - interval '24 months'
    and not exists (select 1 from reports r where r.scan_id = s.id);
  get diagnostics n_scans = row_count;
  return jsonb_build_object('usage_log', n_logs, 'reports', n_reports, 'scans', n_scans);
end $$;
revoke all on function public.purge_expired_data() from public, anon, authenticated;

-- Daily at 00:15 UTC where pg_cron exists (Supabase). Local test databases skip this.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    perform cron.schedule('syn-purge-expired-data', '15 0 * * *', 'select public.purge_expired_data()');
  end if;
end $$;
