import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const charlie = "33333333-3333-4333-8333-333333333333";
const unverified = "44444444-4444-4444-8444-444444444444";
let db;
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    grant usage on schema public to anon, authenticated, service_role;`);
  for (const migration of [
    "202610200001_accounts.sql",
    "202610200002_friends.sql",
    "202610240003_messaging.sql",
  ]) {
    await db.exec(
      await readFile(
        new URL(
          `../../../../services/accounts/supabase/migrations/${migration}`,
          import.meta.url,
        ),
        "utf8",
      ),
    );
  }
  for (const [id, name] of [
    [alice, "alice"],
    [bob, "bob"],
    [charlie, "charlie"],
    [unverified, "unverified"],
  ]) {
    await db.query("insert into auth.users values ($1, $2)", [
      id,
      id === unverified ? null : new Date().toISOString(),
    ]);
    await db.query(
      "insert into public.profiles(id,username,display_name) values ($1,$2,$3)",
      [id, name, name.toUpperCase()],
    );
  }
});
beforeEach(async () => {
  await db.exec(
    "delete from public.direct_messages; delete from public.friend_requests; delete from public.friendships; delete from public.user_blocks; delete from azuria_private.social_limits;",
  );
});
after(async () => {
  await db?.close();
});
async function as(id, sql, params = [], role = "authenticated") {
  await db.exec("begin");
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [
      id || "",
    ]);
    const result = await db.query(sql, params);
    await db.exec("commit");
    return result.rows;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}
const call = (id, fn, args = []) =>
  as(
    id,
    `select * from public.${fn}(${args.map((_, i) => "$" + (i + 1)).join(",")})`,
    args,
  );
const count = async (table) =>
  Number(
    (await db.query(`select count(*) as total from public.${table}`)).rows[0]
      .total,
  );

const client = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
async function connect() {
  await call(alice, "send_friend_request", [bob]);
  await call(bob, "respond_friend_request", [alice, true]);
}
test("only accepted friends can send or read messages; anonymous and unverified callers are rejected", async () => {
  await assert.rejects(
    call(alice, "message_send", [bob, client, "Hello"]),
    /accepted friendship/,
  );
  await assert.rejects(call(unverified, "message_unread"), /verified/);
  await assert.rejects(
    as(null, "select * from public.message_unread()", [], "anon"),
    /permission denied/,
  );
  await connect();
  await call(alice, "message_send", [bob, client, "Hello"]);
  await assert.rejects(
    call(charlie, "message_history", [alice]),
    /accepted friendship/,
  );
  await assert.rejects(
    as(bob, "select * from public.direct_messages"),
    /permission denied/,
  );
  await assert.rejects(
    as(
      bob,
      "insert into public.direct_messages(sender_id,recipient_id,client_id,body) values ($1,$2,$3,'spoofed')",
      [alice, bob, client],
    ),
    /permission denied/,
  );
});
test("retry is idempotent, sender comes from auth, and read markers belong to the recipient", async () => {
  await connect();
  const first = await call(alice, "message_send", [bob, client, "Hello"]);
  const retry = await call(alice, "message_send", [bob, client, "Hello"]);
  assert.equal(first[0].id, retry[0].id);
  assert.equal(first[0].sender_id, alice);
  assert.equal(await count("direct_messages"), 1);
  await assert.rejects(
    call(alice, "message_send", [bob, client, "Changed"]),
    /retry does not match/,
  );
  assert.equal(Number((await call(bob, "message_unread"))[0].unread), 1);
  await call(alice, "message_read", [bob, first[0].id]);
  assert.equal(Number((await call(bob, "message_unread"))[0].unread), 1);
  await call(bob, "message_read", [alice, first[0].id]);
  assert.deepEqual(await call(bob, "message_unread"), []);
});
test("blocking and removing immediately revoke both directions of conversation access", async () => {
  await connect();
  await call(alice, "message_send", [bob, client, "Hello"]);
  await call(bob, "block_user", [alice]);
  for (const [actor, target] of [
    [alice, bob],
    [bob, alice],
  ]) {
    await assert.rejects(
      call(actor, "message_history", [target]),
      /accepted friendship/,
    );
    await assert.rejects(
      call(actor, "message_send", [target, client, "Hello"]),
      /accepted friendship/,
    );
  }
  assert.deepEqual(await call(bob, "message_unread"), []);
});
test("message validation, bounded history and server rate limits apply", async () => {
  await connect();
  for (const body of [" ", "x".repeat(2001)])
    await assert.rejects(
      call(alice, "message_send", [bob, client, body]),
      /1–2000/,
    );
  for (let i = 0; i < 30; i++)
    await call(alice, "message_send", [
      bob,
      `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`,
      String(i),
    ]);
  await assert.rejects(
    call(alice, "message_send", [bob, client, "over limit"]),
    /Too many requests/,
  );
  const page = await call(bob, "message_history", [alice]);
  assert.equal(page.length, 30);
  const earlier = await call(bob, "message_history", [alice, page[10].id]);
  assert.equal(earlier.length, 19);
  assert.ok(earlier.every((row) => Number(row.id) < Number(page[10].id)));
});

test("history is capped at 50, removal revokes access, and deleting a profile removes its messages", async () => {
  await connect();
  await db.query(
    `insert into public.direct_messages(sender_id,recipient_id,client_id,body)
    select $1,$2,('bbbbbbbb-bbbb-4bbb-8bbb-' || lpad(i::text,12,'0'))::uuid,'hello'
    from generate_series(1,55) i`,
    [alice, bob],
  );
  const page = await call(bob, "message_history", [alice]);
  assert.equal(page.length, 50);
  assert.equal(
    (await call(bob, "message_history", [alice, page.at(-1).id])).length,
    5,
  );
  await call(alice, "remove_friend", [bob]);
  await assert.rejects(
    call(bob, "message_history", [alice]),
    /accepted friendship/,
  );
  await assert.rejects(
    call(alice, "message_send", [bob, client, "hello"]),
    /accepted friendship/,
  );
  await db.query("delete from public.profiles where id=$1", [bob]);
  assert.equal(await count("direct_messages"), 0);
});
