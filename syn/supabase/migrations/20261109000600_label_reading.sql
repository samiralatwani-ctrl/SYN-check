-- Phase 3: label reading support.

-- Reference for one product (when the label, not the barcode, identifies it).
create or replace function public.product_reference(p_external_ref text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'variants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'variant_id', v.id, 'product_id', p.id, 'external_ref', p.external_ref,
        'official_name', p.official_name, 'brand', b.name, 'market', v.market, 'gtin', v.gtin,
        'verification_status', least(p.verification_status, v.verification_status),
        'regulatory_class', coalesce(m.regulatory_class, 'unknown'), 'category', m.category,
        'package_text', v.package_text, 'concentration_text', v.concentration_text,
        'size_value', v.size_value, 'size_unit', v.size_unit,
        'concentration_value', v.concentration_value, 'concentration_unit', v.concentration_unit,
        'shelf_life_min_months', v.shelf_life_min_months, 'shelf_life_max_months', v.shelf_life_max_months,
        'batch_regex', v.batch_regex,
        'gtin_source', (select jsonb_build_object('url', s.url, 'title', s.title, 'last_verified_at', s.last_verified_at)
                        from sources s where s.id = v.gtin_source_id)))
      from product_variants v join products p on p.id = v.product_id
      left join brands b on b.id = p.brand_id left join category_map m on m.category_raw = p.category_raw
      where p.external_ref = p_external_ref), '[]'::jsonb),
    'alerts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'authority', a.authority, 'country', a.country, 'product_text', i.product_name_raw,
        'lot_text', i.batch_as_published, 'lot_scope', 'specific', 'decision_date', a.alert_date,
        'genuine_dates', i.genuine_dates_raw, 'counterfeit_dates', i.counterfeit_dates_raw, 'source_url', s.url))
      from alert_items i join regulatory_alerts a on a.id = i.alert_id join sources s on s.id = a.source_id
      join products p on p.id = i.product_id where p.external_ref = p_external_ref), '[]'::jsonb)
    || coalesce((
      select jsonb_agg(x) from product_variants v join products p on p.id = v.product_id,
        jsonb_array_elements(public.titck_alerts_for_gtin(v.gtin)) x
      where p.external_ref = p_external_ref and v.gtin is not null), '[]'::jsonb))
$$;

-- Comparison key for product names: case, accents, ®/™ and repeated spaces ignored.
create or replace function public.name_key(t text) returns text language sql immutable parallel safe as
  $$ select btrim(regexp_replace(fold(regexp_replace(t, '[®™©]', '', 'g')), '\s+', ' ', 'g')) $$;  -- strip marks before unaccent (it maps ® to (r))

-- Products whose official name (or brand + name) equals the text read on the label under name_key().
-- Exact equality only: a fuzzy match would silently pick a product for the user.
create or replace function public.resolve_product_name(p_brand text, p_name text)
returns table (external_ref text, official_name text, verification_status verification_status)
language sql stable security definer set search_path = public as $$
  select p.external_ref, p.official_name, p.verification_status
  from products p
  where p.official_name is not null and coalesce(p_name, '') <> ''
    and name_key(p.official_name) in (name_key(p_name), name_key(coalesce(p_brand, '') || ' ' || p_name))
  order by (p.verification_status = 'verified') desc, p.external_ref
  limit 5
$$;

grant execute on function public.product_reference(text) to anon, authenticated;
grant execute on function public.resolve_product_name(text, text) to anon, authenticated;

-- Each label read calls a paid vision model: limit per user and keep no image.
create table label_extraction_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  ok         boolean not null,
  error_code text
);
create index label_extraction_log_user_day on label_extraction_log (user_id, created_at);
alter table label_extraction_log enable row level security;
create policy label_extraction_log_own on label_extraction_log for select to authenticated using (user_id = auth.uid());
-- inserts are made by the edge function with the service role only.
