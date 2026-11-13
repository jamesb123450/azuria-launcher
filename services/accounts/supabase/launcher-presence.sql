begin;

create table if not exists azuria_private.launcher_status (
  account_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null check (status in ('online', 'away', 'busy', 'offline')),
  seen_at timestamptz not null
);

create table if not exists azuria_private.launcher_typing (
  sender_id uuid primary key references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null
);

alter table azuria_private.launcher_status enable row level security;
alter table azuria_private.launcher_typing enable row level security;
revoke all on azuria_private.launcher_status, azuria_private.launcher_typing from public, anon, authenticated;

create or replace function public.launcher_presence(
  p_status text, p_target uuid, p_typing boolean
) returns jsonb
language plpgsql security definer set search_path to ''
as $function$
declare
  actor uuid := azuria_private.social_actor();
  current_status text;
  friend_states jsonb;
  peer_typing boolean := false;
begin
  if p_status is not null then
    insert into azuria_private.launcher_status as s (account_id, status, seen_at)
      values (actor, p_status, now())
      on conflict (account_id) do update
        set status = excluded.status, seen_at = excluded.seen_at;
  end if;
  select s.status into current_status
    from azuria_private.launcher_status s where s.account_id = actor;

  if p_typing is false then
    delete from azuria_private.launcher_typing t
      where t.sender_id = actor and t.recipient_id = p_target;
  end if;
  if p_target is not null and exists (
    select 1 from public.friendships f
    where f.user_low = least(actor, p_target) and f.user_high = greatest(actor, p_target)
      and not azuria_private.pair_blocked(actor, p_target)
  ) then
    if p_typing is true and current_status is distinct from 'offline' then
      insert into azuria_private.launcher_typing (sender_id, recipient_id, expires_at)
        values (actor, p_target, now() + interval '7 seconds')
        on conflict (sender_id) do update
          set recipient_id = excluded.recipient_id, expires_at = excluded.expires_at;
    end if;
    select exists (
      select 1 from azuria_private.launcher_typing t
      join azuria_private.launcher_status s on s.account_id = t.sender_id
      where t.sender_id = p_target and t.recipient_id = actor
        and t.expires_at > now() and s.status <> 'offline'
        and s.seen_at > now() - interval '90 seconds'
    ) into peer_typing;
  end if;

  if p_status is not null or p_target is null then
    select coalesce(jsonb_object_agg(s.account_id, s.status), '{}'::jsonb)
      into friend_states
    from public.friendships f
    join azuria_private.launcher_status s
      on s.account_id = case when f.user_low = actor then f.user_high else f.user_low end
    where actor in (f.user_low, f.user_high)
      and s.seen_at > now() - interval '90 seconds'
      and s.status <> 'offline'
      and not azuria_private.pair_blocked(actor, s.account_id);
  end if;

  return jsonb_build_object(
    'status', coalesce(current_status, 'online'),
    'friends', friend_states,
    'typing', peer_typing
  );
end;
$function$;

revoke all on function public.launcher_presence(text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.launcher_presence(text, uuid, boolean) to authenticated;

commit;
