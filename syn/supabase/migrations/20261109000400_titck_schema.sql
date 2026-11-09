-- Separate, source-tracked area for data published by TİTCK (Türkiye İlaç ve Tıbbi Cihaz Kurumu).
-- Kept apart from the curated reference tables on purpose:
--   * every row points to the exact fetch (URL, time, SHA-256 of the page/file) it came from;
--   * nothing here is visible to the public app until TİTCK permission or legal review (D-021):
--     all tables are staff-only, and titck.settings.publish_enabled stays false.

create schema if not exists titck;

create table titck.settings (
  id              boolean primary key default true check (id),
  publish_enabled boolean not null default false,
  decided_by      text,
  decided_at      timestamptz,
  note            text
);
insert into titck.settings (note) values ('Awaiting TİTCK permission / legal review before any public use.');

-- One row per download of a TİTCK page or file. The original bytes are kept for provenance.
create table titck.fetches (
  id          uuid primary key default gen_random_uuid(),
  list_code   text not null check (list_code in ('cosmetic_unsafe', 'cosmetic_gmp')),
  url         text not null,
  fetched_at  timestamptz not null default now(),
  http_status int,
  sha256      text not null,
  content     bytea not null,
  row_count   int not null,
  parser_version text not null
);

-- Kozmetik Güvensiz Ürünler Listesi. Text columns are verbatim; derived columns say how they were derived.
create table titck.unsafe_cosmetics (
  id                 uuid primary key default gen_random_uuid(),
  row_key            text not null unique,      -- sha256 of the six cells + occurrence number (the list has exact duplicates)
  company            text not null,             -- 'Firma/Ürün Sahibi Adı'
  product_text       text not null,             -- 'Ürün'
  lot_text           text not null,             -- 'Lot No/ Seri No'
  origin_text        text,                      -- 'Menşei'
  reason_text        text,                      -- 'Güvensizlik Gerekçesi, Uygulanan İdari Yaptırım'
  decision_date_text text not null,             -- 'Tarihi' (dd/mm/yyyy)
  decision_date      date,
  -- derived, never guessed:
  lot_scope          text not null check (lot_scope in ('specific', 'all_batches', 'not_on_pack', 'unspecified')),
  gtin_in_text       char(14),                  -- only when the text says 'Barkod' and the digits pass the GS1 check digit
  first_fetch_id     uuid not null references titck.fetches,
  last_fetch_id      uuid not null references titck.fetches,
  removed_from_list_at timestamptz             -- set when a later fetch no longer contains the row
);
create index unsafe_cosmetics_gtin on titck.unsafe_cosmetics (gtin_in_text) where gtin_in_text is not null;

-- GMP Sertifikası Verilen Kozmetik Üretim Tesisleri (manufacturer-level evidence, not product-level).
create table titck.cosmetic_gmp_facilities (
  id                 uuid primary key default gen_random_uuid(),
  row_key            text not null unique,
  company            text not null,
  city               text,
  certificate_date   date,
  valid_until        date,
  first_fetch_id     uuid not null references titck.fetches,
  last_fetch_id      uuid not null references titck.fetches,
  removed_from_list_at timestamptz
);

alter table titck.settings enable row level security;
alter table titck.fetches enable row level security;
alter table titck.unsafe_cosmetics enable row level security;
alter table titck.cosmetic_gmp_facilities enable row level security;
create policy staff_all on titck.settings for all to authenticated using (is_staff()) with check (is_staff());
create policy staff_all on titck.fetches for all to authenticated using (is_staff()) with check (is_staff());
create policy staff_all on titck.unsafe_cosmetics for all to authenticated using (is_staff()) with check (is_staff());
create policy staff_all on titck.cosmetic_gmp_facilities for all to authenticated using (is_staff()) with check (is_staff());
grant usage on schema titck to authenticated;
grant select, insert, update, delete on all tables in schema titck to authenticated;
-- no grant to anon: the public app cannot see this schema at all.
