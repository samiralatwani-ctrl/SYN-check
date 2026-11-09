-- Phase 2: public read-only lookup functions for the app (D-023), and owner decision D-021 (update).

create extension if not exists unaccent;

-- unaccent() is not immutable; wrap it so search treats 'Juvéderm' and 'juvederm' alike.
create or replace function public.fold(t text) returns text language sql immutable parallel safe as
  $$ select lower(public.unaccent('public.unaccent'::regdictionary, coalesce(t, ''))) $$;

update titck.settings set publish_enabled = true, decided_by = 'owner', decided_at = now(),
  note = 'Owner decision 2026-11-09: use publicly published TİTCK facts with attribution (D-021).';

-- Publishable TİTCK facts only (no company name, no raw page), and only while publishing is enabled.
create or replace function public.titck_alerts_for_gtin(p_gtin14 text)
returns jsonb language sql stable security definer set search_path = public, titck as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'authority', 'TİTCK', 'country', 'TR', 'product_text', u.product_text, 'lot_text', u.lot_text,
           'lot_scope', u.lot_scope, 'decision_date', u.decision_date, 'reason_text_tr', u.reason_text,
           'source_url', f.url, 'fetched_at', f.fetched_at) order by u.decision_date desc), '[]'::jsonb)
  from titck.unsafe_cosmetics u
  join titck.fetches f on f.id = u.last_fetch_id
  where u.gtin_in_text = p_gtin14 and u.removed_from_list_at is null
    and (select publish_enabled from titck.settings)
$$;

-- Everything the rules engine needs for a barcode-only scan.
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

-- Name search for the scan screen. Candidates are returned but flagged; seller names are never searched or shown.
create or replace function public.search_products(p_query text, p_limit int default 20)
returns table (external_ref text, official_name text, brand text, category_raw text,
               verification_status verification_status, has_gtin boolean)
language sql stable security definer set search_path = public as $$
  select p.external_ref, p.official_name, coalesce(b.name, p.brand_raw), p.category_raw, p.verification_status,
         exists (select 1 from product_variants v where v.product_id = p.id and v.gtin is not null)
  from products p left join brands b on b.id = p.brand_id
  where length(trim(p_query)) >= 2
    and (fold(p.official_name) like '%' || fold(p_query) || '%' or fold(coalesce(b.name, p.brand_raw)) like '%' || fold(p_query) || '%')
  order by (p.verification_status = 'verified') desc, similarity(fold(p.official_name), fold(p_query)) desc, p.external_ref
  limit least(greatest(p_limit, 1), 50)
$$;

revoke all on function public.titck_alerts_for_gtin(text) from public;
grant execute on function public.lookup_gtin(text) to anon, authenticated;
grant execute on function public.search_products(text, int) to anon, authenticated;
