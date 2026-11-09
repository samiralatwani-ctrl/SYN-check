-- Phase 6 (experimental): visual fingerprints of reference images.
-- Reference images come only from verified samples (authorised agent) or permitted manufacturer material (§5.5),
-- and count only after review. No image is collected from search engines or shops.
alter table reference_images
  add column visual_vector  float8[] check (visual_vector is null or array_length(visual_vector, 1) = 128),
  add column visual_version text,
  add column review_status  text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected')),
  add column reviewed_at    timestamptz,
  add column review_note    text,
  add column image_sha256   text;

create or replace function public.reference_images_for(p_variant uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'view', r.view, 'acquisition', r.acquisition,
      'visual_version', r.visual_version, 'visual_vector', to_jsonb(r.visual_vector), 'source_url', s.url)), '[]'::jsonb)
  from reference_images r join sources s on s.id = r.source_id
  where r.variant_id = p_variant and r.review_status = 'approved' and r.visual_vector is not null
$$;
revoke all on function public.reference_images_for(uuid) from public;

-- Add reference images to both lookups (barcode and label).
do $$
declare f text;
begin
  foreach f in array array['lookup_gtin', 'product_reference'] loop
    execute replace(pg_get_functiondef(('public.' || f || '(text)')::regprocedure),
      '''formula_versions'', public.formula_versions_for(v.id),',
      '''formula_versions'', public.formula_versions_for(v.id), ''reference_images'', public.reference_images_for(v.id),');
  end loop;
end $$;
