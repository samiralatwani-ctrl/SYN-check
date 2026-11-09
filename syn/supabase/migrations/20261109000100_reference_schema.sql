-- SYN: Check Before Use — reference schema (phase 1)
-- Rule enforced throughout: no GTIN, batch pattern, registration or image without an official source.
-- Product data never lives in migrations. Only lookup data (countries) is seeded here.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create type verification_status as enum ('candidate_unverified', 'verified', 'retired');
create type evidence_status     as enum ('yes', 'partial', 'no', 'not_checked');
create type regulatory_class    as enum ('cosmetic', 'medical_device', 'medicine', 'unknown');
create type staff_role          as enum ('admin', 'reviewer');
create type verdict             as enum ('mismatch', 'suspect', 'minor', 'match', 'insufficient');
create type signal_outcome      as enum ('match', 'mismatch', 'unavailable');

-- ---------------------------------------------------------------- lookup
create table countries (
  iso2    char(2) primary key,
  name_ar text not null,
  name_en text not null,
  name_tr text not null
);
insert into countries values
  ('IQ','العراق','Iraq','Irak'), ('SA','السعودية','Saudi Arabia','Suudi Arabistan'),
  ('LB','لبنان','Lebanon','Lübnan'), ('TR','تركيا','Türkiye','Türkiye'),
  ('JO','الأردن','Jordan','Ürdün'), ('AE','الإمارات','United Arab Emirates','Birleşik Arap Emirlikleri'),
  ('KW','الكويت','Kuwait','Kuveyt'), ('QA','قطر','Qatar','Katar'), ('BH','البحرين','Bahrain','Bahreyn'),
  ('OM','عُمان','Oman','Umman'), ('SY','سوريا','Syria','Suriye'), ('EG','مصر','Egypt','Mısır'),
  ('AT','النمسا','Austria','Avusturya'), ('ES','إسبانيا','Spain','İspanya'), ('FR','فرنسا','France','Fransa'),
  ('GR','اليونان','Greece','Yunanistan'), ('US','الولايات المتحدة','United States','Amerika Birleşik Devletleri'),
  ('JP','اليابان','Japan','Japonya');

create table profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       staff_role,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- import provenance
create table import_batches (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('iqb', 'pilot', 'tr_uts')),
  file_name   text not null,
  sha256      text not null unique,
  row_count   int  not null,
  imported_at timestamptz not null default now()
);

create table raw_import_rows (
  id           uuid primary key default gen_random_uuid(),
  batch_id     uuid not null references import_batches on delete cascade,
  sheet        text not null,
  row_number   int  not null,
  cells        jsonb not null,           -- {header: value} exactly as in the file
  external_ref text,
  unique (batch_id, sheet, row_number)
);

-- ---------------------------------------------------------------- sources
create table sources (
  id                 uuid primary key default gen_random_uuid(),
  url                text not null unique,
  title              text,
  source_type        text,               -- verbatim, e.g. 'جهة رقابية' / 'الشركة المصنّعة'
  document_date      date,
  last_verified_at   date,
  archived_copy_path text,
  sha256             text
);

create table source_aliases (              -- 'S10' in a given file -> source
  batch_id  uuid not null references import_batches on delete cascade,
  code      text not null,
  source_id uuid not null references sources,
  primary key (batch_id, code)
);

-- ---------------------------------------------------------------- brands & agents
create table brands (
  id                           uuid primary key default gen_random_uuid(),
  name                         text not null unique,
  parent_company               text,
  regional_site                text,
  contact_info                 text,
  report_email                 text,      -- only when the brand states it is for counterfeit/quality reports
  anti_counterfeit_page        text,
  official_verification_method text,
  declared_security_features   text,
  practical_note               text,
  last_verified_at             date,
  card_raw                     jsonb,     -- the whole brand card as imported
  batch_id                     uuid references import_batches
);

create table brand_agents (
  id               uuid primary key default gen_random_uuid(),
  brand_id         uuid not null references brands on delete cascade,
  country          char(2) references countries,
  region_label     text,                  -- when the file names a region, e.g. 'الخليج والأردن'
  availability     text not null check (availability in ('listed', 'not_available_officially')),
  agent_text       text not null,         -- verbatim
  last_verified_at date,
  batch_id         uuid references import_batches,
  check (country is not null or region_label is not null)
);

create table brand_agent_sources (
  agent_id  uuid references brand_agents on delete cascade,
  source_id uuid references sources,
  primary key (agent_id, source_id)
);

