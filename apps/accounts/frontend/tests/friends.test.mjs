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
    "delete from public.friend_requests; delete from public.friendships; delete from public.user_blocks; delete from azuria_private.social_limits;",
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

test("profile upsert works while identity transfer and creation-time changes remain forbidden", async () => {
  await as(
    alice,
    "insert into public.profiles(id,username,display_name) values ($1,$2,$3) on conflict(id) do update set id=excluded.id,username=excluded.username,display_name=excluded.display_name",
    [alice, "alice", "Alice"],
  );
  await assert.rejects(
    as(alice, "update public.profiles set id=$1 where id=$2", [charlie, alice]),
    /row-level security|unique constraint/,
  );
  await assert.rejects(
    as(alice, "update public.profiles set created_at=now()"),
    /permission denied/,
  );
});
test("only verified accounts with profiles can use social operations", async () => {
  await assert.rejects(
    call(unverified, "find_friend", ["bob"]),
    /verified Azuria profile/,
  );
  await assert.rejects(
    call(null, "friend_snapshot"),
    /verified Azuria profile/,
  );
  await assert.rejects(
    as(null, "select * from public.find_friend('bob')", [], "anon"),
    /permission denied/,
  );
  assert.equal((await call(alice, "find_friend", ["unverified"])).length, 0);
});
test("exact username lookup returns only minimal identity and relationship fields", async () => {
  const rows = await call(alice, "find_friend", [" BOB "]);
  assert.deepEqual(Object.keys(rows[0]).sort(), [
    "display_name",
    "id",
    "relationship",
    "username",
  ]);
  assert.equal(rows[0].id, bob);
  assert.equal(rows[0].relationship, "none");
  for (const name of ["bo", "%", "", "alice"])
    assert.equal((await call(alice, "find_friend", [name])).length, 0);
  assert.equal((await as(alice, "select * from public.profiles")).length, 1);
});
test("pending requests are visible only to participants and cannot be written directly", async () => {
  await call(alice, "send_friend_request", [bob]);
  assert.equal(
    (await as(alice, "select * from public.friend_requests")).length,
    1,
  );
  assert.equal(
    (await as(bob, "select * from public.friend_requests")).length,
    1,
  );
  assert.equal(
    (await as(charlie, "select * from public.friend_requests")).length,
    0,
  );
  await assert.rejects(
    as(
      charlie,
      "insert into public.friend_requests(sender_id,recipient_id) values ($1,$2)",
      [alice, charlie],
    ),
    /permission denied/,
  );
  await assert.rejects(
    as(alice, "delete from public.friend_requests"),
    /permission denied/,
  );
  await assert.rejects(
    as(alice, "select * from azuria_private.social_limits"),
    /permission denied/,
  );
  await assert.rejects(
    as(alice, "select azuria_private.social_actor()"),
    /permission denied/,
  );
});
test("self-add, duplicates and crossed requests never create friendships", async () => {
  await assert.rejects(
    call(alice, "send_friend_request", [alice]),
    /another Azuria account/,
  );
  await call(alice, "send_friend_request", [bob]);
  await assert.rejects(
    call(alice, "send_friend_request", [bob]),
    /already pending/,
  );
  await assert.rejects(
    call(bob, "send_friend_request", [alice]),
    /already pending/,
  );
  assert.equal(await count("friend_requests"), 1);
  assert.equal(await count("friendships"), 0);
});
test("only the intended recipient can accept and acceptance creates one canonical friendship", async () => {
  await call(alice, "send_friend_request", [bob]);
  await assert.rejects(
    call(charlie, "respond_friend_request", [alice, true]),
    /no longer available/,
  );
  await assert.rejects(
    call(alice, "respond_friend_request", [bob, true]),
    /no longer available/,
  );
  assert.equal(await count("friend_requests"), 1);
  await call(bob, "respond_friend_request", [alice, true]);
  assert.equal(await count("friend_requests"), 0);
  assert.equal(await count("friendships"), 1);
  assert.equal((await as(alice, "select * from public.friendships")).length, 1);
  assert.equal((await as(bob, "select * from public.friendships")).length, 1);
  assert.equal(
    (await as(charlie, "select * from public.friendships")).length,
    0,
  );
  await assert.rejects(
    call(bob, "respond_friend_request", [alice, true]),
    /no longer available/,
  );
  await assert.rejects(
    call(alice, "send_friend_request", [bob]),
    /already friends/,
  );
});
test("decline and cancel remove only the caller’s permitted request", async () => {
  await call(alice, "send_friend_request", [bob]);
  await call(charlie, "cancel_friend_request", [bob]);
  assert.equal(await count("friend_requests"), 1);
  await call(bob, "cancel_friend_request", [alice]);
  assert.equal(await count("friend_requests"), 1);
  await call(bob, "respond_friend_request", [alice, false]);
  assert.equal(await count("friend_requests"), 0);
  await call(alice, "send_friend_request", [bob]);
  await call(alice, "cancel_friend_request", [bob]);
  assert.equal(await count("friend_requests"), 0);
  assert.equal(await count("friendships"), 0);
});
test("snapshots show names only for the caller’s own relationships", async () => {
  await call(alice, "send_friend_request", [bob]);
  assert.equal((await call(alice, "friend_snapshot"))[0].kind, "outgoing");
  assert.equal((await call(bob, "friend_snapshot"))[0].kind, "incoming");
  assert.deepEqual(await call(charlie, "friend_snapshot"), []);
  await call(bob, "respond_friend_request", [alice, true]);
  const rows = await call(alice, "friend_snapshot");
  assert.equal(rows[0].kind, "friend");
  assert.equal(rows[0].account_id, bob);
  assert.equal(rows[0].username, "bob");
  assert(!Object.keys(rows[0]).includes("email"));
});
test("blocking removes pending requests and hides both directions without disclosing the block", async () => {
  await call(alice, "send_friend_request", [bob]);
  await call(bob, "block_user", [alice]);
  assert.equal(await count("friend_requests"), 0);
  assert.equal((await as(alice, "select * from public.user_blocks")).length, 0);
  assert.equal((await call(bob, "friend_snapshot"))[0].kind, "blocked");
  assert.deepEqual(await call(alice, "friend_snapshot"), []);
  assert.deepEqual(await call(alice, "find_friend", ["bob"]), []);
  assert.deepEqual(await call(bob, "find_friend", ["alice"]), []);
  await assert.rejects(
    call(alice, "send_friend_request", [bob]),
    /account is unavailable/,
  );
  await assert.rejects(
    call(bob, "send_friend_request", [alice]),
    /account is unavailable/,
  );
});
test("blocking removes friendships, and unblocking cannot remove another person’s block", async () => {
  await call(alice, "send_friend_request", [bob]);
  await call(bob, "respond_friend_request", [alice, true]);
  await call(alice, "block_user", [bob]);
  assert.equal(await count("friendships"), 0);
  await call(bob, "unblock_user", [alice]);
  assert.equal(await count("user_blocks"), 1);
  await call(alice, "unblock_user", [bob]);
  assert.equal(await count("user_blocks"), 0);
  assert.equal(await count("friendships"), 0);
});
test("removing friends is bilateral and unrelated users cannot remove them", async () => {
  await call(alice, "send_friend_request", [bob]);
  await call(bob, "respond_friend_request", [alice, true]);
  await call(charlie, "remove_friend", [bob]);
  assert.equal(await count("friendships"), 1);
  await call(bob, "remove_friend", [alice]);
  assert.equal(await count("friendships"), 0);
});
test("request sending is limited even after requests are cancelled", async () => {
  for (let index = 0; index < 20; index++) {
    await call(alice, "send_friend_request", [bob]);
    await call(alice, "cancel_friend_request", [bob]);
  }
  await assert.rejects(
    call(alice, "send_friend_request", [bob]),
    /Too many requests/,
  );
  assert.equal(await count("friend_requests"), 0);
});
test("lookup limits do not expose a bulk profile directory", async () => {
  for (let index = 0; index < 60; index++)
    await call(alice, "find_friend", ["missing"]);
  await assert.rejects(
    call(alice, "find_friend", ["bob"]),
    /Too many requests/,
  );
});
test("account deletion cascades relationships, blocks and private counters", async () => {
  await call(alice, "send_friend_request", [bob]);
  await call(charlie, "block_user", [alice]);
  await db.query("delete from auth.users where id=$1", [alice]);
  assert.equal(await count("friend_requests"), 0);
  assert.equal(await count("user_blocks"), 0);
  assert.equal(
    (
      await db.query(
        "select * from azuria_private.social_limits where user_id=$1",
        [alice],
      )
    ).rows.length,
    0,
  );
});
