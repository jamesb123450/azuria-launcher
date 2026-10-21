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
    "delete from public.news_history; delete from public.news_posts; delete from storage.objects; delete from public.admin_audit; delete from azuria_private.social_limits; delete from auth.sessions; update auth.users set banned_until=null;",
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

const asset = `${admin}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp`;
const post = (overrides = {}) => ({
  slug: "first-story",
  title: "Hello Azuria",
  summary: "An update",
  body: "The first paragraph.\n\n## More news\n\n- One\n- Two",
  cover_path: asset,
  cover_alt: "A Minecraft landscape",
  accent: "blue",
  image_position: "top",
  reading_width: "wide",
  status: "draft",
  ...overrides,
});
async function upload() {
  await as(
    admin,
    "insert into storage.objects(bucket_id,name) values ('news-images',$1)",
    [asset],
  );
}
async function save(
  data = post(),
  id = null,
  revision = null,
  actor = admin,
  options = {},
) {
  return (
    await rpc(actor, "news_admin_save", [data, id, revision], options)
  )[0];
}

test("drafts are private; publishing produces the requested public fields without account IDs", async () => {
  await upload();
  const draft = await save();
  assert.deepEqual(await rpc(null, "news_public", [], { role: "anon" }), []);
  await assert.rejects(
    as(admin, "select * from public.news_posts"),
    /permission denied/,
  );
  await assert.rejects(rpc(normal, "news_admin_list"), /Admin access/);
  const published = await save(
    post({ status: "published" }),
    draft.id,
    draft.revision,
  );
  const feed = (await rpc(null, "news_public", [], { role: "anon" }))[0];
  assert.equal(feed.body, "");
  assert.equal(feed.author_username, "admin");
  assert.equal(feed.cover_path, asset);
  assert.ok(feed.published_at);
  assert.equal("author_id" in feed, false);
  assert.equal("created_at" in feed, false);
  assert.equal(
    (await rpc(null, "news_public", ["first-story"], { role: "anon" }))[0].body,
    post().body,
  );
  assert.equal(published.status, "published");
});
test("edits preserve original author/date, reject lost updates, and unpublishing hides the page", async () => {
  await upload();
  const published = await save(post({ status: "published" }));
  const edited = await save(
    post({ title: "Edited", status: "published" }),
    published.id,
    published.revision,
    otherAdmin,
  );
  assert.equal(edited.title, "Edited");
  assert.equal(edited.author_username, "admin");
  assert.equal(edited.author_id, admin);
  assert.equal(+edited.published_at, +published.published_at);
  assert.equal(edited.revision, 2);
  await assert.rejects(
    save(post(), published.id, 1),
    /changed in another window/,
  );
  await assert.rejects(
    save(post({ slug: "new-address", status: "published" }), published.id, 2),
    /Unpublish/,
  );
  await save(post(), edited.id, 2);
  assert.deepEqual(
    await rpc(null, "news_public", ["first-story"], { role: "anon" }),
    [],
  );
  assert.equal(
    (await db.query("select count(*)::int as count from public.news_history"))
      .rows[0].count,
    3,
  );
});
test("news writes and uploads reject ordinary users, missing MFA and revoked sessions", async () => {
  await assert.rejects(save(post(), null, null, normal), /Admin access/);
  await assert.rejects(
    save(post(), null, null, admin, { claims: { aal: "aal1" } }),
    /Admin access/,
  );
  await assert.rejects(
    as(
      normal,
      "insert into storage.objects(bucket_id,name) values ('news-images',$1)",
      [`${normal}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp`],
    ),
    /row-level security/,
  );
  await assert.rejects(
    as(
      admin,
      "insert into storage.objects(bucket_id,name) values ('news-images',$1)",
      [asset],
      { claims: { aal: "aal1" } },
    ),
    /row-level security/,
  );
  await db.query("delete from auth.sessions where user_id=$1", [admin]);
  await assert.rejects(rpc(admin, "news_admin_list"), /Admin access/);
  await assert.rejects(upload(), /row-level security/);
});
test("invalid images, customisation, empty published stories and forged authorship are rejected", async () => {
  await assert.rejects(save(), /Upload a cover/);
  await upload();
  for (const bad of [
    { author_username: "spoof" },
    { accent: "url(javascript:alert(1))" },
    { slug: "../escape" },
    { status: "published", body: "" },
    { status: "published", cover_alt: "" },
    { cover_path: "https://evil.test/image.png" },
  ]) {
    await assert.rejects(save(post(bad)));
  }
  assert.equal(
    (await rpc(null, "news_public", [], { role: "anon" })).length,
    0,
  );
  await assert.rejects(
    rpc(null, "news_public", [null, -1], { role: "anon" }),
    /Invalid news page/,
  );
});
test("storage accepts only the admin's immutable image path and denies overwrites", async () => {
  await upload();
  await assert.rejects(
    as(admin, "update storage.objects set name='overwrite'"),
    /permission denied/,
  );
  await assert.rejects(
    as(admin, "delete from storage.objects"),
    /permission denied/,
  );
  await assert.rejects(
    as(
      admin,
      "insert into storage.objects(bucket_id,name) values ('news-images',$1)",
      [asset.replace(".webp", ".svg")],
    ),
    /row-level security/,
  );
  await assert.rejects(
    as(
      admin,
      "insert into storage.objects(bucket_id,name) values ('news-images',$1)",
      [asset.replace(admin, normal)],
    ),
    /row-level security/,
  );
});
