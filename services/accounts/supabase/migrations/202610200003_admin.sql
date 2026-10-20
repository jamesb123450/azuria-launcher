begin;

create table public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_roles enable row level security;
revoke all on public.admin_roles from public, anon, authenticated;
grant all on public.admin_roles to service_role;

create table public.admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  target_id uuid not null,
  action text not null check (action in ('suspend', 'restore')),
  reason text not null check (char_length(btrim(reason)) between 5 and 300),
  outcome text not null default 'pending' check (outcome in ('pending', 'succeeded', 'failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
-- Keep history after account deletion. UUIDs are retained; emails/passwords/tokens are not logged.
create index admin_audit_created on public.admin_audit(created_at desc, id);
create unique index admin_audit_pending_target on public.admin_audit(target_id) where outcome = 'pending';
alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from public, anon, authenticated;
grant all on public.admin_audit to service_role;

-- Checking the live session makes revocation effective without waiting for JWT expiry.
create function public.admin_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admin_roles r join auth.users u on u.id = r.user_id
    join auth.sessions s on s.user_id = u.id
    where r.user_id = auth.uid() and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= now())
      and s.id::text = auth.jwt()->>'session_id'
  );
$$;

create function azuria_private.require_admin(fresh boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if not public.admin_access() or coalesce(auth.jwt()->>'aal', '') <> 'aal2' then
    raise exception 'Admin access requires a verified account and authenticator code' using errcode = '42501';
  end if;
  if fresh and not exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) method
    where method->>'method' = 'password'
      and to_timestamp((method->>'timestamp')::double precision) > now() - interval '10 minutes'
      and to_timestamp((method->>'timestamp')::double precision) <= now() + interval '1 minute'
  ) then raise exception 'Verify your password again before changing an account' using errcode = '42501'; end if;
  return auth.uid();
end;
$$;

create function public.admin_overview() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform azuria_private.require_admin();
  return (select jsonb_build_object('accounts', count(*),
    'verified', count(*) filter (where email_confirmed_at is not null),
    'suspended', count(*) filter (where banned_until > now())) from auth.users);
end;
$$;

create function public.admin_accounts(p_search text default '', p_offset integer default 0)
returns table (id uuid, email text, username text, display_name text, created_at timestamptz,
  verified boolean, banned_until timestamptz, is_admin boolean)
language plpgsql security definer set search_path = '' as $$
declare needle text := lower(btrim(coalesce(p_search, '')));
begin
  perform azuria_private.require_admin();
  if length(needle) > 254 or p_offset is null or p_offset < 0 or p_offset > 10000 then
    raise exception 'Invalid search or page' using errcode = '22023'; end if;
  return query select u.id, u.email::text, p.username, p.display_name, u.created_at,
    u.email_confirmed_at is not null, u.banned_until,
    exists(select 1 from public.admin_roles r where r.user_id = u.id)
  from auth.users u left join public.profiles p on p.id = u.id
  where needle = '' or left(lower(coalesce(u.email, '')), length(needle)) = needle
    or left(coalesce(p.username, ''), length(needle)) = needle or u.id::text = needle
  order by u.created_at desc, u.id limit 25 offset p_offset;
end;
$$;

create function public.admin_history(p_offset integer default 0)
returns setof public.admin_audit
language plpgsql security definer set search_path = '' as $$
begin
  perform azuria_private.require_admin();
  if p_offset is null or p_offset < 0 or p_offset > 10000 then raise exception 'Invalid page' using errcode = '22023'; end if;
  return query select * from public.admin_audit order by created_at desc, id limit 25 offset p_offset;
end;
$$;

-- Record intent before the Auth Admin API is called. A pending record never claims success.
create function public.admin_prepare_action(p_target uuid, p_action text, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := azuria_private.require_admin(true); audit_id uuid;
begin
  if p_target is null or p_target = actor or exists(select 1 from public.admin_roles where user_id = p_target) then
    raise exception 'Admin accounts and your own account are protected' using errcode = '42501'; end if;
  if not exists(select 1 from auth.users where id = p_target) then raise exception 'Account not found' using errcode = '22023'; end if;
  if p_action is null or p_action not in ('suspend', 'restore') or p_reason is null or char_length(btrim(p_reason)) not between 5 and 300 then
    raise exception 'Choose an action and a reason between 5 and 300 characters' using errcode = '22023'; end if;
  perform azuria_private.social_limit(actor, 'admin_action', 20, 60);
  insert into public.admin_audit(actor_id, target_id, action, reason)
    values (actor, p_target, p_action, btrim(p_reason)) returning id into audit_id;
  return audit_id;
end;
$$;

create function public.admin_finish_action(p_audit uuid, p_success boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_success is null then raise exception 'Missing result' using errcode = '22023'; end if;
  update public.admin_audit set outcome = case when p_success then 'succeeded' else 'failed' end, completed_at = now()
    where id = p_audit and outcome = 'pending';
  if not found then raise exception 'Action is not pending' using errcode = '22023'; end if;
end;
$$;

-- Suspended users cannot use the friends RPCs even with an unexpired old JWT.
create or replace function azuria_private.social_actor() returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null or not exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = actor and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until <= now())
  ) then raise exception 'Sign in with a verified Azuria profile first' using errcode = '42501'; end if;
  return actor;
end;
$$;

revoke all on function azuria_private.require_admin(boolean) from public, anon, authenticated;
revoke all on function public.admin_access(), public.admin_overview(), public.admin_accounts(text,integer),
  public.admin_history(integer), public.admin_prepare_action(uuid,text,text), public.admin_finish_action(uuid,boolean)
  from public, anon, authenticated;
grant execute on function public.admin_access(), public.admin_overview(), public.admin_accounts(text,integer),
  public.admin_history(integer), public.admin_prepare_action(uuid,text,text) to authenticated;
grant execute on function public.admin_finish_action(uuid,boolean) to service_role;
notify pgrst, 'reload schema';
commit;
