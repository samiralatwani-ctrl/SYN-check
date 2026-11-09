-- Phase 5: reporting and explore.

-- Official contact channels of regulators, each with its source. Only sourced entries; never guessed.
create table authority_contacts (
  id               uuid primary key default gen_random_uuid(),
  country          char(2) not null references countries,
  authority        text not null,
  kind             text not null check (kind in ('email', 'phone', 'web', 'whatsapp')),
  value            text not null,
  purpose_text     text,                 -- verbatim purpose from the source page
  source_id        uuid not null references sources,
  last_verified_at date not null,
  unique (country, kind, value)
);
alter table authority_contacts enable row level security;
create policy authority_contacts_read on authority_contacts for select to anon, authenticated using (true);
create policy authority_contacts_staff on authority_contacts for all to authenticated using (is_staff()) with check (is_staff());
grant select on authority_contacts to anon, authenticated;

-- Who to report to for a product: brand contact text (verbatim) with the e-mail addresses it contains,
-- authorised agents, and regulator channels. Seller data is never part of this.
create or replace function public.report_contacts(p_external_ref text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'brand', (select jsonb_build_object(
        'name', b.name, 'contact_text', b.contact_info, 'report_email', b.report_email,
        'anti_counterfeit_page', b.anti_counterfeit_page, 'official_verification_method', b.official_verification_method,
        'emails', coalesce((select jsonb_agg(distinct m[1]) from regexp_matches(coalesce(b.contact_info, ''),
                  '([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})', 'g') m), '[]'::jsonb),
        'agents', coalesce((select jsonb_agg(jsonb_build_object('country', a.country, 'region', a.region_label,
                  'availability', a.availability, 'text', a.agent_text)) from brand_agents a where a.brand_id = b.id), '[]'::jsonb))
      from products p join brands b on b.id = p.brand_id where p.external_ref = p_external_ref),
    'authorities', coalesce((select jsonb_agg(jsonb_build_object('country', c.country, 'authority', c.authority, 'kind', c.kind,
        'value', c.value, 'purpose', c.purpose_text, 'source_url', s.url, 'last_verified_at', c.last_verified_at) order by c.country, c.kind)
      from authority_contacts c join sources s on s.id = c.source_id), '[]'::jsonb))
$$;
grant execute on function public.report_contacts(text) to anon, authenticated;

-- Explore: latest alerts (facts only), authorised agents, verified products.
create or replace function public.explore()
returns jsonb language sql stable security definer set search_path = public, titck as $$
  select jsonb_build_object(
    'alerts', coalesce((select jsonb_agg(x order by x->>'decision_date' desc nulls last) from (
        select jsonb_build_object('authority', a.authority, 'country', a.country, 'product_text', i.product_name_raw,
          'lot_text', i.batch_as_published, 'lot_scope', 'specific', 'decision_date', a.alert_date,
          'genuine_dates', i.genuine_dates_raw, 'counterfeit_dates', i.counterfeit_dates_raw, 'source_url', s.url) x
        from alert_items i join regulatory_alerts a on a.id = i.alert_id join sources s on s.id = a.source_id
        union all
        select jsonb_build_object('authority', 'TİTCK', 'country', 'TR', 'product_text', u.product_text, 'lot_text', u.lot_text,
          'lot_scope', u.lot_scope, 'decision_date', u.decision_date, 'reason_text_tr', u.reason_text, 'source_url', f.url)
        from titck.unsafe_cosmetics u join titck.fetches f on f.id = u.last_fetch_id
        where u.removed_from_list_at is null and (select publish_enabled from titck.settings)
        order by 1 limit 100000) q
      ), '[]'::jsonb),
    'agents', coalesce((select jsonb_agg(jsonb_build_object('brand', b.name, 'country', a.country, 'country_name', c.name_ar,
        'region', a.region_label, 'availability', a.availability, 'text', a.agent_text,
        'sources', (select jsonb_agg(s.url) from brand_agent_sources bs join sources s on s.id = bs.source_id where bs.agent_id = a.id))
        order by b.name, a.country nulls last)
      from brand_agents a join brands b on b.id = a.brand_id left join countries c on c.iso2 = a.country), '[]'::jsonb),
    'verified', coalesce((select jsonb_agg(jsonb_build_object('external_ref', p.external_ref, 'official_name', p.official_name,
        'brand', b.name, 'category', coalesce(m.category, p.category_raw), 'regulatory_class', m.regulatory_class) order by p.official_name)
      from products p left join brands b on b.id = p.brand_id left join category_map m on m.category_raw = p.category_raw
      where p.verification_status = 'verified'), '[]'::jsonb))
$$;
grant execute on function public.explore() to anon, authenticated;

-- Reports carry what the user chose to send; the seller stays private (staff-only column use).
alter table reports add column message_text text, add column attachments_count int not null default 0,
  add column purchase_channel text;

-- A scan records the exact rules it was judged with: method version + SHA-256 of the rules file.
alter table scans add column method_sha256 text;
alter table scans drop constraint scans_method_version_fkey;
alter table method_versions drop constraint method_versions_pkey;
alter table method_versions add primary key (version, rules_sha256);
alter table scans add constraint scans_method_fkey foreign key (method_version, method_sha256)
  references method_versions (version, rules_sha256);
