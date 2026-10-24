begin;
create table public.message_keys (
  account_id uuid primary key references public.profiles(id) on delete cascade,
  public_key text not null check (length(public_key)=44 and public_key ~ '^[A-Za-z0-9+/]{43}=$'),
  created_at timestamptz not null default now()
);
alter table public.message_keys enable row level security;
revoke all on public.message_keys from public, anon, authenticated;
grant all on public.message_keys to service_role;

create function public.message_key(p_target uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare actor uuid := azuria_private.social_actor(); result text;
begin
  if p_target <> actor then perform azuria_private.message_friend(actor,p_target); end if;
  select public_key into result from public.message_keys where account_id=p_target;
  return result;
end;
$$;
create function public.message_register_key(p_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := azuria_private.social_actor(); existing text;
begin
  perform pg_advisory_xact_lock(hashtextextended(actor::text,712));
  if p_key is null or length(p_key)<>44 or p_key !~ '^[A-Za-z0-9+/]{43}=$' then
    raise exception 'Invalid encryption key' using errcode='22023'; end if;
  select public_key into existing from public.message_keys where account_id=actor;
  if existing is not null and existing<>p_key then raise exception 'Restore the existing encryption key' using errcode='22023'; end if;
  insert into public.message_keys(account_id,public_key) values(actor,p_key) on conflict do nothing;
end;
$$;

alter table public.direct_messages alter column body drop not null;
alter table public.direct_messages add column encrypted jsonb;
alter table public.direct_messages add constraint message_encoding check (
  (body is not null and encrypted is null) or (body is null and encrypted is not null)
);
-- Fail closed for older clients: never silently fall back to storing plain text.
create or replace function public.message_send(p_target uuid,p_client_id uuid,p_body text)
returns setof public.direct_messages language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'Update the launcher to use encrypted messaging' using errcode='22023';
end;
$$;
create function public.message_send_encrypted(p_target uuid,p_client_id uuid,p_payload jsonb)
returns setof public.direct_messages language plpgsql security definer set search_path = '' as $$
declare actor uuid := azuria_private.social_actor(); existing public.direct_messages;
begin
  perform azuria_private.message_friend(actor,p_target);
  if p_client_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object'
    or octet_length(p_payload::text)>16000 then raise exception 'Invalid encrypted message' using errcode='22023'; end if;
  if (select count(*) from jsonb_object_keys(p_payload))<>3 or p_payload->'v'<>'1'::jsonb
    or jsonb_typeof(p_payload->'n')<>'string' or length(p_payload->>'n')<>32 or (p_payload->>'n') !~ '^[A-Za-z0-9+/]{32}$'
    or jsonb_typeof(p_payload->'c')<>'string' or length(p_payload->>'c') not between 24 and 14000
    or (p_payload->>'c') !~ '^[A-Za-z0-9+/]+={0,2}$'
    or not (p_payload ?& array['v','n','c']) then raise exception 'Invalid encrypted message' using errcode='22023'; end if;
  if not exists(select 1 from public.message_keys where account_id=actor)
    or not exists(select 1 from public.message_keys where account_id=p_target)
    then raise exception 'Both accounts need encryption keys' using errcode='22023'; end if;
  select * into existing from public.direct_messages where sender_id=actor and client_id=p_client_id;
  if found then
    if existing.recipient_id<>p_target or existing.encrypted is null then raise exception 'Message retry does not match' using errcode='22023'; end if;
    return next existing; return;
  end if;
  perform azuria_private.social_limit(actor,'message',30,60);
  return query insert into public.direct_messages(sender_id,recipient_id,client_id,encrypted)
    values(actor,p_target,p_client_id,p_payload) returning *;
end;
$$;
revoke all on function public.message_key(uuid),public.message_register_key(text),public.message_send_encrypted(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.message_key(uuid),public.message_register_key(text),public.message_send_encrypted(uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
