begin;
create table public.sponsor_ads (
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(btrim(title)) between 1 and 100),
 image_path text not null check(image_path ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(png|jpg|webp)$'),
 image_alt text not null check(length(btrim(image_alt)) between 1 and 240),
 destination text not null check(length(destination) <= 2048 and destination ~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}([/?#][^[:space:][:cntrl:]@]*)?$'),
 slots text[] not null check(cardinality(slots) between 1 and 8 and slots <@ array['home.top','home.bottom','library.top','library.bottom','social.top','social.bottom','monitor.top','monitor.bottom']::text[]),
 enabled boolean not null default false,
 starts_at timestamptz not null,
 ends_at timestamptz,
 revision integer not null default 1,
 updated_at timestamptz not null default now(),
 check(ends_at is null or ends_at > starts_at)
);
alter table public.sponsor_ads enable row level security;
revoke all on public.sponsor_ads from public,anon,authenticated;
create table public.sponsor_ad_history (
 id bigint generated always as identity primary key,
 ad_id uuid not null references public.sponsor_ads(id),
 actor_id uuid not null,
 revision integer not null,
 changed_at timestamptz not null default now()
);
alter table public.sponsor_ad_history enable row level security;
revoke all on public.sponsor_ad_history from public,anon,authenticated;
create function public.sponsor_ads_public() returns table(id uuid,title text,image_path text,image_alt text,destination text,slots text[],ends_at timestamptz)
language sql stable security definer set search_path='' as $$
 select a.id,a.title,a.image_path,a.image_alt,a.destination,a.slots,a.ends_at from public.sponsor_ads a
 where a.enabled and a.starts_at <= now() and (a.ends_at is null or now() < a.ends_at)
 order by a.id limit 8;
$$;
create function public.sponsor_ads_admin_list() returns setof public.sponsor_ads
language plpgsql stable security definer set search_path='' as $$
begin
 perform azuria_private.require_admin();
 return query select * from public.sponsor_ads order by updated_at desc,id limit 200;
end;
$$;
create function public.sponsor_ads_admin_save(p_ad jsonb,p_id uuid default null,p_revision integer default null) returns public.sponsor_ads
language plpgsql security definer set search_path='' as $$
declare actor uuid := azuria_private.require_admin(); n public.sponsor_ads; chosen text[]; start_time timestamptz; end_time timestamptz;
begin
 perform pg_catalog.pg_advisory_xact_lock(250001);
 if p_id is not null then
  select * into n from public.sponsor_ads where id=p_id for update;
  if not found then raise exception 'Advertisement no longer exists' using errcode='22023'; end if;
  if p_revision is null or p_revision <> n.revision then raise exception 'Advertisement changed. Reload before saving.' using errcode='40001'; end if;
 end if;
 select array_agg(distinct value) into chosen from pg_catalog.jsonb_array_elements_text(p_ad->'slots');
 start_time := (p_ad->>'starts_at')::timestamptz;
 end_time := nullif(p_ad->>'ends_at','')::timestamptz;
 if coalesce((p_ad->>'enabled')::boolean,false) and exists(
  select 1 from public.sponsor_ads a where a.enabled and a.id is distinct from p_id and a.slots && chosen
  and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(start_time,end_time,'[)')
 ) then raise exception 'A selected slot already has an advertisement during these dates' using errcode='23P01'; end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='sponsor-images' and o.name=p_ad->>'image_path') then
  raise exception 'Upload the image first' using errcode='22023'; end if;
 insert into public.sponsor_ads(id,title,image_path,image_alt,destination,slots,enabled,starts_at,ends_at,revision)
 values(coalesce(p_id,gen_random_uuid()),btrim(p_ad->>'title'),p_ad->>'image_path',btrim(p_ad->>'image_alt'),p_ad->>'destination',chosen,coalesce((p_ad->>'enabled')::boolean,false),start_time,end_time,coalesce(n.revision,0)+1)
 on conflict(id) do update set title=excluded.title,image_path=excluded.image_path,image_alt=excluded.image_alt,destination=excluded.destination,slots=excluded.slots,enabled=excluded.enabled,starts_at=excluded.starts_at,ends_at=excluded.ends_at,revision=excluded.revision,updated_at=now()
 returning * into n;
 insert into public.sponsor_ad_history(ad_id,actor_id,revision) values(n.id,actor,n.revision);
 return n;
end;
$$;
revoke all on function public.sponsor_ads_public(),public.sponsor_ads_admin_list(),public.sponsor_ads_admin_save(jsonb,uuid,integer) from public,anon,authenticated;
grant execute on function public.sponsor_ads_public() to anon,authenticated;
grant execute on function public.sponsor_ads_admin_list(),public.sponsor_ads_admin_save(jsonb,uuid,integer) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('sponsor-images','sponsor-images',true,2097152,array['image/jpeg','image/png','image/webp']);
create policy sponsor_admin_upload on storage.objects for insert to authenticated with check(
 bucket_id='sponsor-images' and public.news_can_upload()
 and name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(png|jpg|webp)$' and split_part(name,'/',1)=auth.uid()::text
);
commit;
