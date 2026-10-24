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
    "202610240004_message_encryption.sql",
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
    "delete from public.direct_messages; delete from public.message_keys; delete from public.friend_requests; delete from public.friendships; delete from public.user_blocks; delete from azuria_private.social_limits;",
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

const key = (n) => Buffer.alloc(32, n).toString("base64");
const payload = (n) => ({
  v: 1,
  n: Buffer.alloc(24, n).toString("base64"),
  c: Buffer.alloc(64, n).toString("base64"),
});
const client = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
async function connect() {
  await call(alice, "send_friend_request", [bob]);
  await call(bob, "respond_friend_request", [alice, true]);
  await call(alice, "message_register_key", [key(7)]);
  await call(bob, "message_register_key", [key(9)]);
}
test("public keys are scoped to self or accepted friends and cannot be replaced or modified directly", async () => {
  await call(alice, "message_register_key", [key(7)]);
  await assert.rejects(
    call(charlie, "message_key", [alice]),
    /accepted friendship/,
  );
  await assert.rejects(
    as(null, "select * from public.message_key($1)", [alice], "anon"),
    /permission denied/,
  );
  await assert.rejects(
    as(alice, "select * from public.message_keys"),
    /permission denied/,
  );
  await assert.rejects(
    as(alice, "update public.message_keys set public_key=$1", [key(8)]),
    /permission denied/,
  );
  await assert.rejects(
    call(alice, "message_register_key", [key(8)]),
    /Restore/,
  );
  await connect();
  const result = await call(bob, "message_key", [alice]);
  assert.equal(result[0].message_key, key(7));
});
test("new messages contain only ciphertext, retries cannot overwrite and old clients cannot send plaintext", async () => {
  await connect();
  await assert.rejects(
    call(alice, "message_send", [bob, client, "plain text"]),
    /encrypted messaging/,
  );
  const first = await call(alice, "message_send_encrypted", [
    bob,
    client,
    payload(1),
  ]);
  assert.equal(first[0].body, null);
  assert.deepEqual(first[0].encrypted, payload(1));
  const retry = await call(alice, "message_send_encrypted", [
    bob,
    client,
    payload(2),
  ]);
  assert.equal(retry[0].id, first[0].id);
  assert.deepEqual(retry[0].encrypted, payload(1));
  assert.equal(await count("direct_messages"), 1);
});
test("invalid ciphertext, missing keys, nonfriends, blocks and unverified accounts are rejected", async () => {
  await assert.rejects(
    call(unverified, "message_register_key", [key(3)]),
    /verified/,
  );
  await call(alice, "send_friend_request", [bob]);
  await call(bob, "respond_friend_request", [alice, true]);
  await assert.rejects(
    call(alice, "message_send_encrypted", [bob, client, payload(1)]),
    /encryption keys/,
  );
  await call(alice, "message_register_key", [key(7)]);
  await call(bob, "message_register_key", [key(9)]);
  for (const value of [
    null,
    [],
    {},
    { ...payload(1), v: 2 },
    { ...payload(1), extra: "plain" },
    { ...payload(1), n: "bad" },
    { ...payload(1), c: "x".repeat(16001) },
    { ...payload(1), v: null },
    { ...payload(1), c: null },
  ])
    await assert.rejects(
      call(alice, "message_send_encrypted", [bob, client, value]),
      /Invalid encrypted message/,
    );
  await call(bob, "block_user", [alice]);
  await assert.rejects(
    call(alice, "message_send_encrypted", [bob, client, payload(1)]),
    /accepted friendship/,
  );
  await assert.rejects(
    call(alice, "message_key", [bob]),
    /accepted friendship/,
  );
});
test("ciphertext history, unread markers and account deletion still work", async () => {
  await connect();
  const sent = await call(alice, "message_send_encrypted", [
    bob,
    client,
    payload(1),
  ]);
  const history = await call(bob, "message_history", [alice]);
  assert.deepEqual(history[0].encrypted, payload(1));
  assert.equal(Number((await call(bob, "message_unread"))[0].unread), 1);
  await call(bob, "message_read", [alice, sent[0].id]);
  assert.deepEqual(await call(bob, "message_unread"), []);
  await db.query("delete from auth.users where id=$1", [bob]);
  assert.equal(await count("direct_messages"), 0);
  assert.equal(
    (
      await db.query("select * from public.message_keys where account_id=$1", [
        bob,
      ])
    ).rows.length,
    0,
  );
});

test("encrypted sends keep the server rate limit", async () => {
  // The preceding deletion test removed Bob; recreate the verified fixture.
  await db.query("insert into auth.users values ($1,now())", [bob]);
  await db.query(
    "insert into public.profiles(id,username,display_name) values($1,'bob','BOB')",
    [bob],
  );
  await connect();
  for (let i = 0; i < 30; i++)
    await call(alice, "message_send_encrypted", [
      bob,
      `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`,
      payload(i),
    ]);
  await assert.rejects(
    call(alice, "message_send_encrypted", [bob, client, payload(31)]),
    /Too many requests/,
  );
});
