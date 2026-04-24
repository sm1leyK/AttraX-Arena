-- Normalize optional post image URLs so no-image posts are exposed as SQL null.
-- Apply this migration to the live Supabase project before relying on backend cleanup.

create or replace function public.normalize_post_image_url(p_image_url text)
returns text
language sql
immutable
as $$
  with normalized_value as (
    select nullif(trim(p_image_url), '') as normalized
  )
  select case
    when normalized is null then null
    when lower(normalized) in ('null', 'undefined') then null
    else normalized
  end
  from normalized_value;
$$;

create or replace function public.normalize_post_image_fields()
returns trigger
language plpgsql
as $$
begin
  new.image_url := public.normalize_post_image_url(new.image_url);
  return new;
end;
$$;

drop trigger if exists normalize_post_image_fields on public.posts;
create trigger normalize_post_image_fields
before insert or update of image_url on public.posts
for each row
execute function public.normalize_post_image_fields();

update public.posts
set image_url = public.normalize_post_image_url(image_url)
where image_url is not null
  and image_url is distinct from public.normalize_post_image_url(image_url);
