begin;
create table public.direct_messages (
  id bigint generated always as identity primary key,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null,
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> recipient_id),
  unique(sender_id, client_id)
);
create index direct_messages_pair on public.direct_messages
  (least(sender_id, recipient_id), greatest(sender_id, recipient_id), id desc);
create index direct_messages_unread on public.direct_messages(recipient_id, sender_id) where read_at is null;
alter table public.direct_messages enable row level security;
revoke all on public.direct_messages from public, anon, authenticated;
grant all on public.direct_messages to service_role;

create function azuria_private.message_friend(actor uuid, target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform azuria_private.lock_friend_pair(actor, target);
  if azuria_private.pair_blocked(actor, target) or not exists (
    select 1 from public.friendships where user_low = least(actor,target) and user_high = greatest(actor,target)
  ) then raise exception 'Messaging requires an accepted friendship' using errcode = '22023'; end if;
end;
$$;

create function public.message_send(p_target uuid, p_client_id uuid, p_body text)
returns setof public.direct_messages language plpgsql security definer set search_path = '' as $$
declare actor uuid := azuria_private.social_actor(); existing public.direct_messages;
begin
  perform azuria_private.message_friend(actor, p_target);
  if p_client_id is null or p_body is null or length(btrim(p_body)) not between 1 and 2000 then
    raise exception 'Message must contain 1–2000 characters' using errcode = '22023'; end if;
  select * into existing from public.direct_messages where sender_id = actor and client_id = p_client_id;
  if found then
    if existing.recipient_id <> p_target or existing.body <> btrim(p_body) then
      raise exception 'Message retry does not match' using errcode = '22023'; end if;
    return next existing; return;
  end if;
  perform azuria_private.social_limit(actor, 'message', 30, 60);
  return query insert into public.direct_messages(sender_id,recipient_id,client_id,body)
    values(actor,p_target,p_client_id,btrim(p_body)) returning *;
end;
$$;

create function public.message_history(p_target uuid, p_before bigint default null)
returns setof public.direct_messages language plpgsql security definer set search_path = '' as $$
declare actor uuid := azuria_private.social_actor();
begin
  perform azuria_private.message_friend(actor, p_target);
  return query select * from public.direct_messages m
    where least(m.sender_id,m.recipient_id) = least(actor,p_target)
      and greatest(m.sender_id,m.recipient_id) = greatest(actor,p_target)
      and (p_before is null or m.id < p_before)
    order by m.id desc limit 50;
end;
$$;

create function public.message_read(p_target uuid, p_through bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := azuria_private.social_actor();
begin
  perform azuria_private.message_friend(actor, p_target);
  update public.direct_messages set read_at = now()
    where sender_id = p_target and recipient_id = actor and id <= p_through and read_at is null;
end;
$$;

create function public.message_unread() returns table(account_id uuid, unread bigint)
language plpgsql security definer set search_path = '' as $$
declare actor uuid := azuria_private.social_actor();
begin
  return query select m.sender_id, count(*) from public.direct_messages m
    join public.friendships f on f.user_low = least(actor,m.sender_id) and f.user_high = greatest(actor,m.sender_id)
    where m.recipient_id = actor and m.read_at is null and not azuria_private.pair_blocked(actor,m.sender_id)
    group by m.sender_id;
end;
$$;
revoke all on function azuria_private.message_friend(uuid,uuid) from public, anon, authenticated;
revoke all on function public.message_send(uuid,uuid,text), public.message_history(uuid,bigint),
  public.message_read(uuid,bigint), public.message_unread() from public, anon, authenticated;
grant execute on function public.message_send(uuid,uuid,text), public.message_history(uuid,bigint),
  public.message_read(uuid,bigint), public.message_unread() to authenticated;
notify pgrst, 'reload schema';
commit;
