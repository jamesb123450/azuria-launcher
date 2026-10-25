import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const admin = "11111111-1111-4111-8111-111111111111";
const target = "22222222-2222-4222-8222-222222222222";
const otherAdmin = "33333333-3333-4333-8333-333333333333";
const normal = "44444444-4444-4444-8444-444444444444";
const session = (id) => `aaaaaaaa-aaaa-4aaa-8aaa-${id.slice(-12)}`;
let db;
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, banned_until timestamptz, created_at timestamptz default now());
    create table auth.sessions(id uuid primary key, user_id uuid references auth.users(id) on delete cascade);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth to authenticated;
    grant usage on schema public to anon, authenticated, service_role;`);
  await db.exec(`create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant insert on storage.objects to authenticated;`);
  for (const file of [
    "202610200001_accounts.sql",
    "202610200002_friends.sql",
    "202610200003_admin.sql",
    "202610210001_news.sql",
    "202610250001_advertisements.sql",
    "202610250002_expired_advertisements.sql",
  ])
    await db.exec(
      await readFile(
        new URL(
          `../../../../services/accounts/supabase/migrations/${file}`,
          import.meta.url,
        ),
        "utf8",
      ),
    );
  for (const [id, name] of [
    [admin, "admin"],
    [target, "target"],
    [otherAdmin, "otheradmin"],
    [normal, "normal"],
  ]) {
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())",
      [id, `${name}@example.com`],
    );
    await db.query(
      "insert into public.profiles(id,username,display_name) values ($1,$2,$2)",
      [id, name],
    );
  }
  await db.query("insert into public.admin_roles(user_id) values ($1),($2)", [
    admin,
    otherAdmin,
  ]);
});
beforeEach(async () => {
  await db.exec(
    "delete from public.sponsor_ad_history; delete from public.sponsor_ads; delete from public.news_history; delete from public.news_posts; delete from storage.objects; delete from public.admin_audit; delete from azuria_private.social_limits; delete from auth.sessions; update auth.users set banned_until=null;",
  );
  for (const id of [admin, target, otherAdmin, normal])
    await db.query(
      "insert into auth.sessions select $1, id from auth.users where id=$2",
      [session(id), id],
    );
});
after(async () => {
  await db?.close();
});
async function as(id, sql, params = [], options = {}) {
  await db.exec("begin");
  try {
    await db.exec(`set local role ${options.role || "authenticated"}`);
    const claims = {
      sub: id,
      session_id: id ? session(id) : null,
      aal: "aal2",
      amr: [
        { method: "password", timestamp: Math.floor(Date.now() / 1000) },
        { method: "totp", timestamp: Math.floor(Date.now() / 1000) },
      ],
      ...options.claims,
    };
    await db.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify(claims),
    ]);
    const result = await db.query(sql, params);
    await db.exec("commit");
    return result.rows;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}
const rpc = (id, fn, args = [], options = {}) =>
  as(
    id,
    `select * from public.${fn}(${args.map((_, i) => "$" + (i + 1)).join(",")})`,
    args,
    options,
  );

const asset = `${admin}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png`;
const ad = (changes = {}) => ({
  title: "Sponsor",
  image_path: asset,
  image_alt: "Sponsor logo",
  destination: "https://example.com/offer",
  slots: ["home.top"],
  enabled: true,
  starts_at: "2020-01-01T00:00:00Z",
  ends_at: null,
  ...changes,
});
async function upload() {
  await as(
    admin,
    "insert into storage.objects(bucket_id,name) values ('sponsor-images',$1)",
    [asset],
  );
}
async function save(data = ad(), id = null, revision = null) {
  return (await rpc(admin, "sponsor_ads_admin_save", [data, id, revision]))[0];
}
test("only current enabled campaigns are public, with no administrator details", async () => {
  await upload();
  const saved = await save();
  let result = await rpc(null, "sponsor_ads_public", [], { role: "anon" });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].slots, ["home.top"]);
  assert.ok(!("actor_id" in result[0]) && !("revision" in result[0]));
  await save(ad({ enabled: false }), saved.id, saved.revision);
  assert.deepEqual(
    await rpc(null, "sponsor_ads_public", [], { role: "anon" }),
    [],
  );
  await save(ad({ starts_at: "2099-01-01T00:00:00Z" }), saved.id, 2);
  assert.deepEqual(
    await rpc(null, "sponsor_ads_public", [], { role: "anon" }),
    [],
  );
  await save(ad({ ends_at: "2021-01-01T00:00:00Z" }), saved.id, 3);
  assert.deepEqual(
    await rpc(null, "sponsor_ads_public", [], { role: "anon" }),
    [],
  );
});
test("admin access, MFA, immutable uploads and table permissions are enforced", async () => {
  await assert.rejects(rpc(normal, "sponsor_ads_admin_list"), /Admin access/);
  await assert.rejects(
    rpc(admin, "sponsor_ads_admin_list", [], { claims: { aal: "aal1" } }),
    /MFA|authenticator|Verify/i,
  );
  await assert.rejects(
    as(
      normal,
      "insert into storage.objects(bucket_id,name) values ('sponsor-images',$1)",
      [`${normal}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png`],
    ),
    /row-level security/,
  );
  await assert.rejects(
    as(admin, "select * from public.sponsor_ads"),
    /permission denied/,
  );
  await upload();
  await assert.rejects(upload(), /duplicate/);
  await assert.rejects(
    save(ad({ destination: "javascript:alert(1)" })),
    /check constraint/,
  );
  await assert.rejects(save(ad({ slots: ["fake.slot"] })), /check constraint/);
  await assert.rejects(save(ad({ slots: [] })), /null value|check constraint/);
  await assert.rejects(
    save(
      ad({ image_path: `${admin}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png` }),
    ),
    /Upload the image/,
  );
});
test("multiple placements work, overlapping schedules fail, and stale edits cannot overwrite changes", async () => {
  await upload();
  const a = await save(ad({ slots: ["home.top", "social.bottom"] }));
  await assert.rejects(save(ad({ slots: ["social.bottom"] })), /already has/);
  await save(ad({ slots: ["home.bottom"] }));
  await save(ad({ slots: ["home.top"], enabled: false }));
  await assert.rejects(save(ad({ title: "Overwrite" }), a.id, 99), /changed/);
  await save(
    ad({
      slots: ["home.top", "social.bottom"],
      ends_at: "2030-01-01T00:00:00Z",
    }),
    a.id,
    a.revision,
  );
  await save(
    ad({ slots: ["social.bottom"], starts_at: "2030-01-01T00:00:00Z" }),
  );
  assert.equal(
    (await db.query("select * from public.sponsor_ad_history")).rows.length,
    5,
  );
});

test("expired campaigns can be deleted while retaining the administrator audit", async () => {
  await upload();
  const expired = await save(
    ad({ ends_at: "2021-01-01T00:00:00Z", enabled: false }),
  );
  await rpc(admin, "sponsor_ads_admin_delete", [expired.id, expired.revision]);
  assert.equal((await rpc(admin, "sponsor_ads_admin_list")).length, 0);
  const audit = (
    await db.query(
      "select * from public.sponsor_ad_history where action='deleted'",
    )
  ).rows;
  assert.equal(audit.length, 1);
  assert.equal(audit[0].actor_id, admin);
  assert.equal(audit[0].ad_id, expired.id);
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    1,
  );
});
test("deletion requires admin MFA, an expired end time and the current revision", async () => {
  await upload();
  const active = await save();
  await assert.rejects(
    rpc(normal, "sponsor_ads_admin_delete", [active.id, active.revision]),
    /Admin access/,
  );
  await assert.rejects(
    rpc(admin, "sponsor_ads_admin_delete", [active.id, active.revision], {
      claims: { aal: "aal1" },
    }),
    /Admin access/,
  );
  await assert.rejects(
    rpc(admin, "sponsor_ads_admin_delete", [active.id, active.revision]),
    /Only expired/,
  );
  const expired = await save(
    ad({ enabled: false, ends_at: "2021-01-01T00:00:00Z" }),
  );
  await assert.rejects(
    rpc(admin, "sponsor_ads_admin_delete", [expired.id, 99]),
    /changed/,
  );
  const renewed = await save(
    ad({ enabled: false, ends_at: "2099-01-01T00:00:00Z" }),
    expired.id,
    expired.revision,
  );
  await assert.rejects(
    rpc(admin, "sponsor_ads_admin_delete", [renewed.id, renewed.revision]),
    /Only expired/,
  );
});
