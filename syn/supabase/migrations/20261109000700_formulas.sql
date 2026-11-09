-- Phase 4: official ingredient lists (formula versions) with a review step.
-- A list extracted from a manufacturer page counts only after a reviewer approves it.

alter table formula_versions
  add column review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected')),
  add column raw_text      text,            -- the list exactly as published
  add column fetched_at    timestamptz,
  add column page_sha256   text,            -- hash of the page it was extracted from
  add column extracted_by  text,            -- program + version
  add column reviewed_by   uuid references profiles,
  add column reviewed_at   timestamptz,
  add column review_note   text;

alter table ingredients add column created_from text;   -- 'formula:<id>' or 'cosing'

-- Reference now includes approved formula versions (newest first) with their ingredients.
create or replace function public.formula_versions_for(p_variant uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', fv.id, 'valid_from', fv.valid_from, 'source_url', s.url, 'source_title', s.title, 'source_date', fv.source_date,
      'ingredients', (select coalesce(jsonb_agg(jsonb_build_object('position', vi.position, 'inci_name', i.inci_name,
                                      'is_active', i.is_active_substance) order by vi.position), '[]'::jsonb)
                      from variant_ingredients vi join ingredients i on i.id = vi.ingredient_id
                      where vi.formula_version_id = fv.id))
    order by fv.valid_from desc nulls last, fv.source_date desc nulls last), '[]'::jsonb)
  from formula_versions fv join sources s on s.id = fv.source_id
  where fv.variant_id = p_variant and fv.review_status = 'approved'
$$;
revoke all on function public.formula_versions_for(uuid) from public;

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
        'batch_regex', v.batch_regex, 'formula_versions', public.formula_versions_for(v.id),
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

-- lookup_gtin returns the same formula data for barcode scans.
create or replace function public.lookup_gtin(p_gtin14 text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'gtin', p_gtin14,
    'variants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'variant_id', v.id, 'product_id', p.id, 'external_ref', p.external_ref,
        'official_name', p.official_name, 'brand', b.name, 'market', v.market,
        'verification_status', least(p.verification_status, v.verification_status),
        'regulatory_class', coalesce(m.regulatory_class, 'unknown'), 'category', m.category,
        'package_text', v.package_text, 'concentration_text', v.concentration_text,
        'size_value', v.size_value, 'size_unit', v.size_unit,
        'concentration_value', v.concentration_value, 'concentration_unit', v.concentration_unit,
        'shelf_life_min_months', v.shelf_life_min_months, 'shelf_life_max_months', v.shelf_life_max_months,
        'batch_regex', v.batch_regex, 'formula_versions', public.formula_versions_for(v.id),
        'gtin_source', (select jsonb_build_object('url', s.url, 'title', s.title, 'last_verified_at', s.last_verified_at)
                        from sources s where s.id = v.gtin_source_id)))
      from product_variants v join products p on p.id = v.product_id
      left join brands b on b.id = p.brand_id left join category_map m on m.category_raw = p.category_raw
      where v.gtin = p_gtin14), '[]'::jsonb),
    'alerts', public.titck_alerts_for_gtin(p_gtin14) || coalesce((
      select jsonb_agg(jsonb_build_object(
        'authority', a.authority, 'country', a.country, 'product_text', i.product_name_raw,
        'lot_text', i.batch_as_published, 'lot_scope', 'specific', 'decision_date', a.alert_date,
        'genuine_dates', i.genuine_dates_raw, 'counterfeit_dates', i.counterfeit_dates_raw,
        'source_url', s.url))
      from alert_items i join regulatory_alerts a on a.id = i.alert_id join sources s on s.id = a.source_id
      join product_variants v on v.product_id = i.product_id where v.gtin = p_gtin14), '[]'::jsonb))
$$;
