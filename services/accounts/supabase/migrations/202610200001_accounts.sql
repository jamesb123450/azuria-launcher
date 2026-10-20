begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (id, username, display_name) on public.profiles to authenticated;
grant update (username, display_name) on public.profiles to authenticated;
grant all on public.profiles to service_role;
create policy "Read own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "Create own profile" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "Update own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- No signup trigger: username collisions never prevent email-account creation.
-- Users claim a unique username after verifying their email. Metadata is only a suggestion.
create table public.desktop_grants (
  code_hash text primary key check (code_hash ~ '^[A-Za-z0-9_-]{43}$'),
  challenge text not null check (challenge ~ '^[A-Za-z0-9_-]{43}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 minutes'),
  used_at timestamptz
);
create index desktop_grants_user_created on public.desktop_grants(user_id, created_at);
alter table public.desktop_grants enable row level security;
revoke all on public.desktop_grants from public, anon, authenticated;
grant all on public.desktop_grants to service_role;

create function public.issue_desktop_grant(p_user uuid, p_hash text, p_challenge text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  delete from public.desktop_grants where created_at < now() - interval '5 minutes';
  if (select count(*) from public.desktop_grants where user_id = p_user and created_at > now() - interval '5 minutes') >= 10 then
    raise exception 'Too many connection attempts' using errcode = 'P0001';
  end if;
  insert into public.desktop_grants(code_hash, challenge, user_id) values (p_hash, p_challenge, p_user);
end;
$$;
create function public.consume_desktop_grant(p_hash text, p_challenge text)
returns uuid language sql security definer set search_path = '' as $$
  update public.desktop_grants set used_at = now()
  where code_hash = p_hash and challenge = p_challenge and expires_at > now() and used_at is null
  returning user_id;
$$;
revoke all on function public.issue_desktop_grant(uuid,text,text) from public, anon, authenticated;
revoke all on function public.consume_desktop_grant(text,text) from public, anon, authenticated;
grant execute on function public.issue_desktop_grant(uuid,text,text) to service_role;
grant execute on function public.consume_desktop_grant(text,text) to service_role;
commit;
