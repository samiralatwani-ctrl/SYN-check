-- Category mappings decided by the product spec itself (CLAUDE.md §8: fillers and botulinum are
-- medical devices / medicines, not cosmetics). All other raw categories are mapped by a reviewer in the admin panel.
insert into category_map (category_raw, category, regulatory_class, mapped_by) values
  ('الفلر', 'filler', 'medical_device', 'spec §8'),
  ('مستحضرات بوتولينوم حسب إعلان البائع', 'botulinum', 'medicine', 'spec §8');
