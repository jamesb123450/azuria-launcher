import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const schema = await readFile(
  new URL(
    "../../../../../services/accounts/supabase/schema.sql",
    import.meta.url,
  ),
  "utf8",
);

// Supabase-owned auth/storage objects are supplied by the platform in production.
export async function createTestDatabase() {
  const db = new PGlite();
  try {
    // Fixture signups accept the legal terms unless a consent test overrides metadata.
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key, email text,email_confirmed_at timestamptz,banned_until timestamptz,created_at timestamptz default now(),raw_user_meta_data jsonb default '{"legal_accepted":true}'::jsonb);
create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),auth.jwt()->>'sub')::uuid $$;
grant usage on schema auth to authenticated;
grant usage on schema public to anon,authenticated,service_role;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated; grant insert on storage.objects to authenticated;`);
    await db.exec(schema);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
