begin;

-- PostgREST upsert includes id in its conflict update. RLS still requires id = auth.uid().
grant update (id) on public.profiles to authenticated;

create schema if not exists azuria_private;
revoke all on schema azuria_private from public, anon, authenticated;

create table public.friend_requests (
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (sender_id, recipient_id),
  check (sender_id <> recipient_id)
);
-- A crossed request remains pending; it never silently accepts a friendship.
create unique index friend_requests_pair on public.friend_requests
  (least(sender_id, recipient_id), greatest(sender_id, recipient_id));
create index friend_requests_recipient on public.friend_requests(recipient_id, created_at);

create table public.friendships (
  user_low uuid not null references public.profiles(id) on delete cascade,
  user_high uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_low, user_high),
  check (user_low < user_high)
);
create index friendships_high on public.friendships(user_high);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index user_blocks_blocked on public.user_blocks(blocked_id);

create table azuria_private.social_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  window_start timestamptz not null,
  hits integer not null,
  primary key (user_id, action)
);
revoke all on azuria_private.social_limits from public, anon, authenticated;

alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.user_blocks enable row level security;
revoke all on public.friend_requests, public.friendships, public.user_blocks from public, anon, authenticated;
grant select on public.friend_requests, public.friendships, public.user_blocks to authenticated;
grant all on public.friend_requests, public.friendships, public.user_blocks to service_role;
create policy "Read own requests" on public.friend_requests for select to authenticated
  using ((select auth.uid()) in (sender_id, recipient_id));
create policy "Read own friendships" on public.friendships for select to authenticated
  using ((select auth.uid()) in (user_low, user_high));
create policy "Read own blocks" on public.user_blocks for select to authenticated
  using ((select auth.uid()) = blocker_id);

-- Helpers are inaccessible to API clients. Definer functions always use a fixed path.
create function azuria_private.social_actor() returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null or not exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = actor and u.email_confirmed_at is not null
  ) then
    raise exception 'Sign in with a verified Azuria profile first' using errcode = '42501';
  end if;
  return actor;
end;
$$;

create function azuria_private.social_limit(actor uuid, operation text, maximum integer, seconds integer)
returns void language plpgsql security definer set search_path = '' as $$
declare bucket timestamptz := to_timestamp(floor(extract(epoch from now()) / seconds) * seconds);
        total integer;
begin
  insert into azuria_private.social_limits as limits(user_id, action, window_start, hits)
  values (actor, operation, bucket, 1)
  on conflict (user_id, action) do update set
    window_start = excluded.window_start,
    hits = case when limits.window_start = excluded.window_start then limits.hits + 1 else 1 end
  returning hits into total;
  if total > maximum then
    raise exception 'Too many requests. Try again later' using errcode = 'P0001';
  end if;
end;
$$;

create function azuria_private.lock_friend_pair(actor uuid, target uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if target is null or actor = target then
    raise exception 'Choose another Azuria account' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(least(actor, target)::text || ':' || greatest(actor, target)::text, 711));
end;
$$;

create function azuria_private.pair_blocked(actor uuid, target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.user_blocks
    where (blocker_id = actor and blocked_id = target) or (blocker_id = target and blocked_id = actor));
$$;

create function public.find_friend(p_username text)
returns table (id uuid, username text, display_name text, relationship text)
language plpgsql security definer set search_path = '' as $$
declare actor uuid := azuria_private.social_actor();
begin
  perform azuria_private.social_limit(actor, 'lookup', 60, 60);
  if p_username is null or length(p_username) > 24 then return; end if;
  return query select p.id, p.username, p.display_name,
    case when exists(select 1 from public.friendships f where f.user_low = least(actor, p.id) and f.user_high = greatest(actor, p.id)) then 'friend'
      when exists(select 1 from public.friend_requests r where r.sender_id = actor and r.recipient_id = p.id) then 'outgoing'
      when exists(select 1 from public.friend_requests r where r.sender_id = p.id and r.recipient_id = actor) then 'incoming'
      else 'none' end
    from public.profiles p
    where p.username = lower(btrim(p_username)) and p.id <> actor
      and not azuria_private.pair_blocked(actor, p.id)
      and exists(select 1 from auth.users u where u.id = p.id and u.email_confirmed_at is not null);
end;
$$;

create function public.send_friend_request(p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := azuria_private.social_actor();
begin
  perform azuria_private.lock_friend_pair(actor, p_target);
  perform azuria_private.social_limit(actor, 'send', 20, 3600);
  if azuria_private.pair_blocked(actor, p_target) or not exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = p_target and u.email_confirmed_at is not null
  ) then raise exception 'This account is unavailable' using errcode = '22023'; end if;
  if exists(select 1 from public.friendships where user_low = least(actor, p_target) and user_high = greatest(actor, p_target)) then
    raise exception 'You are already friends' using errcode = '22023';
  end if;
  if exists(select 1 from public.friend_requests where least(sender_id, recipient_id) = least(actor, p_target) and greatest(sender_id, recipient_id) = greatest(actor, p_target)) then
    raise exception 'A friend request is already pending' using errcode = '22023';
  end if;
  insert into public.friend_requests(sender_id, recipient_id) values (actor, p_target);
