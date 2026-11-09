-- Azuria beta database schema. Fresh Supabase projects and isolated tests only.

-- This is the current schema, not an upgrade script. Do not run against an existing project.

-- Supabase supplies auth.*, storage.*, anon, authenticated and service_role.

begin;

set local check_function_bodies = false;

create schema azuria_private;

revoke all on schema azuria_private from public, anon, authenticated;

create table "azuria_private"."social_limits" (
  "user_id" uuid not null,
  "action" text not null,
  "window_start" timestamp with time zone not null,
  "hits" integer not null
);

create table "public"."admin_audit" (
  "id" uuid default gen_random_uuid() not null,
  "actor_id" uuid not null,
  "target_id" uuid not null,
  "action" text not null,
  "reason" text not null,
  "outcome" text default 'pending'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "completed_at" timestamp with time zone
);

create table "public"."admin_roles" (
  "user_id" uuid not null,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."desktop_grants" (
  "code_hash" text not null,
  "challenge" text not null,
  "user_id" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  "expires_at" timestamp with time zone default (now() + '00:02:00'::interval) not null,
  "used_at" timestamp with time zone
);

create table "public"."direct_messages" (
  "id" bigint generated always as identity not null,
  "sender_id" uuid not null,
  "recipient_id" uuid not null,
  "client_id" uuid not null,
  "body" text,
  "created_at" timestamp with time zone default now() not null,
  "read_at" timestamp with time zone,
  "encrypted" jsonb
);

create table "public"."friend_requests" (
  "sender_id" uuid not null,
  "recipient_id" uuid not null,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."friendships" (
  "user_low" uuid not null,
  "user_high" uuid not null,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."launcher_feedback" (
  "id" uuid not null,
  "version" integer not null,
  "answers" jsonb not null,
  "submitted_on" date default CURRENT_DATE not null,
  "extra_feedback" text default ''::text not null
);

create table "public"."message_keys" (
  "account_id" uuid not null,
  "public_key" text not null,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."news_history" (
  "id" bigint generated always as identity not null,
  "post_id" uuid not null,
  "actor_id" uuid not null,
  "revision" integer not null,
  "status" text not null,
  "changed_at" timestamp with time zone default now() not null
);

create table "public"."news_posts" (
  "id" uuid default gen_random_uuid() not null,
  "slug" text not null,
  "title" text not null,
  "summary" text default ''::text not null,
  "body" text default ''::text not null,
  "cover_path" text default ''::text not null,
  "cover_alt" text default ''::text not null,
  "accent" text default 'pink'::text not null,
  "image_position" text default 'center'::text not null,
  "reading_width" text default 'comfortable'::text not null,
  "status" text default 'draft'::text not null,
  "author_id" uuid not null,
  "author_username" text not null,
  "created_at" timestamp with time zone default now() not null,
  "published_at" timestamp with time zone,
  "updated_at" timestamp with time zone default now() not null,
  "revision" integer default 1 not null
);

create table "public"."profiles" (
  "id" uuid not null,
  "username" text not null,
  "display_name" text not null,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."signup_consents" (
  "user_id" uuid not null,
  "accepted_at" timestamp with time zone default now() not null,
  "legal_version" text default '2026-10-21'::text not null,
  "marketing_opt_in" boolean default false not null,
  "marketing_synced_at" timestamp with time zone
);

create table "public"."sponsor_ad_history" (
  "id" bigint generated always as identity not null,
  "ad_id" uuid not null,
  "actor_id" uuid not null,
  "revision" integer not null,
  "changed_at" timestamp with time zone default now() not null,
  "action" text default 'saved'::text not null
);

create table "public"."sponsor_ads" (
  "id" uuid default gen_random_uuid() not null,
  "title" text not null,
  "image_path" text not null,
  "image_alt" text not null,
  "destination" text not null,
  "slots" text[] not null,
  "enabled" boolean default false not null,
  "starts_at" timestamp with time zone not null,
  "ends_at" timestamp with time zone,
  "revision" integer default 1 not null,
  "updated_at" timestamp with time zone default now() not null
);

create table "public"."user_blocks" (
  "blocker_id" uuid not null,
  "blocked_id" uuid not null,
  "created_at" timestamp with time zone default now() not null
);

alter table "azuria_private"."social_limits" add constraint "social_limits_pkey" PRIMARY KEY (user_id, action);

revoke all on table "azuria_private"."social_limits" from public, anon, authenticated, service_role;

alter table "public"."admin_audit" add constraint "admin_audit_action_check" CHECK ((action = ANY (ARRAY['suspend'::text, 'restore'::text])));

alter table "public"."admin_audit" add constraint "admin_audit_outcome_check" CHECK ((outcome = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text])));

alter table "public"."admin_audit" add constraint "admin_audit_reason_check" CHECK (((char_length(btrim(reason)) >= 5) AND (char_length(btrim(reason)) <= 300)));

alter table "public"."admin_audit" add constraint "admin_audit_pkey" PRIMARY KEY (id);

alter table "public"."admin_audit" enable row level security;

revoke all on table "public"."admin_audit" from public, anon, authenticated, service_role;

grant ALL on table "public"."admin_audit" to "service_role";

alter table "public"."admin_roles" add constraint "admin_roles_pkey" PRIMARY KEY (user_id);

alter table "public"."admin_roles" enable row level security;

revoke all on table "public"."admin_roles" from public, anon, authenticated, service_role;

grant ALL on table "public"."admin_roles" to "service_role";

alter table "public"."desktop_grants" add constraint "desktop_grants_challenge_check" CHECK ((challenge ~ '^[A-Za-z0-9_-]{43}$'::text));

alter table "public"."desktop_grants" add constraint "desktop_grants_code_hash_check" CHECK ((code_hash ~ '^[A-Za-z0-9_-]{43}$'::text));

alter table "public"."desktop_grants" add constraint "desktop_grants_pkey" PRIMARY KEY (code_hash);

alter table "public"."desktop_grants" enable row level security;

revoke all on table "public"."desktop_grants" from public, anon, authenticated, service_role;

grant ALL on table "public"."desktop_grants" to "service_role";

alter table "public"."direct_messages" add constraint "direct_messages_body_check" CHECK (((length(btrim(body)) >= 1) AND (length(btrim(body)) <= 2000)));

alter table "public"."direct_messages" add constraint "direct_messages_check" CHECK ((sender_id <> recipient_id));

alter table "public"."direct_messages" add constraint "message_encoding" CHECK ((((body IS NOT NULL) AND (encrypted IS NULL)) OR ((body IS NULL) AND (encrypted IS NOT NULL))));

alter table "public"."direct_messages" add constraint "direct_messages_pkey" PRIMARY KEY (id);

alter table "public"."direct_messages" add constraint "direct_messages_sender_id_client_id_key" UNIQUE (sender_id, client_id);

alter table "public"."direct_messages" enable row level security;

revoke all on table "public"."direct_messages" from public, anon, authenticated, service_role;

grant ALL on table "public"."direct_messages" to "service_role";

alter table "public"."friend_requests" add constraint "friend_requests_check" CHECK ((sender_id <> recipient_id));

alter table "public"."friend_requests" add constraint "friend_requests_pkey" PRIMARY KEY (sender_id, recipient_id);

alter table "public"."friend_requests" enable row level security;

revoke all on table "public"."friend_requests" from public, anon, authenticated, service_role;

grant SELECT on table "public"."friend_requests" to "authenticated";

grant ALL on table "public"."friend_requests" to "service_role";

alter table "public"."friendships" add constraint "friendships_check" CHECK ((user_low < user_high));

alter table "public"."friendships" add constraint "friendships_pkey" PRIMARY KEY (user_low, user_high);

alter table "public"."friendships" enable row level security;

revoke all on table "public"."friendships" from public, anon, authenticated, service_role;

grant SELECT on table "public"."friendships" to "authenticated";

grant ALL on table "public"."friendships" to "service_role";

alter table "public"."launcher_feedback" add constraint "launcher_feedback_answers_check" CHECK ((jsonb_typeof(answers) = 'object'::text));

alter table "public"."launcher_feedback" add constraint "launcher_feedback_extra_feedback_check" CHECK ((length(extra_feedback) <= 2000));

alter table "public"."launcher_feedback" add constraint "launcher_feedback_version_check" CHECK ((version = 1));

alter table "public"."launcher_feedback" add constraint "launcher_feedback_pkey" PRIMARY KEY (id);

alter table "public"."launcher_feedback" enable row level security;

revoke all on table "public"."launcher_feedback" from public, anon, authenticated, service_role;

alter table "public"."message_keys" add constraint "message_keys_public_key_check" CHECK (((length(public_key) = 44) AND (public_key ~ '^[A-Za-z0-9+/]{43}=$'::text)));

alter table "public"."message_keys" add constraint "message_keys_pkey" PRIMARY KEY (account_id);

alter table "public"."message_keys" enable row level security;

revoke all on table "public"."message_keys" from public, anon, authenticated, service_role;

grant ALL on table "public"."message_keys" to "service_role";

alter table "public"."news_history" add constraint "news_history_pkey" PRIMARY KEY (id);

alter table "public"."news_history" enable row level security;

revoke all on table "public"."news_history" from public, anon, authenticated, service_role;

alter table "public"."news_posts" add constraint "news_posts_accent_check" CHECK ((accent = ANY (ARRAY['pink'::text, 'blue'::text, 'violet'::text])));

alter table "public"."news_posts" add constraint "news_posts_body_check" CHECK ((length(body) <= 100000));

alter table "public"."news_posts" add constraint "news_posts_check" CHECK (((status <> 'published'::text) OR ((published_at IS NOT NULL) AND (cover_path <> ''::text) AND (length(btrim(body)) > 0) AND (length(btrim(cover_alt)) > 0))));

alter table "public"."news_posts" add constraint "news_posts_cover_alt_check" CHECK ((length(cover_alt) <= 240));

alter table "public"."news_posts" add constraint "news_posts_image_position_check" CHECK ((image_position = ANY (ARRAY['top'::text, 'center'::text, 'bottom'::text])));

alter table "public"."news_posts" add constraint "news_posts_reading_width_check" CHECK ((reading_width = ANY (ARRAY['comfortable'::text, 'wide'::text])));

alter table "public"."news_posts" add constraint "news_posts_slug_check" CHECK (((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text) AND ((length(slug) >= 3) AND (length(slug) <= 100))));

alter table "public"."news_posts" add constraint "news_posts_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text])));

alter table "public"."news_posts" add constraint "news_posts_summary_check" CHECK ((length(summary) <= 320));

alter table "public"."news_posts" add constraint "news_posts_title_check" CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 160)));

