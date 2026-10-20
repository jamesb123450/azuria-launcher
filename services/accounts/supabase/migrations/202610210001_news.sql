begin;

create table public.news_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 100),
  title text not null check (length(btrim(title)) between 1 and 160),
  summary text not null default '' check (length(summary) <= 320),
  body text not null default '' check (length(body) <= 100000),
  cover_path text not null default '',
  cover_alt text not null default '' check (length(cover_alt) <= 240),
  accent text not null default 'pink' check (accent in ('pink','blue','violet')),
  image_position text not null default 'center' check (image_position in ('top','center','bottom')),
  reading_width text not null default 'comfortable' check (reading_width in ('comfortable','wide')),
  status text not null default 'draft' check (status in ('draft','published')),
  author_id uuid not null,
  author_username text not null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  revision integer not null default 1,
  check (status <> 'published' or (published_at is not null and cover_path <> '' and length(btrim(body)) > 0 and length(btrim(cover_alt)) > 0))
);
create index news_published on public.news_posts(published_at desc, id) where status = 'published';
alter table public.news_posts enable row level security;
revoke all on public.news_posts from public, anon, authenticated;

create table public.news_history (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.news_posts(id),
  actor_id uuid not null,
  revision integer not null,
  status text not null,
  changed_at timestamptz not null default now()
);
alter table public.news_history enable row level security;
revoke all on public.news_history from public, anon, authenticated;

-- Public readers never receive draft text, email addresses or private account IDs.
create function public.news_public(p_slug text default null, p_offset integer default 0)
returns table (id uuid, slug text, title text, summary text, body text, cover_path text,
  cover_alt text, accent text, image_position text, reading_width text,
  author_username text, published_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_offset is null or p_offset < 0 or p_offset > 10000 or length(p_slug) > 100 then
    raise exception 'Invalid news page' using errcode = '22023'; end if;
  return query select n.id,n.slug,n.title,n.summary,
    case when p_slug is null then '' else n.body end,n.cover_path,n.cover_alt,n.accent,
    n.image_position,n.reading_width,n.author_username,n.published_at,n.updated_at
    from public.news_posts n where n.status = 'published' and (p_slug is null or n.slug = p_slug)
    order by n.published_at desc,n.id limit 12 offset p_offset;
end;
$$;

create function public.news_admin_list(p_offset integer default 0) returns setof public.news_posts
language plpgsql stable security definer set search_path = '' as $$
begin
  perform azuria_private.require_admin();
  if p_offset is null or p_offset < 0 or p_offset > 10000 then raise exception 'Invalid page' using errcode = '22023'; end if;
  return query select * from public.news_posts order by updated_at desc,id limit 25 offset p_offset;
end;
$$;

create function public.news_admin_save(p_post jsonb, p_id uuid default null, p_revision integer default null)
returns public.news_posts
language plpgsql security definer set search_path = '' as $$
declare actor uuid := azuria_private.require_admin(); n public.news_posts; username text; asset text;
begin
  -- Writes require the same live role and MFA as the dashboard; account moderation
  -- retains its separate fresh-password requirement. Never trust client authorship.
  if p_post is null or jsonb_typeof(p_post) <> 'object' or p_post - array['slug','title','summary','body','cover_path','cover_alt','accent','image_position','reading_width','status'] <> '{}'::jsonb then
    raise exception 'Invalid news fields' using errcode = '22023'; end if;
  perform azuria_private.social_limit(actor, 'news_save', 60, 60);
  asset := coalesce(p_post->>'cover_path','');
  if asset <> '' and (asset !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(png|jpg|webp)$'
    or not exists(select 1 from storage.objects where bucket_id = 'news-images' and name = asset)) then
    raise exception 'Upload a cover image first' using errcode = '22023'; end if;
  if p_id is null then
    select p.username into username from public.profiles p where p.id = actor;
    if username is null then raise exception 'Choose your account username first' using errcode = '22023'; end if;
    insert into public.news_posts(slug,title,author_id,author_username) values (p_post->>'slug',p_post->>'title',actor,username) returning * into n;
  else
    select * into n from public.news_posts where id = p_id for update;
    if not found then raise exception 'News page no longer exists' using errcode = '22023'; end if;
    if p_revision is null or p_revision <> n.revision then
      raise exception 'This story changed in another window. Reload it before saving.' using errcode = '40001'; end if;
    -- Published links stay stable. Unpublish first if a URL needs to change.
    if n.status = 'published' and n.slug <> p_post->>'slug' then
      raise exception 'Unpublish before changing the page address' using errcode = '22023'; end if;
  end if;
  update public.news_posts set slug = p_post->>'slug',title = btrim(p_post->>'title'),
    summary = coalesce(p_post->>'summary',''),body = coalesce(p_post->>'body',''),
    cover_path = asset,cover_alt = coalesce(p_post->>'cover_alt',''),
    accent = coalesce(p_post->>'accent','pink'),image_position = coalesce(p_post->>'image_position','center'),
    reading_width = coalesce(p_post->>'reading_width','comfortable'),status = coalesce(p_post->>'status','draft'),
    published_at = case when p_post->>'status' = 'published' then coalesce(n.published_at,now()) else n.published_at end,
    updated_at = now(),revision = case when p_id is null then 1 else n.revision + 1 end
    where id = n.id returning * into n;
  insert into public.news_history(post_id,actor_id,revision,status) values(n.id,actor,n.revision,n.status);
  return n;
end;
$$;

revoke all on function public.news_public(text,integer), public.news_admin_list(integer), public.news_admin_save(jsonb,uuid,integer) from public, anon, authenticated;
grant execute on function public.news_public(text,integer) to anon, authenticated;
grant execute on function public.news_admin_list(integer), public.news_admin_save(jsonb,uuid,integer) to authenticated;

-- Assets are public; the article text stays private until publication. Random,
-- immutable upload paths prevent overwrites and stale cached covers.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('news-images','news-images',true,5242880,array['image/jpeg','image/png','image/webp']);
create function public.news_can_upload() returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  perform azuria_private.require_admin();
  return true;
exception when insufficient_privilege then return false;
end;
$$;
revoke all on function public.news_can_upload() from public, anon;
grant execute on function public.news_can_upload() to authenticated;
create policy news_admin_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'news-images' and public.news_can_upload()
  and name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(png|jpg|webp)$'
  and split_part(name,'/',1) = auth.uid()::text
);
-- No client update/delete policy: an uploaded cover can never be replaced at its URL.
commit;
