-- Row Level Security: public read of reference data, writes for staff only.
-- Seller listings, raw import rows and review notes are staff-only (seller names are never public).

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role is not null)
$$;

do $$
declare t text;
begin
  -- public-read reference tables
  foreach t in array array['countries','sources','brands','brand_agents','brand_agent_sources','category_map',
                           'products','product_variants','formula_versions','ingredients','ingredient_synonyms',
                           'variant_ingredients','evidence','evidence_sources','regulatory_alerts','alert_items',
                           'reference_images'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select to anon, authenticated using (true)', t || '_read', t);
    execute format('create policy %I on %I for all to authenticated using (is_staff()) with check (is_staff())', t || '_staff_write', t);
  end loop;

  -- staff-only tables
  foreach t in array array['import_batches','raw_import_rows','source_aliases','listing_sources','product_review_status'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for all to authenticated using (is_staff()) with check (is_staff())', t || '_staff_all', t);
  end loop;
end $$;

alter table method_versions enable row level security;
create policy method_versions_read on method_versions for select to anon, authenticated using (status in ('published','retired'));
create policy method_versions_staff on method_versions for all to authenticated using (is_staff()) with check (is_staff());

alter table profiles enable row level security;
create policy profiles_self on profiles for select to authenticated using (id = auth.uid() or is_staff());
-- roles are granted only by service_role (no insert/update policy for users)

alter table scans enable row level security;
create policy scans_owner on scans for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy scans_staff_read on scans for select to authenticated using (is_staff());

alter table scan_signals enable row level security;
create policy scan_signals_owner on scan_signals for all to authenticated
  using (exists (select 1 from scans s where s.id = scan_id and s.user_id = auth.uid()))
  with check (exists (select 1 from scans s where s.id = scan_id and s.user_id = auth.uid()));
create policy scan_signals_staff_read on scan_signals for select to authenticated using (is_staff());

alter table reports enable row level security;
create policy reports_owner_insert on reports for insert to authenticated with check (user_id = auth.uid());
create policy reports_owner_read on reports for select to authenticated using (user_id = auth.uid());
create policy reports_staff on reports for all to authenticated using (is_staff()) with check (is_staff());

grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
