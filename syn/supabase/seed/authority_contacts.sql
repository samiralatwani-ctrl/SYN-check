-- Regulator contact channels, copied from the authority's own contact page (fetched 2026-11-09). Idempotent.
insert into sources (url, title, source_type, last_verified_at)
values ('https://www.titck.gov.tr/iletisim', 'TİTCK — İletişim', 'جهة رقابية', '2026-11-09')
on conflict (url) do update set last_verified_at = excluded.last_verified_at;

insert into authority_contacts (country, authority, kind, value, purpose_text, source_id, last_verified_at)
select 'TR', 'TİTCK', v.kind, v.value, v.purpose, s.id, '2026-11-09'
from sources s, (values
  ('web',   'https://www.cimer.gov.tr', 'VATANDAŞLARIMIZ İÇİN: başvurularınızı https://www.cimer.gov.tr yoluyla yapabilir'),
  ('phone', 'ALO 184',                  'istek ve şikâyetleriniz için ALO184 SABİM'),
  ('phone', '444 4 680',                'Kurum İletişim Merkezi : 44 44 680'),
  ('phone', '+90 312 218 30 00',        'Telefon : +90 (312) 218 30 00')
) as v(kind, value, purpose)
where s.url = 'https://www.titck.gov.tr/iletisim'
on conflict (country, kind, value) do update set purpose_text = excluded.purpose_text, last_verified_at = excluded.last_verified_at;
