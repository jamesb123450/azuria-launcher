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
    "202610240005_social_conversations.sql",
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

const client = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const key = (n) => Buffer.alloc(32, n).toString("base64");
const payload = {
  v: 1,
  n: Buffer.alloc(24, 3).toString("base64"),
  c: Buffer.alloc(48, 4).toString("base64"),
};
async function connect() {
  await call(alice, "send_friend_request", [bob]);
  await call(bob, "respond_friend_request", [alice, true]);
  await call(alice, "message_register_key", [key(7)]);
  await call(bob, "message_register_key", [key(9)]);
}
test("recent conversations include only the caller's accepted friends and never message content", async () => {
  await connect();
  assert.deepEqual(await call(alice, "message_conversations"), []);
  await call(alice, "message_send_encrypted", [bob, client, payload]);
  const rows = await call(bob, "message_conversations");
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]).sort(), [
    "account_id",
    "latest_at",
    "unread",
  ]);
  assert.equal(rows[0].account_id, alice);
  assert.equal(Number(rows[0].unread), 1);
  assert.deepEqual(await call(charlie, "message_conversations"), []);
  await assert.rejects(
    as(null, "select * from public.message_conversations()", [], "anon"),
    /permission denied/,
  );
  await assert.rejects(call(unverified, "message_conversations"), /verified/);
});
test("read conversations remain listed and blocking removes them in both directions", async () => {
  await connect();
  const sent = await call(alice, "message_send_encrypted", [
    bob,
    client,
    payload,
  ]);
  await call(bob, "message_read", [alice, sent[0].id]);
  const rows = await call(bob, "message_conversations");
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].unread), 0);
  await call(bob, "block_user", [alice]);
  assert.deepEqual(await call(alice, "message_conversations"), []);
  assert.deepEqual(await call(bob, "message_conversations"), []);
});
