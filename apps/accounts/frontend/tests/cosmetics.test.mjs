import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createTestDatabase } from "./helpers/database.mjs";
const alice = "11111111-1111-4111-8111-111111111111",
  bob = "22222222-2222-4222-8222-222222222222",
  admin = "33333333-3333-4333-8333-333333333333";
const session = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let db;
before(async () => {
  db = await createTestDatabase();
  for (const [id, name] of [
    [alice, "alice"],
    [bob, "bob"],
    [admin, "admin"],
  ]) {
    await db.query(
      "insert into auth.users(id,email_confirmed_at) values($1,now())",
      [id],
    );
    await db.query(
      "insert into public.profiles(id,username,display_name) values($1,$2,$2)",
      [id, name],
    );
  }
  await db.query("insert into public.admin_roles(user_id) values($1)", [admin]);
  await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [
    session,
    admin,
  ]);
  await db.exec(
    "insert into public.cosmetic_capes values('exclusive','Exclusive','Admin grant only','exclusive.png',true,false)",
  );
});
after(async () => await db?.close());
beforeEach(async () => {
  await db.exec(
    "delete from public.cosmetic_equipment;delete from public.cosmetic_ownership;delete from public.cosmetic_minecraft_links;delete from azuria_private.cosmetic_grants;update auth.users set banned_until=null;update public.cosmetic_capes set enabled=true;",
  );
});
async function as(id, sql, params = [], role = "authenticated", aal = "aal2") {
  await db.exec("begin");
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: id, session_id: session, aal }),
    ]);
    const result = await db.query(sql, params);
    await db.exec("commit");
    return result.rows;
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}
const rpc = (id, name, args = [], role = "authenticated", aal = "aal2") =>
  as(
    id,
    `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) as value`,
    args,
    role,
    aal,
  ).then((rows) => rows[0].value);