alter table "public"."news_posts" add constraint "news_posts_pkey" PRIMARY KEY (id);

alter table "public"."news_posts" add constraint "news_posts_slug_key" UNIQUE (slug);

alter table "public"."news_posts" enable row level security;

revoke all on table "public"."news_posts" from public, anon, authenticated, service_role;

alter table "public"."profiles" add constraint "profiles_display_name_check" CHECK (((char_length(btrim(display_name)) >= 1) AND (char_length(btrim(display_name)) <= 40)));

alter table "public"."profiles" add constraint "profiles_username_check" CHECK ((username ~ '^[a-z0-9_]{3,24}$'::text));

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY (id);

alter table "public"."profiles" add constraint "profiles_username_key" UNIQUE (username);

alter table "public"."profiles" enable row level security;

revoke all on table "public"."profiles" from public, anon, authenticated, service_role;

grant SELECT on table "public"."profiles" to "authenticated";

grant ALL on table "public"."profiles" to "service_role";

alter table "public"."signup_consents" add constraint "signup_consents_pkey" PRIMARY KEY (user_id);

alter table "public"."signup_consents" enable row level security;

revoke all on table "public"."signup_consents" from public, anon, authenticated, service_role;

grant ALL on table "public"."signup_consents" to "service_role";

alter table "public"."sponsor_ad_history" add constraint "sponsor_ad_history_action_check" CHECK ((action = ANY (ARRAY['saved'::text, 'deleted'::text])));

