-- Phase 7: in-app deletion of everything stored for the current user (App Store 5.1.1(v), Google Play user data policy).
-- Anonymous users included. Reference data is never touched.
create or replace function public.delete_my_data()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n_reports int; n_scans int; n_logs int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  delete from reports where user_id = uid or scan_id in (select id from scans where user_id = uid);
  get diagnostics n_reports = row_count;
  delete from scans where user_id = uid;            -- scan_signals cascade
  get diagnostics n_scans = row_count;
  delete from label_extraction_log where user_id = uid;
  get diagnostics n_logs = row_count;
  return jsonb_build_object('reports', n_reports, 'scans', n_scans, 'usage_log', n_logs);
end $$;
revoke all on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;