end;
$$;

create function public.respond_friend_request(p_sender uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := azuria_private.social_actor();
begin
  if p_accept is null then raise exception 'Choose accept or decline' using errcode = '22023'; end if;
  perform azuria_private.lock_friend_pair(actor, p_sender);
  perform azuria_private.social_limit(actor, 'respond', 60, 60);
  delete from public.friend_requests where sender_id = p_sender and recipient_id = actor;
  if not found then raise exception 'This request is no longer available' using errcode = '22023'; end if;
  if p_accept then
    if azuria_private.pair_blocked(actor, p_sender) then raise exception 'This request is no longer available' using errcode = '22023'; end if;
    insert into public.friendships(user_low, user_high) values (least(actor, p_sender), greatest(actor, p_sender));
  end if;
end;
$$;

create function public.cancel_friend_request(p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := azuria_private.social_actor();
begin
  perform azuria_private.lock_friend_pair(actor, p_target);
  delete from public.friend_requests where sender_id = actor and recipient_id = p_target;
end;
$$;

create function public.remove_friend(p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := azuria_private.social_actor();
begin
  perform azuria_private.lock_friend_pair(actor, p_target);
  delete from public.friendships where user_low = least(actor, p_target) and user_high = greatest(actor, p_target);
end;
$$;

create function public.block_user(p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := azuria_private.social_actor();
begin
  perform azuria_private.lock_friend_pair(actor, p_target);
  perform azuria_private.social_limit(actor, 'block', 60, 60);
  if not exists(select 1 from public.profiles where id = p_target) then raise exception 'This account is unavailable' using errcode = '22023'; end if;
  insert into public.user_blocks(blocker_id, blocked_id) values (actor, p_target) on conflict do nothing;
  delete from public.friend_requests where least(sender_id, recipient_id) = least(actor, p_target) and greatest(sender_id, recipient_id) = greatest(actor, p_target);
  delete from public.friendships where user_low = least(actor, p_target) and user_high = greatest(actor, p_target);
end;
$$;

create function public.unblock_user(p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := azuria_private.social_actor();
begin
  perform azuria_private.lock_friend_pair(actor, p_target);
  delete from public.user_blocks where blocker_id = actor and blocked_id = p_target;
end;
$$;

-- One authorised snapshot: names are included only for relationships belonging to the caller.
-- Profile RLS stays private; this does not expose emails or the full profile directory.
create function public.friend_snapshot()
returns table (kind text, account_id uuid, username text, display_name text, since timestamptz)
language plpgsql security definer set search_path = '' as $$
declare actor uuid := azuria_private.social_actor();
begin
  return query
    select 'friend'::text, p.id, p.username, p.display_name, f.created_at
      from public.friendships f join public.profiles p on p.id = case when f.user_low = actor then f.user_high else f.user_low end
      where actor in (f.user_low, f.user_high) and not azuria_private.pair_blocked(actor, p.id)
    union all
    select case when r.sender_id = actor then 'outgoing' else 'incoming' end, p.id, p.username, p.display_name, r.created_at
      from public.friend_requests r join public.profiles p on p.id = case when r.sender_id = actor then r.recipient_id else r.sender_id end
      where actor in (r.sender_id, r.recipient_id) and not azuria_private.pair_blocked(actor, p.id)
    union all
    select 'blocked'::text, p.id, p.username, p.display_name, b.created_at
      from public.user_blocks b join public.profiles p on p.id = b.blocked_id where b.blocker_id = actor;
end;
$$;

revoke all on all functions in schema azuria_private from public, anon, authenticated;
revoke all on function public.find_friend(text), public.send_friend_request(uuid),
  public.respond_friend_request(uuid,boolean), public.cancel_friend_request(uuid),
  public.remove_friend(uuid), public.block_user(uuid), public.unblock_user(uuid),
  public.friend_snapshot() from public, anon, authenticated;
grant execute on function public.find_friend(text), public.send_friend_request(uuid),
  public.respond_friend_request(uuid,boolean), public.cancel_friend_request(uuid),
  public.remove_friend(uuid), public.block_user(uuid), public.unblock_user(uuid),
  public.friend_snapshot() to authenticated;

-- Presence, messages and realtime publication are intentionally added with their consumers.
notify pgrst, 'reload schema';
commit;