test("signed-out and unverified callers cannot inspect or mutate a wardrobe", async () => {
  await assert.rejects(
    rpc(null, "cosmetics_snapshot", [], "anon"),
    /permission denied/,
  );
  await db.query("update auth.users set email_confirmed_at=null where id=$1", [
    bob,
  ]);
  await assert.rejects(rpc(bob, "cosmetics_snapshot"), /verified/);
  await db.query("update auth.users set email_confirmed_at=now() where id=$1", [
    bob,
  ]);
  for (const table of [
    "cosmetic_capes",
    "cosmetic_ownership",
    "cosmetic_equipment",
    "cosmetic_minecraft_links",
  ])
    await assert.rejects(
      as(alice, `select * from public.${table}`),
      /permission denied/,
    );
  await assert.rejects(
    as(
      alice,
      "insert into public.cosmetic_ownership values($1,'exclusive',now())",
      [alice],
    ),
    /permission denied/,
  );
});
test("free claims are idempotent and account scoped; exclusive capes cannot be claimed", async () => {
  await rpc(alice, "cosmetics_claim", ["azuria-starter"]);
  await rpc(alice, "cosmetics_claim", ["azuria-starter"]);
  const a = await rpc(alice, "cosmetics_snapshot"),
    b = await rpc(bob, "cosmetics_snapshot");
  assert.equal(a.accountId, alice);
  assert.equal(a.capes.find((c) => c.id === "azuria-starter").owned, true);
  assert.equal(
    b.capes.every((c) => !c.owned),
    true,
  );
  assert.equal(
    (await db.query("select * from public.cosmetic_ownership")).rows.length,
    1,
  );
  await assert.rejects(
    rpc(alice, "cosmetics_claim", ["exclusive"]),
    /cannot be claimed/,
  );
});
test("equipping requires ownership, has one slot, and supports unequip", async () => {
  await assert.rejects(
    rpc(alice, "cosmetics_equip", ["azuria-starter"]),
    /Own an available/,
  );
  await rpc(alice, "cosmetics_claim", ["azuria-starter"]);
  await rpc(alice, "cosmetics_equip", ["azuria-starter"]);
  assert.equal(
    (await rpc(alice, "cosmetics_snapshot")).equipped,
    "azuria-starter",
  );
  assert.equal((await rpc(bob, "cosmetics_snapshot")).equipped, null);
  await rpc(alice, "cosmetics_equip", [null]);
  assert.equal((await rpc(alice, "cosmetics_snapshot")).equipped, null);
});
test("only verification service can link UUIDs; links cannot be stolen or silently replaced", async () => {
  await assert.rejects(
    rpc(alice, "cosmetics_link_verified", [bob, "a".repeat(32)]),
    /permission denied/,
  );
  await rpc(
    null,
    "cosmetics_link_verified",
    [alice, "a".repeat(32)],
    "service_role",
  );
  await rpc(
    null,
    "cosmetics_link_verified",
    [alice, "a".repeat(32)],
    "service_role",
  );
  await assert.rejects(
    rpc(null, "cosmetics_link_verified", [bob, "a".repeat(32)], "service_role"),
    /unique constraint/,
  );
  await assert.rejects(
    rpc(
      null,
      "cosmetics_link_verified",
      [alice, "b".repeat(32)],
      "service_role",
    ),
    /Unlink/,
  );
  await assert.rejects(
    rpc(null, "cosmetics_link_verified", [bob, "not-a-uuid"], "service_role"),
    /check constraint/,
  );
  await rpc(alice, "cosmetics_unlink");
  assert.equal((await rpc(alice, "cosmetics_snapshot")).minecraftUuid, null);
});
test("public renderer lookup exposes only selected cape and stops on disable, suspension or unlink", async () => {
  await rpc(alice, "cosmetics_claim", ["azuria-starter"]);
  await rpc(alice, "cosmetics_equip", ["azuria-starter"]);
  await rpc(
    null,
    "cosmetics_link_verified",
    [alice, "a".repeat(32)],
    "service_role",
  );
  assert.deepEqual(
    await rpc(null, "cosmetics_cape", ["a".repeat(32)], "anon"),
    { id: "azuria-starter", texture: "azuria-starter.png" },
  );
  await db.exec(
    "update public.cosmetic_capes set enabled=false where id='azuria-starter'",
  );
  assert.equal(
    await rpc(null, "cosmetics_cape", ["a".repeat(32)], "anon"),
    null,
  );
  assert.equal((await rpc(alice, "cosmetics_snapshot")).equipped, null);
  await assert.rejects(
    rpc(alice, "cosmetics_equip", ["azuria-starter"]),
    /Own an available/,
  );
  await db.exec("update public.cosmetic_capes set enabled=true");
  await db.query(
    "update auth.users set banned_until=now()+interval '1 day' where id=$1",
    [alice],
  );
  assert.equal(
    await rpc(null, "cosmetics_cape", ["a".repeat(32)], "anon"),
    null,
  );
  await assert.rejects(rpc(alice, "cosmetics_snapshot"), /verified/);
  await db.query("update auth.users set banned_until=null where id=$1", [
    alice,
  ]);
  await rpc(alice, "cosmetics_unlink");
  assert.equal(
    await rpc(null, "cosmetics_cape", ["a".repeat(32)], "anon"),
    null,
  );
});
test("admin grants require a live MFA admin; revocation clears equipment and writes audit", async () => {
  await assert.rejects(
    rpc(alice, "cosmetics_admin_grant", [alice, "exclusive", true]),
    /Admin access/,
  );
  await assert.rejects(
    rpc(
      admin,
      "cosmetics_admin_grant",
      [alice, "exclusive", true],
      "authenticated",
      "aal1",
    ),
    /authenticator/,
  );
  await rpc(admin, "cosmetics_admin_grant", [alice, "exclusive", true]);
  await rpc(alice, "cosmetics_equip", ["exclusive"]);
  await rpc(admin, "cosmetics_admin_grant", [alice, "exclusive", false]);
  assert.equal((await rpc(alice, "cosmetics_snapshot")).equipped, null);
  assert.equal(
    (await db.query("select * from azuria_private.cosmetic_grants")).rows
      .length,
    2,
  );
  await db.query("delete from auth.sessions where id=$1", [session]);
  await assert.rejects(
    rpc(admin, "cosmetics_admin_grant", [alice, "exclusive", true]),
    /Admin access/,
  );
  await db.query("insert into auth.sessions values($1,$2)", [session, admin]);
});
test("deleting an account removes its ownership, selection and public link", async () => {
  await rpc(bob, "cosmetics_claim", ["azuria-starter"]);
  await rpc(bob, "cosmetics_equip", ["azuria-starter"]);
  await rpc(
    null,
    "cosmetics_link_verified",
    [bob, "b".repeat(32)],
    "service_role",
  );
  await db.query("delete from auth.users where id=$1", [bob]);
  for (const table of [
    "cosmetic_ownership",
    "cosmetic_equipment",
    "cosmetic_minecraft_links",
  ])
    assert.equal(
      (await db.query(`select * from public.${table} where user_id=$1`, [bob]))
        .rows.length,
      0,
    );
  assert.equal(
    await rpc(null, "cosmetics_cape", ["b".repeat(32)], "anon"),
    null,
  );
});
