import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { createTestDatabase } from "./helpers/database.mjs";
const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const charlie = "33333333-3333-4333-8333-333333333333";
const unverified = "44444444-4444-4444-8444-444444444444";
let db;
before(async () => {
  db = await createTestDatabase();
  for (const [id, name] of [
    [alice, "alice"],
    [bob, "bob"],
    [charlie, "charlie"],
    [unverified, "unverified"],
  ]) {
    await db.query(
      "insert into auth.users(id,email_confirmed_at) values ($1, $2)",
      [id, id === unverified ? null : new Date().toISOString()],
    );
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
async function seedLegacyMessage() {
  await db.query(
    "insert into public.direct_messages(sender_id,recipient_id,client_id,body) values ($1,$2,$3,'Older message')",
    [alice, bob, client],
  );
}
test("legacy history is restricted to verified friends and direct table access is denied", async () => {
  await assert.rejects(call(unverified, "message_unread"), /verified/);
  await assert.rejects(
    as(null, "select * from public.message_unread()", [], "anon"),
    /permission denied/,
  );
  await connect();
  await seedLegacyMessage();
  assert.equal(
    (await call(bob, "message_history", [alice]))[0].body,
    "Older message",
  );
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
test("blocking immediately revokes legacy history in both directions", async () => {
  await connect();
  await seedLegacyMessage();
  await call(bob, "block_user", [alice]);
  for (const [actor, target] of [
    [alice, bob],
    [bob, alice],
  ])
    await assert.rejects(
      call(actor, "message_history", [target]),
      /accepted friendship/,
    );
  assert.deepEqual(await call(bob, "message_unread"), []);
});
test("presence and typing are visible only to current friends and expire", async () => {
  await connect();
  const presence = async (id, status = null, target = null, typing = null) =>
    (await call(id, "launcher_presence", [status, target, typing]))[0]
      .launcher_presence;
  await presence(alice, "away", bob, true);
  assert.deepEqual(await presence(bob, "online", alice), {
    status: "online",
    friends: { [alice]: "away" },
    typing: true,
  });
  assert.deepEqual(await presence(charlie, "online", alice), {
    status: "online",
    friends: {},
    typing: false,
  });
  await db.exec(
    "update azuria_private.launcher_typing set expires_at = now() - interval '1 second'",
  );
  assert.equal((await presence(bob, null, alice)).typing, false);
  await presence(alice, "offline", bob, true);
  assert.deepEqual(await presence(bob, "online", alice), {
    status: "online",
    friends: {},
    typing: false,
  });
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
    call(alice, "message_history", [bob]),
    /accepted friendship/,
  );
  await db.query("delete from public.profiles where id=$1", [bob]);
  assert.equal(await count("direct_messages"), 0);
});
