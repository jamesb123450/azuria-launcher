-- Apply once after schema.sql. No payments, Gems or paid entitlements.
begin;
create table public.cosmetic_capes (
 id text primary key check (id ~ '^[a-z0-9-]{1,64}$'),
 name text not null check (length(name) between 1 and 80),
 description text not null check (length(description) <= 300),
 texture text not null check (texture ~ '^[a-z0-9-]{1,64}\.png$'),
 enabled boolean not null default true,
 claimable boolean not null default false
);
create table public.cosmetic_ownership (
 user_id uuid references public.profiles(id) on delete cascade,
 cape_id text references public.cosmetic_capes(id),
 granted_at timestamptz not null default now(),
 primary key(user_id,cape_id)
);
create table public.cosmetic_equipment (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 cape_id text not null,
 foreign key(user_id,cape_id) references public.cosmetic_ownership(user_id,cape_id) on delete cascade
);
create table public.cosmetic_minecraft_links (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 minecraft_uuid text not null unique check (minecraft_uuid ~ '^[a-f0-9]{32}$')
);
alter table public.cosmetic_capes enable row level security;
alter table public.cosmetic_ownership enable row level security;
alter table public.cosmetic_equipment enable row level security;
alter table public.cosmetic_minecraft_links enable row level security;
revoke all on public.cosmetic_capes,public.cosmetic_ownership,public.cosmetic_equipment,public.cosmetic_minecraft_links from public,anon,authenticated;
grant all on public.cosmetic_capes,public.cosmetic_ownership,public.cosmetic_equipment,public.cosmetic_minecraft_links to service_role;

create function public.cosmetics_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid := azuria_private.social_actor();
begin
 return jsonb_build_object('accountId',actor,'minecraftUuid',(select minecraft_uuid from public.cosmetic_minecraft_links where user_id=actor),
 'equipped',(select e.cape_id from public.cosmetic_equipment e join public.cosmetic_capes c on c.id=e.cape_id where user_id=actor and c.enabled),
 'capes',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'description',c.description,'texture',c.texture,'claimable',c.claimable,'owned',o.user_id is not null) order by c.id)
 from public.cosmetic_capes c left join public.cosmetic_ownership o on o.cape_id=c.id and o.user_id=actor where c.enabled),'[]'::jsonb));
end $$;
create function public.cosmetics_claim(p_cape text) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := azuria_private.social_actor();
begin
 perform 1 from public.cosmetic_capes where id=p_cape and enabled and claimable for share;
 if not found then raise exception 'This cape cannot be claimed' using errcode='22023'; end if;
 insert into public.cosmetic_ownership(user_id,cape_id) values(actor,p_cape) on conflict do nothing;
end $$;
create function public.cosmetics_equip(p_cape text) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := azuria_private.social_actor();
begin
 -- Serialize equip/unequip operations for one account.
 perform 1 from public.profiles where id=actor for update;
 if p_cape is null then delete from public.cosmetic_equipment where user_id=actor; return; end if;
 perform 1 from public.cosmetic_capes c join public.cosmetic_ownership o on o.cape_id=c.id where c.id=p_cape and c.enabled and o.user_id=actor for share of c,o;
 if not found then raise exception 'Own an available cape before equipping it' using errcode='22023'; end if;
 insert into public.cosmetic_equipment(user_id,cape_id) values(actor,p_cape) on conflict(user_id) do update set cape_id=excluded.cape_id;
end $$;
create function public.cosmetics_unlink() returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := azuria_private.social_actor();
begin delete from public.cosmetic_minecraft_links where user_id=actor; end $$;
-- Only the verification Edge Function may call this, after checking the Minecraft token.
create function public.cosmetics_link_verified(p_user uuid,p_uuid text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id=p_user and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now())) then raise exception 'Verified account required' using errcode='42501'; end if;
 perform 1 from public.profiles where id=p_user for update;
 if exists(select 1 from public.cosmetic_minecraft_links where user_id=p_user and minecraft_uuid<>p_uuid) then raise exception 'Unlink the existing Minecraft account first' using errcode='22023'; end if;
 insert into public.cosmetic_minecraft_links(user_id,minecraft_uuid) values(p_user,p_uuid) on conflict(user_id) do nothing;
end $$;
-- Minimal public renderer lookup: never returns Azuria IDs, ownership, email or tokens.
create function public.cosmetics_cape(p_uuid text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',c.id,'texture',c.texture) from public.cosmetic_minecraft_links l
 join public.cosmetic_equipment e on e.user_id=l.user_id join public.cosmetic_capes c on c.id=e.cape_id
 join auth.users u on u.id=l.user_id
 where l.minecraft_uuid=p_uuid and c.enabled and (u.banned_until is null or u.banned_until<=now()) and u.email_confirmed_at is not null
$$;
create table azuria_private.cosmetic_grants (
 id bigint generated always as identity primary key, actor_id uuid not null, user_id uuid not null, cape_id text not null, owned boolean not null, created_at timestamptz not null default now()
);
alter table azuria_private.cosmetic_grants enable row level security;
revoke all on azuria_private.cosmetic_grants from public,anon,authenticated;
create function public.cosmetics_admin_grant(p_user uuid,p_cape text,p_owned boolean) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := azuria_private.require_admin();
begin
 if p_owned is null then raise exception 'Choose grant or revoke' using errcode='22023'; end if;
 if p_owned then insert into public.cosmetic_ownership(user_id,cape_id) values(p_user,p_cape) on conflict do nothing;
 else delete from public.cosmetic_ownership where user_id=p_user and cape_id=p_cape; end if;
 insert into azuria_private.cosmetic_grants(actor_id,user_id,cape_id,owned) values(actor,p_user,p_cape,p_owned);
end $$;
revoke all on function public.cosmetics_snapshot(),public.cosmetics_claim(text),public.cosmetics_equip(text),public.cosmetics_unlink(),public.cosmetics_link_verified(uuid,text),public.cosmetics_cape(text),public.cosmetics_admin_grant(uuid,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.cosmetics_snapshot(),public.cosmetics_claim(text),public.cosmetics_equip(text),public.cosmetics_unlink(),public.cosmetics_admin_grant(uuid,text,boolean) to authenticated;
grant execute on function public.cosmetics_link_verified(uuid,text) to service_role;
grant execute on function public.cosmetics_cape(text) to anon,authenticated;
insert into public.cosmetic_capes(id,name,description,texture,claimable) values
 ('azuria-starter','Azuria Starter','A free Azuria cape. Claim it for your wardrobe.','azuria-starter.png',true);
commit;