-- ---------------------------------------------------------------- products
create table category_map (
  category_raw     text primary key,
  category         text not null,
  regulatory_class regulatory_class not null,
  mapped_by        text not null,         -- reviewer id or the spec clause that decided it
  mapped_at        timestamptz not null default now()
);

create table products (
  id                         uuid primary key default gen_random_uuid(),
  external_ref               text not null unique,   -- IQB-xxxx
  brand_id                   uuid references brands,
  brand_raw                  text,
  category_raw               text,
  official_name              text,
  official_name_batch_id     uuid references import_batches,
  verification_status        verification_status not null default 'candidate_unverified',
  documentation_status_file  text,                  -- as written in the pilot file
  documentation_count_file   int,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
create index products_name_trgm on products using gin (official_name gin_trgm_ops);

create table product_review_status (       -- verbatim review columns from IQB files
  product_id               uuid primary key references products on delete cascade,
  name_match_status        text,
  formula_status           text,
  iraq_registration_status text,
  scientific_review_status text,
  required_action          text,
  verification_notes       text,
  circulation_limits       text,
  batch_id                 uuid references import_batches
);

create table product_variants (
  id                     uuid primary key default gen_random_uuid(),
  product_id             uuid not null references products on delete cascade,
  market                 char(2) references countries,
  gtin                   char(14) check (gtin ~ '^[0-9]{14}$'),
  gtin_source_id         uuid references sources,
  gtin_status_text       text,              -- e.g. 'غير متوفر رسمياً'
  gs1_result_text        text,
  package_text           text,
  concentration_text     text,
  origin_text            text,
  security_features_text text,
  ifu_reference_text     text,
  size_value             numeric,
  size_unit              text,
  concentration_value    numeric,
  concentration_unit     text,
  shelf_life_min_months  int,
  shelf_life_max_months  int,
  batch_regex            text,
  batch_regex_source_id  uuid references sources,
  verification_status    verification_status not null default 'candidate_unverified',
  batch_id               uuid references import_batches,
  constraint gtin_needs_source  check (gtin is null or gtin_source_id is not null),
  constraint regex_needs_source check (batch_regex is null or batch_regex_source_id is not null)
);
create unique index product_variants_gtin_market on product_variants (gtin, market) where gtin is not null;

create table formula_versions (
  id          uuid primary key default gen_random_uuid(),
  variant_id  uuid not null references product_variants on delete cascade,
  valid_from  date,
  source_id   uuid not null references sources,
  source_date date
);

create table ingredients (
  id                  uuid primary key default gen_random_uuid(),
  inci_name           text not null unique,
  is_active_substance boolean not null default false
);

create table ingredient_synonyms (
  id            uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references ingredients on delete cascade,
  synonym       text not null,
  lang          text,
  unique (synonym, lang)
);

create table variant_ingredients (
  formula_version_id     uuid references formula_versions on delete cascade,
  ingredient_id          uuid references ingredients,
  position               int not null,
  declared_concentration text,
  primary key (formula_version_id, position)
);

-- ---------------------------------------------------------------- evidence
create table evidence (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid references products on delete cascade,
  variant_id       uuid references product_variants on delete cascade,
  country          char(2) references countries,   -- null = manufacturer / non-country source
  authority_label  text not null,                  -- verbatim column header, e.g. 'دليل لبنان'
  field            text not null,                  -- product_evidence | official_name_witness | brand_or_class_reference | ...
  status           evidence_status not null,
  value_text       text,
  partial_note     text,
  document_date    date,
  last_verified_at date,
  verified_by      uuid references profiles,
  batch_id         uuid references import_batches,
  check (product_id is not null or variant_id is not null)
);

create table evidence_sources (
  evidence_id uuid references evidence on delete cascade,
  source_id   uuid references sources,
  primary key (evidence_id, source_id)
);

-- ---------------------------------------------------------------- alerts
create table regulatory_alerts (
  id           uuid primary key default gen_random_uuid(),
  authority    text not null,      -- verbatim, e.g. 'BASG، النمسا'
  country      char(2) references countries,
  alert_date   date not null,
  channel_text text,
  note         text,
  source_id    uuid not null references sources,
  batch_id     uuid references import_batches
);

create table alert_items (
  id                   uuid primary key default gen_random_uuid(),
  alert_id             uuid not null references regulatory_alerts on delete cascade,
  product_id           uuid references products,
  product_name_raw     text not null,
  batch_as_published   text not null,
  product_code         text,
  alert_kind           text not null default 'unknown' check (alert_kind in ('copied_genuine_batch', 'fake_batch', 'unknown')),
  genuine_dates_raw    text,
  counterfeit_dates_raw text,
  genuine_mfg          date, genuine_exp date,
  counterfeit_mfg      date, counterfeit_exp date,
  date_precision       text check (date_precision in ('day', 'month'))
);
create index alert_items_batch on alert_items (batch_as_published);

-- ---------------------------------------------------------------- private listing evidence (sellers)
create table listing_sources (
  id                   uuid primary key default gen_random_uuid(),
  product_id           uuid not null references products on delete cascade,
  batch_id             uuid not null references import_batches,
  seller_name          text,
  listing_url          text,
  name_as_listed       text,
  variants_as_listed   text,
  barcode_as_listed    text,      -- seller claim; never copied to product_variants.gtin
  size_match_text      text,
  circulation_status   text,
  best_seller_list_url text,
  extra_links          text,
  local_source_count   int,
  collected_at         timestamptz
);

-- ---------------------------------------------------------------- images, method, scans, reports
create table reference_images (
  id           uuid primary key default gen_random_uuid(),
  variant_id   uuid not null references product_variants on delete cascade,
  storage_path text not null,
  view         text check (view in ('front', 'back', 'cap', 'batch_area', 'other')),
  acquisition  text not null check (acquisition in ('authorized_agent_sample', 'manufacturer_material')),
  source_id    uuid not null references sources,
  approved_by  uuid references profiles
  -- embedding vector column is added in phase 6 (pgvector)
);

create table method_versions (
  version      text primary key,
  status       text not null check (status in ('draft', 'rc', 'published', 'retired')),
  rules        jsonb not null,
  rules_sha256 text not null,
  published_at timestamptz,
  published_by uuid references profiles
);

create table scans (
  id                           uuid primary key default gen_random_uuid(),
  user_id                      uuid references auth.users on delete cascade,
  variant_id                   uuid references product_variants,
  product_id                   uuid references products,
  verdict                      verdict not null,
  method_version               text not null references method_versions,
  extraction                   jsonb,
  purchase_channel             text check (purchase_channel in ('authorized_agent', 'pharmacy', 'online_store', 'social_media', 'other')),
  computed_offline             boolean not null default false,
  images_delete_at             timestamptz,
  images_retained_with_consent boolean not null default false,
  created_at                   timestamptz not null default now()
);

create table scan_signals (
  id           uuid primary key default gen_random_uuid(),
  scan_id      uuid not null references scans on delete cascade,
  type         text not null,
  outcome      signal_outcome not null,
  severity     text,
  weight       numeric,
  confidence   numeric check (confidence between 0 and 1),
  experimental boolean not null default false,
  evidence     jsonb
);

create table reports (
  id                  uuid primary key default gen_random_uuid(),
  scan_id             uuid not null references scans on delete cascade,
  user_id             uuid references auth.users on delete set null,
  recipients          text[] not null,
  channel             text check (channel in ('email', 'whatsapp')),
  review_status       text not null default 'new' check (review_status in ('new', 'reviewing', 'forwarded', 'closed')),
  seller_info_private text,
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------- derived views
-- Documentation status, same rule as the pilot file's reading guide:
--   ✅ Iraqi evidence + at least two 'yes' | ⚠️ two 'yes' without Iraq | ⚠️ one | ❌ none. 'partial' never counts.
create view v_documentation_status with (security_invoker = true) as
select p.id as product_id,
       p.external_ref,
       count(e.*) filter (where e.status = 'yes')                      as yes_count,
       bool_or(e.status = 'yes' and e.country = 'IQ')                  as has_iraq_yes,
       case
         when bool_or(e.status = 'yes' and e.country = 'IQ')
              and count(e.*) filter (where e.status = 'yes') >= 2      then '✅ موثّق رسمياً'
         when count(e.*) filter (where e.status = 'yes') >= 2          then '⚠️ موثّق خارج العراق'
         when count(e.*) filter (where e.status = 'yes') = 1           then '⚠️ ناقص'
         else '❌ غير موثّق'
       end as documentation_status
from products p
left join evidence e on e.product_id = p.id and e.field = 'product_evidence'
group by p.id, p.external_ref;