alter table "public"."sponsor_ad_history" add constraint "sponsor_ad_history_pkey" PRIMARY KEY (id);

alter table "public"."sponsor_ad_history" enable row level security;

revoke all on table "public"."sponsor_ad_history" from public, anon, authenticated, service_role;

alter table "public"."sponsor_ads" add constraint "sponsor_ads_check" CHECK (((ends_at IS NULL) OR (ends_at > starts_at)));

alter table "public"."sponsor_ads" add constraint "sponsor_ads_destination_check" CHECK (((length(destination) <= 2048) AND (destination ~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}([/?#][^[:space:][:cntrl:]@]*)?$'::text)));

alter table "public"."sponsor_ads" add constraint "sponsor_ads_image_alt_check" CHECK (((length(btrim(image_alt)) >= 1) AND (length(btrim(image_alt)) <= 240)));

alter table "public"."sponsor_ads" add constraint "sponsor_ads_image_path_check" CHECK ((image_path ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(png|jpg|webp)$'::text));

alter table "public"."sponsor_ads" add constraint "sponsor_ads_slots_check" CHECK ((((cardinality(slots) >= 1) AND (cardinality(slots) <= 8)) AND (slots <@ ARRAY['home.top'::text, 'home.bottom'::text, 'library.top'::text, 'library.bottom'::text, 'social.top'::text, 'social.bottom'::text, 'monitor.top'::text, 'monitor.bottom'::text])));

alter table "public"."sponsor_ads" add constraint "sponsor_ads_title_check" CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 100)));

alter table "public"."sponsor_ads" add constraint "sponsor_ads_pkey" PRIMARY KEY (id);

alter table "public"."sponsor_ads" enable row level security;

revoke all on table "public"."sponsor_ads" from public, anon, authenticated, service_role;

alter table "public"."user_blocks" add constraint "user_blocks_check" CHECK ((blocker_id <> blocked_id));

alter table "public"."user_blocks" add constraint "user_blocks_pkey" PRIMARY KEY (blocker_id, blocked_id);

alter table "public"."user_blocks" enable row level security;

revoke all on table "public"."user_blocks" from public, anon, authenticated, service_role;

grant SELECT on table "public"."user_blocks" to "authenticated";

grant ALL on table "public"."user_blocks" to "service_role";

alter table "azuria_private"."social_limits" add constraint "social_limits_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "public"."admin_roles" add constraint "admin_roles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "public"."desktop_grants" add constraint "desktop_grants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "public"."direct_messages" add constraint "direct_messages_recipient_id_fkey" FOREIGN KEY (recipient_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table "public"."direct_messages" add constraint "direct_messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table "public"."friend_requests" add constraint "friend_requests_recipient_id_fkey" FOREIGN KEY (recipient_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table "public"."friend_requests" add constraint "friend_requests_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table "public"."friendships" add constraint "friendships_user_high_fkey" FOREIGN KEY (user_high) REFERENCES profiles(id) ON DELETE CASCADE;

alter table "public"."friendships" add constraint "friendships_user_low_fkey" FOREIGN KEY (user_low) REFERENCES profiles(id) ON DELETE CASCADE;

alter table "public"."message_keys" add constraint "message_keys_account_id_fkey" FOREIGN KEY (account_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table "public"."news_history" add constraint "news_history_post_id_fkey" FOREIGN KEY (post_id) REFERENCES news_posts(id);

alter table "public"."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

grant INSERT ("id") on table "public"."profiles" to "authenticated";

grant UPDATE ("id") on table "public"."profiles" to "authenticated";

grant INSERT ("username") on table "public"."profiles" to "authenticated";

grant UPDATE ("username") on table "public"."profiles" to "authenticated";

grant INSERT ("display_name") on table "public"."profiles" to "authenticated";

grant UPDATE ("display_name") on table "public"."profiles" to "authenticated";

alter table "public"."signup_consents" add constraint "signup_consents_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "public"."user_blocks" add constraint "user_blocks_blocked_id_fkey" FOREIGN KEY (blocked_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table "public"."user_blocks" add constraint "user_blocks_blocker_id_fkey" FOREIGN KEY (blocker_id) REFERENCES profiles(id) ON DELETE CASCADE;

CREATE INDEX admin_audit_created ON public.admin_audit USING btree (created_at DESC, id);

CREATE UNIQUE INDEX admin_audit_pending_target ON public.admin_audit USING btree (target_id) WHERE (outcome = 'pending'::text);

CREATE INDEX desktop_grants_user_created ON public.desktop_grants USING btree (user_id, created_at);

CREATE INDEX direct_messages_pair ON public.direct_messages USING btree (LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id), id DESC);

CREATE INDEX direct_messages_unread ON public.direct_messages USING btree (recipient_id, sender_id) WHERE (read_at IS NULL);

CREATE UNIQUE INDEX friend_requests_pair ON public.friend_requests USING btree (LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id));

CREATE INDEX friend_requests_recipient ON public.friend_requests USING btree (recipient_id, created_at);

CREATE INDEX friendships_high ON public.friendships USING btree (user_high);

CREATE INDEX feedback_by_date ON public.launcher_feedback USING btree (submitted_on DESC, id);

CREATE INDEX news_published ON public.news_posts USING btree (published_at DESC, id) WHERE (status = 'published'::text);

CREATE INDEX user_blocks_blocked ON public.user_blocks USING btree (blocked_id);

CREATE OR REPLACE FUNCTION public.issue_desktop_grant(p_user uuid, p_hash text, p_challenge text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  delete from public.desktop_grants where created_at < now() - interval '5 minutes';
  if (select count(*) from public.desktop_grants where user_id = p_user and created_at > now() - interval '5 minutes') >= 10 then
    raise exception 'Too many connection attempts' using errcode = 'P0001';
  end if;
  insert into public.desktop_grants(code_hash, challenge, user_id) values (p_hash, p_challenge, p_user);
end;
$function$;

revoke all on function "public"."issue_desktop_grant"(p_user uuid, p_hash text, p_challenge text) from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."issue_desktop_grant"(p_user uuid, p_hash text, p_challenge text) to "service_role";

CREATE OR REPLACE FUNCTION public.consume_desktop_grant(p_hash text, p_challenge text)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  update public.desktop_grants set used_at = now()
  where code_hash = p_hash and challenge = p_challenge and expires_at > now() and used_at is null
  returning user_id;
$function$;

revoke all on function "public"."consume_desktop_grant"(p_hash text, p_challenge text) from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."consume_desktop_grant"(p_hash text, p_challenge text) to "service_role";

CREATE OR REPLACE FUNCTION azuria_private.social_actor()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := auth.uid();
begin
  if actor is null or not exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = actor and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until <= now())
  ) then raise exception 'Sign in with a verified Azuria profile first' using errcode = '42501'; end if;
  return actor;
end;
$function$;

revoke all on function "azuria_private"."social_actor"() from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION azuria_private.social_limit(actor uuid, operation text, maximum integer, seconds integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

revoke all on function "azuria_private"."social_limit"(actor uuid, operation text, maximum integer, seconds integer) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION azuria_private.lock_friend_pair(actor uuid, target uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if target is null or actor = target then
    raise exception 'Choose another Azuria account' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(least(actor, target)::text || ':' || greatest(actor, target)::text, 711));
end;
$function$;

revoke all on function "azuria_private"."lock_friend_pair"(actor uuid, target uuid) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION azuria_private.pair_blocked(actor uuid, target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(select 1 from public.user_blocks
    where (blocker_id = actor and blocked_id = target) or (blocker_id = target and blocked_id = actor));
$function$;

revoke all on function "azuria_private"."pair_blocked"(actor uuid, target uuid) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.find_friend(p_username text)
 RETURNS TABLE(id uuid, username text, display_name text, relationship text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

revoke all on function "public"."find_friend"(p_username text) from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."find_friend"(p_username text) to "authenticated";

CREATE OR REPLACE FUNCTION public.send_friend_request(p_target uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

revoke all on function "public"."send_friend_request"(p_target uuid) from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."send_friend_request"(p_target uuid) to "authenticated";

CREATE OR REPLACE FUNCTION public.respond_friend_request(p_sender uuid, p_accept boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

revoke all on function "public"."respond_friend_request"(p_sender uuid, p_accept boolean) from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."respond_friend_request"(p_sender uuid, p_accept boolean) to "authenticated";

CREATE OR REPLACE FUNCTION public.cancel_friend_request(p_target uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := azuria_private.social_actor();
begin
  perform azuria_private.lock_friend_pair(actor, p_target);
  delete from public.friend_requests where sender_id = actor and recipient_id = p_target;
end;
$function$;

revoke all on function "public"."cancel_friend_request"(p_target uuid) from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."cancel_friend_request"(p_target uuid) to "authenticated";

CREATE OR REPLACE FUNCTION public.remove_friend(p_target uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := azuria_private.social_actor();
begin
  perform azuria_private.lock_friend_pair(actor, p_target);
  delete from public.friendships where user_low = least(actor, p_target) and user_high = greatest(actor, p_target);
end;
$function$;

revoke all on function "public"."remove_friend"(p_target uuid) from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."remove_friend"(p_target uuid) to "authenticated";

CREATE OR REPLACE FUNCTION public.block_user(p_target uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := azuria_private.social_actor();
begin
  perform azuria_private.lock_friend_pair(actor, p_target);
  perform azuria_private.social_limit(actor, 'block', 60, 60);
  if not exists(select 1 from public.profiles where id = p_target) then raise exception 'This account is unavailable' using errcode = '22023'; end if;
  insert into public.user_blocks(blocker_id, blocked_id) values (actor, p_target) on conflict do nothing;
  delete from public.friend_requests where least(sender_id, recipient_id) = least(actor, p_target) and greatest(sender_id, recipient_id) = greatest(actor, p_target);
  delete from public.friendships where user_low = least(actor, p_target) and user_high = greatest(actor, p_target);
end;
$function$;

revoke all on function "public"."block_user"(p_target uuid) from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."block_user"(p_target uuid) to "authenticated";

CREATE OR REPLACE FUNCTION public.unblock_user(p_target uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := azuria_private.social_actor();
begin
  perform azuria_private.lock_friend_pair(actor, p_target);
  delete from public.user_blocks where blocker_id = actor and blocked_id = p_target;
end;
$function$;

revoke all on function "public"."unblock_user"(p_target uuid) from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."unblock_user"(p_target uuid) to "authenticated";

CREATE OR REPLACE FUNCTION public.friend_snapshot()
 RETURNS TABLE(kind text, account_id uuid, username text, display_name text, since timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

revoke all on function "public"."friend_snapshot"() from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."friend_snapshot"() to "authenticated";

CREATE OR REPLACE FUNCTION public.admin_access()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.admin_roles r join auth.users u on u.id = r.user_id
    join auth.sessions s on s.user_id = u.id
    where r.user_id = auth.uid() and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= now())
      and s.id::text = auth.jwt()->>'session_id'
  );
$function$;

revoke all on function "public"."admin_access"() from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."admin_access"() to "authenticated";

CREATE OR REPLACE FUNCTION azuria_private.require_admin(fresh boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

revoke all on function "azuria_private"."require_admin"(fresh boolean) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform azuria_private.require_admin();
  return (select jsonb_build_object('accounts', count(*),
    'verified', count(*) filter (where email_confirmed_at is not null),
    'suspended', count(*) filter (where banned_until > now())) from auth.users);
end;
$function$;

revoke all on function "public"."admin_overview"() from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."admin_overview"() to "authenticated";

CREATE OR REPLACE FUNCTION public.admin_accounts(p_search text DEFAULT ''::text, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, email text, username text, display_name text, created_at timestamp with time zone, verified boolean, banned_until timestamp with time zone, is_admin boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

revoke all on function "public"."admin_accounts"(p_search text, p_offset integer) from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."admin_accounts"(p_search text, p_offset integer) to "authenticated";

CREATE OR REPLACE FUNCTION public.admin_history(p_offset integer DEFAULT 0)
 RETURNS SETOF admin_audit
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform azuria_private.require_admin();
  if p_offset is null or p_offset < 0 or p_offset > 10000 then raise exception 'Invalid page' using errcode = '22023'; end if;
  return query select * from public.admin_audit order by created_at desc, id limit 25 offset p_offset;
end;
$function$;

revoke all on function "public"."admin_history"(p_offset integer) from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."admin_history"(p_offset integer) to "authenticated";

CREATE OR REPLACE FUNCTION public.admin_prepare_action(p_target uuid, p_action text, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

revoke all on function "public"."admin_prepare_action"(p_target uuid, p_action text, p_reason text) from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."admin_prepare_action"(p_target uuid, p_action text, p_reason text) to "authenticated";

CREATE OR REPLACE FUNCTION public.admin_finish_action(p_audit uuid, p_success boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_success is null then raise exception 'Missing result' using errcode = '22023'; end if;
  update public.admin_audit set outcome = case when p_success then 'succeeded' else 'failed' end, completed_at = now()
    where id = p_audit and outcome = 'pending';
  if not found then raise exception 'Action is not pending' using errcode = '22023'; end if;
end;
$function$;

revoke all on function "public"."admin_finish_action"(p_audit uuid, p_success boolean) from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."admin_finish_action"(p_audit uuid, p_success boolean) to "service_role";

CREATE OR REPLACE FUNCTION public.news_public(p_slug text DEFAULT NULL::text, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, slug text, title text, summary text, body text, cover_path text, cover_alt text, accent text, image_position text, reading_width text, author_username text, published_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_offset is null or p_offset < 0 or p_offset > 10000 or length(p_slug) > 100 then
    raise exception 'Invalid news page' using errcode = '22023'; end if;
  return query select n.id,n.slug,n.title,n.summary,
    case when p_slug is null then '' else n.body end,n.cover_path,n.cover_alt,n.accent,
    n.image_position,n.reading_width,n.author_username,n.published_at,n.updated_at
    from public.news_posts n where n.status = 'published' and (p_slug is null or n.slug = p_slug)
    order by n.published_at desc,n.id limit 12 offset p_offset;
end;
$function$;

revoke all on function "public"."news_public"(p_slug text, p_offset integer) from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."news_public"(p_slug text, p_offset integer) to "anon";

grant EXECUTE on function "public"."news_public"(p_slug text, p_offset integer) to "authenticated";

CREATE OR REPLACE FUNCTION public.news_admin_list(p_offset integer DEFAULT 0)
 RETURNS SETOF news_posts
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform azuria_private.require_admin();
  if p_offset is null or p_offset < 0 or p_offset > 10000 then raise exception 'Invalid page' using errcode = '22023'; end if;
  return query select * from public.news_posts order by updated_at desc,id limit 25 offset p_offset;
end;
$function$;

revoke all on function "public"."news_admin_list"(p_offset integer) from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."news_admin_list"(p_offset integer) to "authenticated";

CREATE OR REPLACE FUNCTION public.news_admin_save(p_post jsonb, p_id uuid DEFAULT NULL::uuid, p_revision integer DEFAULT NULL::integer)
 RETURNS news_posts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

revoke all on function "public"."news_admin_save"(p_post jsonb, p_id uuid, p_revision integer) from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."news_admin_save"(p_post jsonb, p_id uuid, p_revision integer) to "authenticated";

CREATE OR REPLACE FUNCTION public.news_can_upload()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform azuria_private.require_admin();
  return true;
exception when insufficient_privilege then return false;
end;
$function$;

revoke all on function "public"."news_can_upload"() from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."news_can_upload"() to "authenticated";

CREATE OR REPLACE FUNCTION public.capture_signup_consent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.raw_user_meta_data->'legal_accepted' is distinct from 'true'::jsonb then
    raise exception 'Terms and privacy acceptance is required';
  end if;
  insert into public.signup_consents(user_id, marketing_opt_in)
  values (new.id, coalesce(new.raw_user_meta_data->'marketing_opt_in' = 'true'::jsonb, false));
  return new;
end;
$function$;

revoke all on function "public"."capture_signup_consent"() from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pending_marketing_contacts()
 RETURNS TABLE(user_id uuid, email text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select c.user_id, u.email::text from public.signup_consents c
  join auth.users u on u.id = c.user_id
  where c.marketing_opt_in and c.marketing_synced_at is null
    and u.email_confirmed_at is not null and u.email is not null
  order by c.accepted_at limit 10;
$function$;

revoke all on function "public"."pending_marketing_contacts"() from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."pending_marketing_contacts"() to "service_role";

CREATE OR REPLACE FUNCTION azuria_private.feedback_schema()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$ select '
{"version":1,"questions":[{"id":"launchers","title":"What launcher do you currently use?","options":[["modrinth","Modrinth"],["curseforge","CurseForge"],["dawn","Dawn"],["lunar","Lunar Client"],["prism","Prism Launcher"],["gdlauncher","GDLauncher"],["minecraft","Normal Minecraft Launcher"],["azuria","Azuria Launcher"],["other","Another launcher"],["none","I don’t currently use a launcher"]]},{"id":"appeal","title":"What do you find most appealing about your chosen launcher?","options":[["simple","Easy to use"],["design","How it looks"],["speed","Fast startup and good performance"],["mods","Installing mods and modpacks"],["profiles","Keeping versions and profiles organised"],["reliable","It works reliably"],["social","Friends and social features"],["skins","Skins and personalisation"],["familiar","I’m familiar with it"],["none","Nothing in particular / not applicable"]]},{"id":"priorities","title":"What do you want to see most in a launcher?","options":[["navigation","Good navigation"],["looks","Looks nice"],["performance","Fast and lightweight"],["reliability","Reliable launches and updates"],["mods","Easy mod and modpack installation"],["versions","Simple version and loader selection"],["privacy","Privacy and account security"],["customisation","Themes and personalisation"],["social","Friends and messaging"],["help","Useful error messages and troubleshooting"],["accessibility","Accessibility options"]]},{"id":"frustrations","title":"What frustrates you about launchers?","options":[["slow","Slow startup or high memory use"],["clutter","Cluttered or confusing screens"],["errors","Launch errors or crashes"],["mods","Difficult mod management"],["updates","Disruptive updates"],["accounts","Problems signing in"],["ads","Too many ads"],["none","No major frustrations"]]},{"id":"azuria","title":"What would make you more likely to try or keep using Azuria?","options":[["polish","A polished, easy-to-use design"],["speed","Better performance"],["mods","Modrinth and CurseForge support"],["social","Friends and messaging"],["reliability","Reliable launches"],["privacy","Clear privacy and security practices"],["customisation","More personalisation"],["recommendation","A recommendation from someone I trust"],["happy","I already use Azuria and I’m happy with it"],["unsure","I’m not sure yet"]]},{"id":"playstyle","title":"How do you usually play Minecraft?","options":[["vanilla","Vanilla"],["mods","With individual mods"],["modpacks","Modpacks"],["servers","Multiplayer servers"],["singleplayer","Single-player worlds"],["creative","Creative building"],["returning","I’m new or returning to Minecraft"]]}]}
'::jsonb $function$;

revoke all on function "azuria_private"."feedback_schema"() from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.feedback_submit(p_id uuid, p_version integer, p_answers jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare question jsonb; selected jsonb; option_count integer;
begin
  if p_id is null or p_version is distinct from 1 or p_answers is null or jsonb_typeof(p_answers) <> 'object'
    or octet_length(p_answers::text) > 8192 then raise exception 'Invalid feedback' using errcode = '22023'; end if;
  if (select count(*) from jsonb_object_keys(p_answers)) <> 6 then raise exception 'Invalid questions' using errcode = '22023'; end if;
  for question in select value from jsonb_array_elements(azuria_private.feedback_schema()->'questions') loop
    selected := p_answers->(question->>'id');
    if selected is null or jsonb_typeof(selected) <> 'array' then raise exception 'Missing answers' using errcode = '22023'; end if;
    option_count := jsonb_array_length(selected);
    if option_count < 1 or option_count > jsonb_array_length(question->'options')
      or (select count(distinct value) from jsonb_array_elements(selected)) <> option_count
      or exists (select 1 from jsonb_array_elements(selected) a where not exists
        (select 1 from jsonb_array_elements(question->'options') o where o->0 = a.value)) then
      raise exception 'Invalid selections' using errcode = '22023'; end if;
  end loop;
  -- Retrying a timed-out submission never creates a second response or overwrites one.
  perform pg_advisory_xact_lock(240001);
  if exists(select 1 from public.launcher_feedback where id = p_id) then return; end if;
  if (select count(*) from public.launcher_feedback where submitted_on = current_date) >= 5000 then
    raise exception 'Survey daily limit reached' using errcode = 'P0001'; end if;
  insert into public.launcher_feedback(id,version,answers) values(p_id,p_version,p_answers);
end; $function$;

revoke all on function "public"."feedback_submit"(p_id uuid, p_version integer, p_answers jsonb) from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."feedback_submit"(p_id uuid, p_version integer, p_answers jsonb) to "service_role";

CREATE OR REPLACE FUNCTION public.feedback_admin_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare totals jsonb;
begin
  perform azuria_private.require_admin();
  select coalesce(jsonb_object_agg(question_id, counts), '{}'::jsonb) into totals from (
    select question_id, jsonb_object_agg(option_id, votes) counts from (
      select a.key question_id, choice.value option_id, count(*) votes
      from public.launcher_feedback r cross join lateral jsonb_each(r.answers) a
      cross join lateral jsonb_array_elements_text(a.value) choice
      group by a.key, choice.value
    ) choices group by question_id
  ) questions;
  return jsonb_build_object('schema',azuria_private.feedback_schema(), 'total', (select count(*) from public.launcher_feedback), 'counts',totals);
end; $function$;

revoke all on function "public"."feedback_admin_summary"() from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."feedback_admin_summary"() to "authenticated";

CREATE OR REPLACE FUNCTION public.feedback_admin_responses(p_offset integer DEFAULT 0)
 RETURNS SETOF launcher_feedback
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform azuria_private.require_admin();
  if p_offset is null or p_offset < 0 or p_offset > 100000 then raise exception 'Invalid page' using errcode = '22023'; end if;
  return query select * from public.launcher_feedback order by submitted_on desc,id limit 25 offset p_offset;
end; $function$;

revoke all on function "public"."feedback_admin_responses"(p_offset integer) from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."feedback_admin_responses"(p_offset integer) to "authenticated";

CREATE OR REPLACE FUNCTION public.feedback_submit_with_comment(p_id uuid, p_version integer, p_answers jsonb, p_comment text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare already_saved boolean;
begin
  if p_comment is null or length(p_comment) > 2000 then
    raise exception 'Invalid written feedback' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(240001);
  select exists(select 1 from public.launcher_feedback where id = p_id) into already_saved;
  perform public.feedback_submit(p_id, p_version, p_answers);
  if not already_saved then
    update public.launcher_feedback set extra_feedback = btrim(p_comment) where id = p_id;
  end if;
end; $function$;

revoke all on function "public"."feedback_submit_with_comment"(p_id uuid, p_version integer, p_answers jsonb, p_comment text) from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."feedback_submit_with_comment"(p_id uuid, p_version integer, p_answers jsonb, p_comment text) to "service_role";

CREATE OR REPLACE FUNCTION azuria_private.message_friend(actor uuid, target uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform azuria_private.lock_friend_pair(actor, target);
  if azuria_private.pair_blocked(actor, target) or not exists (
    select 1 from public.friendships where user_low = least(actor,target) and user_high = greatest(actor,target)
  ) then raise exception 'Messaging requires an accepted friendship' using errcode = '22023'; end if;
end;
$function$;

revoke all on function "azuria_private"."message_friend"(actor uuid, target uuid) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.message_send(p_target uuid, p_client_id uuid, p_body text)
 RETURNS SETOF direct_messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  raise exception 'Update the launcher to use encrypted messaging' using errcode='22023';
end;
$function$;

revoke all on function "public"."message_send"(p_target uuid, p_client_id uuid, p_body text) from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."message_send"(p_target uuid, p_client_id uuid, p_body text) to "authenticated";

CREATE OR REPLACE FUNCTION public.message_history(p_target uuid, p_before bigint DEFAULT NULL::bigint)
 RETURNS SETOF direct_messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := azuria_private.social_actor();
begin
  perform azuria_private.message_friend(actor, p_target);
  return query select * from public.direct_messages m
    where least(m.sender_id,m.recipient_id) = least(actor,p_target)
      and greatest(m.sender_id,m.recipient_id) = greatest(actor,p_target)
      and (p_before is null or m.id < p_before)
    order by m.id desc limit 50;
end;
$function$;

revoke all on function "public"."message_history"(p_target uuid, p_before bigint) from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."message_history"(p_target uuid, p_before bigint) to "authenticated";

CREATE OR REPLACE FUNCTION public.message_read(p_target uuid, p_through bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := azuria_private.social_actor();
begin
  perform azuria_private.message_friend(actor, p_target);
  update public.direct_messages set read_at = now()
    where sender_id = p_target and recipient_id = actor and id <= p_through and read_at is null;
end;
$function$;

revoke all on function "public"."message_read"(p_target uuid, p_through bigint) from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."message_read"(p_target uuid, p_through bigint) to "authenticated";

CREATE OR REPLACE FUNCTION public.message_unread()
 RETURNS TABLE(account_id uuid, unread bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := azuria_private.social_actor();
begin
  return query select m.sender_id, count(*) from public.direct_messages m
    join public.friendships f on f.user_low = least(actor,m.sender_id) and f.user_high = greatest(actor,m.sender_id)
    where m.recipient_id = actor and m.read_at is null and not azuria_private.pair_blocked(actor,m.sender_id)
    group by m.sender_id;
end;
$function$;

revoke all on function "public"."message_unread"() from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."message_unread"() to "authenticated";

CREATE OR REPLACE FUNCTION public.message_key(p_target uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := azuria_private.social_actor(); result text;
begin
  if p_target <> actor then perform azuria_private.message_friend(actor,p_target); end if;
  select public_key into result from public.message_keys where account_id=p_target;
  return result;
end;
$function$;

revoke all on function "public"."message_key"(p_target uuid) from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."message_key"(p_target uuid) to "authenticated";

CREATE OR REPLACE FUNCTION public.message_register_key(p_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := azuria_private.social_actor(); existing text;
begin
  perform pg_advisory_xact_lock(hashtextextended(actor::text,712));
  if p_key is null or length(p_key)<>44 or p_key !~ '^[A-Za-z0-9+/]{43}=$' then
    raise exception 'Invalid encryption key' using errcode='22023'; end if;
  select public_key into existing from public.message_keys where account_id=actor;
  if existing is not null and existing<>p_key then raise exception 'Restore the existing encryption key' using errcode='22023'; end if;
  insert into public.message_keys(account_id,public_key) values(actor,p_key) on conflict do nothing;
end;
$function$;

revoke all on function "public"."message_register_key"(p_key text) from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."message_register_key"(p_key text) to "authenticated";

CREATE OR REPLACE FUNCTION public.message_send_encrypted(p_target uuid, p_client_id uuid, p_payload jsonb)
 RETURNS SETOF direct_messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

revoke all on function "public"."message_send_encrypted"(p_target uuid, p_client_id uuid, p_payload jsonb) from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."message_send_encrypted"(p_target uuid, p_client_id uuid, p_payload jsonb) to "authenticated";

CREATE OR REPLACE FUNCTION public.message_conversations()
 RETURNS TABLE(account_id uuid, latest_at timestamp with time zone, unread bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := azuria_private.social_actor();
begin
  return query
    select peer.id, recent.created_at,
      (select count(*) from public.direct_messages incoming
        where incoming.recipient_id=actor and incoming.sender_id=peer.id and incoming.read_at is null)
    from public.friendships f
    cross join lateral (select case when f.user_low=actor then f.user_high else f.user_low end as id) peer
    cross join lateral (
      select m.id,m.created_at from public.direct_messages m
      where least(m.sender_id,m.recipient_id)=least(actor,peer.id)
        and greatest(m.sender_id,m.recipient_id)=greatest(actor,peer.id)
      order by m.id desc limit 1
    ) recent
    where actor in (f.user_low,f.user_high) and not azuria_private.pair_blocked(actor,peer.id)
    order by recent.id desc limit 200;
end;
$function$;

revoke all on function "public"."message_conversations"() from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."message_conversations"() to "authenticated";

CREATE OR REPLACE FUNCTION public.sponsor_ads_public()
 RETURNS TABLE(id uuid, title text, image_path text, image_alt text, destination text, slots text[], ends_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select a.id,a.title,a.image_path,a.image_alt,a.destination,a.slots,a.ends_at from public.sponsor_ads a
 where a.enabled and a.starts_at <= now() and (a.ends_at is null or now() < a.ends_at)
 order by a.id limit 8;
$function$;

revoke all on function "public"."sponsor_ads_public"() from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."sponsor_ads_public"() to "anon";

grant EXECUTE on function "public"."sponsor_ads_public"() to "authenticated";

CREATE OR REPLACE FUNCTION public.sponsor_ads_admin_list()
 RETURNS SETOF sponsor_ads
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform azuria_private.require_admin();
 return query select * from public.sponsor_ads order by updated_at desc,id limit 200;
end;
$function$;

revoke all on function "public"."sponsor_ads_admin_list"() from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."sponsor_ads_admin_list"() to "authenticated";

CREATE OR REPLACE FUNCTION public.sponsor_ads_admin_save(p_ad jsonb, p_id uuid DEFAULT NULL::uuid, p_revision integer DEFAULT NULL::integer)
 RETURNS sponsor_ads
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

revoke all on function "public"."sponsor_ads_admin_save"(p_ad jsonb, p_id uuid, p_revision integer) from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."sponsor_ads_admin_save"(p_ad jsonb, p_id uuid, p_revision integer) to "authenticated";

CREATE OR REPLACE FUNCTION public.sponsor_ads_admin_delete(p_id uuid, p_revision integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := azuria_private.require_admin(); n public.sponsor_ads;
begin
 -- Use the same lock as campaign saves so rescheduling and deletion serialize.
 perform pg_catalog.pg_advisory_xact_lock(250001);
 select * into n from public.sponsor_ads where id=p_id for update;
 if not found then raise exception 'Advertisement no longer exists' using errcode='22023'; end if;
 if p_revision is null or p_revision <> n.revision then
  raise exception 'Advertisement changed. Reload before deleting.' using errcode='40001'; end if;
 if n.ends_at is null or n.ends_at > now() then
  raise exception 'Only expired advertisements can be deleted' using errcode='22023'; end if;
 insert into public.sponsor_ad_history(ad_id,actor_id,revision,action) values(n.id,actor,n.revision+1,'deleted');
 delete from public.sponsor_ads where id=n.id;
end;
$function$;

revoke all on function "public"."sponsor_ads_admin_delete"(p_id uuid, p_revision integer) from public, anon, authenticated, service_role;

grant EXECUTE on function "public"."sponsor_ads_admin_delete"(p_id uuid, p_revision integer) to "authenticated";

create policy "Read own requests" on "public"."friend_requests" as PERMISSIVE for SELECT to "authenticated" using (((( SELECT auth.uid() AS uid) = sender_id) OR (( SELECT auth.uid() AS uid) = recipient_id)));

create policy "Read own friendships" on "public"."friendships" as PERMISSIVE for SELECT to "authenticated" using (((( SELECT auth.uid() AS uid) = user_low) OR (( SELECT auth.uid() AS uid) = user_high)));

create policy "Create own profile" on "public"."profiles" as PERMISSIVE for INSERT to "authenticated" with check ((( SELECT auth.uid() AS uid) = id));

create policy "Read own profile" on "public"."profiles" as PERMISSIVE for SELECT to "authenticated" using ((( SELECT auth.uid() AS uid) = id));

create policy "Update own profile" on "public"."profiles" as PERMISSIVE for UPDATE to "authenticated" using ((( SELECT auth.uid() AS uid) = id)) with check ((( SELECT auth.uid() AS uid) = id));

create policy "Read own blocks" on "public"."user_blocks" as PERMISSIVE for SELECT to "authenticated" using ((( SELECT auth.uid() AS uid) = blocker_id));

create policy "news_admin_upload" on "storage"."objects" as PERMISSIVE for INSERT to "authenticated" with check (((bucket_id = 'news-images'::text) AND news_can_upload() AND (name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(png|jpg|webp)$'::text) AND (split_part(name, '/'::text, 1) = (auth.uid())::text)));

create policy "sponsor_admin_upload" on "storage"."objects" as PERMISSIVE for INSERT to "authenticated" with check (((bucket_id = 'sponsor-images'::text) AND news_can_upload() AND (name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(png|jpg|webp)$'::text) AND (split_part(name, '/'::text, 1) = (auth.uid())::text)));

CREATE TRIGGER capture_signup_consent AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION capture_signup_consent();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('news-images','news-images',true,5242880,ARRAY['image/jpeg','image/png','image/webp']::text[]);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('sponsor-images','sponsor-images',true,2097152,ARRAY['image/jpeg','image/png','image/webp']::text[]);

commit;

