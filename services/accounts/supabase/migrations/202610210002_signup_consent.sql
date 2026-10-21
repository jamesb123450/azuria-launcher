begin;
create table public.signup_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  accepted_at timestamptz not null default now(),
  legal_version text not null default '2026-10-21',
  marketing_opt_in boolean not null default false,
  marketing_synced_at timestamptz
);
alter table public.signup_consents enable row level security;
revoke all on public.signup_consents from public, anon, authenticated;
grant all on public.signup_consents to service_role;

-- Capture once from registration. Later user_metadata edits cannot change consent.
create function public.capture_signup_consent()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.raw_user_meta_data->'legal_accepted' is distinct from 'true'::jsonb then
    raise exception 'Terms and privacy acceptance is required';
  end if;
  insert into public.signup_consents(user_id, marketing_opt_in)
  values (new.id, coalesce(new.raw_user_meta_data->'marketing_opt_in' = 'true'::jsonb, false));
  return new;
end;
$$;
revoke all on function public.capture_signup_consent() from public, anon, authenticated;
create trigger capture_signup_consent after insert on auth.users
for each row execute function public.capture_signup_consent();
-- Filter verified users before limiting, so unverified signups cannot block the queue.
create function public.pending_marketing_contacts()
returns table(user_id uuid, email text) language sql security definer set search_path = '' as $$
  select c.user_id, u.email::text from public.signup_consents c
  join auth.users u on u.id = c.user_id
  where c.marketing_opt_in and c.marketing_synced_at is null
    and u.email_confirmed_at is not null and u.email is not null
  order by c.accepted_at limit 10;
$$;
revoke all on function public.pending_marketing_contacts() from public, anon, authenticated;
grant execute on function public.pending_marketing_contacts() to service_role;
commit;
