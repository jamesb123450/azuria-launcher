import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  profileError,
  passwordError,
  readHandoff,
  friendlyError,
} from "../src/validation.js";

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
let db;
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    grant usage on schema public to anon, authenticated, service_role;
    insert into auth.users values ('${alice}'), ('${bob}');`);
  await db.exec(
    await readFile(
      new URL(
        "../../../../services/accounts/supabase/migrations/202610200001_accounts.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
});
after(async () => {
  await db?.close();
});
async function as(role, id, sql, params = []) {
  await db.exec("begin");
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [
      id || "",
    ]);
    const result = await db.query(sql, params);
    await db.exec("commit");
    return result;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}
const hash = (text) => createHash("sha256").update(text).digest("base64url");

test("profile and password validation returns clear errors", () => {
  assert.equal(profileError("azuria_123", "James"), "");
  for (const value of ["ab", "James", "with space", "<script>", "a".repeat(25)])
    assert.ok(profileError(value, "James"));
  assert.ok(profileError("james", " ".repeat(3)));
  assert.ok(passwordError("too short", "too short"));
  assert.ok(passwordError("longer-password", "different"));
  assert.equal(passwordError("longer-password", "longer-password"), "");
});
test("handoff parser accepts only SHA-256 URL-safe challenges", () => {
  assert.equal(readHandoff(`#challenge=${hash("verifier")}`), hash("verifier"));
  assert.equal(readHandoff("#challenge=https://evil.test"), null);
  assert.equal(readHandoff("#access_token=secret"), null);
  assert.equal(
    friendlyError({ message: "secret credentials leaked" }).includes("secret"),
    false,
  );
});
test("RLS exposes only the caller’s profile and blocks cross-account edits", async () => {
  await as(
    "authenticated",
    alice,
    "insert into public.profiles(id, username, display_name) values ($1,$2,$3)",
    [alice, "alice", "Alice"],
  );
  await as(
    "authenticated",
    bob,
    "insert into public.profiles(id, username, display_name) values ($1,$2,$3)",
    [bob, "bob", "Bob"],
  );
  assert.equal(
    (await as("authenticated", alice, "select * from public.profiles")).rows
      .length,
    1,
  );
  assert.equal(
    (await as("authenticated", bob, "select * from public.profiles")).rows[0]
      .username,
    "bob",
  );
  const changed = await as(
    "authenticated",
    alice,
    "update public.profiles set display_name = 'Hacked' where id = $1 returning id",
    [bob],
  );
  assert.equal(changed.rows.length, 0);
  await assert.rejects(
    as("anon", null, "select * from public.profiles"),
    /permission denied/,
  );
});
test("database enforces username uniqueness, formatting and immutable identity", async () => {
  await assert.rejects(
    as("authenticated", bob, "update public.profiles set username = 'alice'"),
    /unique constraint/,
  );
  await assert.rejects(
    as("authenticated", bob, "update public.profiles set username = 'Bob'"),
    /check constraint/,
  );
  await assert.rejects(
    as("authenticated", bob, "update public.profiles set display_name = ''"),
    /check constraint/,
  );
  await assert.rejects(
    as("authenticated", alice, "update public.profiles set id = $1", [bob]),
    /permission denied/,
  );
  await assert.rejects(
    as("authenticated", alice, "update public.profiles set created_at = now()"),
    /permission denied/,
  );
});
test("grant tables and privileged functions reject ordinary users", async () => {
  await assert.rejects(
    as("authenticated", alice, "select * from public.desktop_grants"),
    /permission denied/,
  );
  await assert.rejects(
    as("anon", null, "select public.consume_desktop_grant($1,$2)", [
      hash("code"),
      hash("verifier"),
    ]),
    /permission denied/,
  );
  await assert.rejects(
    as("authenticated", alice, "select public.issue_desktop_grant($1,$2,$3)", [
      bob,
      hash("code"),
      hash("verifier"),
    ]),
    /permission denied/,
  );
});
test("grants require the correct verifier, expire, and can only be consumed once", async () => {
  const code = hash("secret code"),
    challenge = hash("private verifier");
  await as(
    "service_role",
    null,
    "select public.issue_desktop_grant($1,$2,$3)",
    [alice, hash(code), challenge],
  );
  assert.equal(
    (
      await as(
        "service_role",
        null,
        "select public.consume_desktop_grant($1,$2) as id",
        [hash(code), hash("wrong verifier")],
      )
    ).rows[0].id,
    null,
  );
  assert.equal(
    (
      await as(
        "service_role",
        null,
        "select public.consume_desktop_grant($1,$2) as id",
        [hash(code), challenge],
      )
    ).rows[0].id,
    alice,
  );
  assert.equal(
    (
      await as(
        "service_role",
        null,
        "select public.consume_desktop_grant($1,$2) as id",
        [hash(code), challenge],
      )
    ).rows[0].id,
    null,
  );
  await as(
    "service_role",
    null,
    "select public.issue_desktop_grant($1,$2,$3)",
    [alice, hash("expired code"), challenge],
  );
  await db.exec(
    "update public.desktop_grants set expires_at = now() - interval '1 second'",
  );
  assert.equal(
    (
      await as(
        "service_role",
        null,
        "select public.consume_desktop_grant($1,$2) as id",
        [hash("expired code"), challenge],
      )
    ).rows[0].id,
    null,
  );
});
test("issuance is limited even after codes have been consumed", async () => {
  for (let index = 0; index < 10; index++) {
    const code = hash(`bob-code-${index}`),
      challenge = hash("verifier");
    await as(
      "service_role",
      null,
      "select public.issue_desktop_grant($1,$2,$3)",
      [bob, code, challenge],
    );
    await as(
      "service_role",
      null,
      "select public.consume_desktop_grant($1,$2)",
      [code, challenge],
    );
  }
  await assert.rejects(
    as("service_role", null, "select public.issue_desktop_grant($1,$2,$3)", [
      bob,
      hash("extra-code"),
      hash("verifier"),
    ]),
    /Too many connection attempts/,
  );
});
test("deleting an auth account cascades its profile and connection records", async () => {
  await db.query("delete from auth.users where id = $1", [bob]);
  assert.equal(
    (await db.query("select * from public.profiles where id = $1", [bob])).rows
      .length,
    0,
  );
  assert.equal(
    (
      await db.query("select * from public.desktop_grants where user_id = $1", [
        bob,
      ])
    ).rows.length,
    0,
  );
});
