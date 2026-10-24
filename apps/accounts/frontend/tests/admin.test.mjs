import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { authenticatorQrSource } from "../src/admin.js";
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
  for (const file of [
    "202610200001_accounts.sql",
    "202610200002_friends.sql",
    "202610200003_admin.sql",
    "202610240001_feedback.sql",
    "202610240002_feedback_comments.sql",
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
    "delete from public.launcher_feedback; delete from public.admin_audit; delete from azuria_private.social_limits; delete from auth.sessions; update auth.users set banned_until=null;",
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

test("admin roles are assigned outside user-editable profiles and metadata", async () => {
  assert.equal((await rpc(admin, "admin_access"))[0].admin_access, true);
  assert.equal(
    (
      await rpc(normal, "admin_access", [], {
        claims: {
          user_metadata: { role: "admin" },
          app_metadata: { role: "admin" },
        },
      })
    )[0].admin_access,
    false,
  );
  await assert.rejects(
    as(normal, "insert into public.admin_roles(user_id) values ($1)", [normal]),
    /permission denied/,
  );
  await assert.rejects(
    as(admin, "select * from public.admin_roles"),
    /permission denied/,
  );
  await assert.rejects(rpc(normal, "admin_overview"), /Admin access requires/);
  await assert.rejects(
    as(null, "select public.admin_access()", [], { role: "anon" }),
    /permission denied/,
  );
});
test("admin data requires MFA and a live unrevoked session", async () => {
  await assert.rejects(
    rpc(admin, "admin_overview", [], { claims: { aal: "aal1" } }),
    /authenticator code/,
  );
  await db.query("delete from auth.sessions where user_id=$1", [admin]);
  assert.equal((await rpc(admin, "admin_access"))[0].admin_access, false);
  await assert.rejects(rpc(admin, "admin_accounts"), /Admin access requires/);
});
test("suspended administrators lose privileged access immediately", async () => {
  await db.query(
    "update auth.users set banned_until=now()+interval '1 day' where id=$1",
    [admin],
  );
  assert.equal((await rpc(admin, "admin_access"))[0].admin_access, false);
  await assert.rejects(rpc(admin, "admin_overview"), /Admin access requires/);
});
test("overview and bounded searches return only intended account fields", async () => {
  const stats = (await rpc(admin, "admin_overview"))[0].admin_overview;
  assert.deepEqual(stats, { accounts: 4, verified: 4, suspended: 0 });
  const accounts = await rpc(admin, "admin_accounts", ["tar", 0]);
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].id, target);
  assert(
    !Object.keys(accounts[0]).some((key) => /password|token|secret/.test(key)),
  );
  assert.equal((await rpc(admin, "admin_accounts", ["%", 0])).length, 0);
  await assert.rejects(
    rpc(admin, "admin_accounts", ["", -1]),
    /Invalid search/,
  );
});
test("account changes require a fresh password even when MFA is satisfied", async () => {
  const old = {
    amr: [
      { method: "password", timestamp: Math.floor(Date.now() / 1000) - 1200 },
    ],
  };
  await assert.rejects(
    rpc(admin, "admin_prepare_action", [target, "suspend", "Test reason"], {
      claims: old,
    }),
    /Verify your password again/,
  );
  await assert.rejects(
    rpc(admin, "admin_prepare_action", [target, "suspend", "Test reason"], {
      claims: { amr: [] },
    }),
    /Verify your password again/,
  );
  assert.equal(
    (await db.query("select * from public.admin_audit")).rows.length,
    0,
  );
});
test("own account and all administrators are protected from moderation", async () => {
  for (const id of [admin, otherAdmin])
    await assert.rejects(
      rpc(admin, "admin_prepare_action", [id, "suspend", "Test reason"]),
      /protected/,
    );
  await assert.rejects(
    rpc(admin, "admin_prepare_action", [target, "delete", "Test reason"]),
    /Choose an action/,
  );
  await assert.rejects(
    rpc(admin, "admin_prepare_action", [target, "suspend", "x"]),
    /Choose an action/,
  );
});
test("actions are audited before external changes and cannot overwrite a pending target", async () => {
  const id = (
    await rpc(admin, "admin_prepare_action", [
      target,
      "suspend",
      "Repeated spam",
    ])
  )[0].admin_prepare_action;
  const record = (await rpc(admin, "admin_history"))[0];
  assert.equal(record.id, id);
  assert.equal(record.actor_id, admin);
  assert.equal(record.outcome, "pending");
  await assert.rejects(
    rpc(otherAdmin, "admin_prepare_action", [
      target,
      "restore",
      "Checked appeal",
    ]),
    /unique constraint/,
  );
  await assert.rejects(
    rpc(admin, "admin_finish_action", [id, true]),
    /permission denied/,
  );
  await as(null, "select public.admin_finish_action($1,$2)", [id, true], {
    role: "service_role",
  });
  assert.equal((await rpc(admin, "admin_history"))[0].outcome, "succeeded");
  await assert.rejects(
    as(null, "select public.admin_finish_action($1,$2)", [id, false], {
      role: "service_role",
    }),
    /not pending/,
  );
});
test("ordinary users cannot read or alter audit records", async () => {
  await assert.rejects(
    as(normal, "select * from public.admin_audit"),
    /permission denied/,
  );
  await assert.rejects(
    as(admin, "update public.admin_audit set outcome='succeeded'"),
    /permission denied/,
  );
  await assert.rejects(rpc(normal, "admin_history"), /Admin access requires/);
});
test("suspended users cannot use existing friends sessions", async () => {
  await db.query(
    "update auth.users set banned_until=now()+interval '1 day' where id=$1",
    [target],
  );
  await assert.rejects(
    rpc(target, "friend_snapshot"),
    /verified Azuria profile/,
  );
});
test("audit history survives deletion of the affected account", async () => {
  const audit = (
    await rpc(admin, "admin_prepare_action", [
      target,
      "suspend",
      "Test audit retention",
    ])
  )[0].admin_prepare_action;
  await db.query("delete from auth.users where id=$1", [target]);
  assert.equal(
    (
      await db.query("select target_id from public.admin_audit where id=$1", [
        audit,
      ])
    ).rows[0].target_id,
    target,
  );
});

test("authenticator QR rendering handles the SDK data URI without double-wrapping it", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path /></svg>';
  const source = authenticatorQrSource(`data:image/svg+xml;utf-8,${svg}`);
  assert.equal(decodeURIComponent(source.split(",").slice(1).join(",")), svg);
  assert.equal(authenticatorQrSource(svg), source);
  assert.throws(
    () => authenticatorQrSource("https://external.test/qr.svg"),
    /Invalid authenticator/,
  );
});

const feedbackAnswers = {
  launchers: ["azuria", "prism"],
  appeal: ["simple"],
  priorities: ["privacy", "mods"],
  frustrations: ["none"],
  azuria: ["speed"],
  playstyle: ["vanilla"],
};
const feedbackId = "55555555-5555-4555-8555-555555555555";
test("feedback writes require service role; public users cannot read responses", async () => {
  for (const role of ["anon", "authenticated"]) {
    await assert.rejects(
      rpc(normal, "feedback_submit", [feedbackId, 1, feedbackAnswers], {
        role,
      }),
      /permission denied/,
    );
    await assert.rejects(
      as(normal, "select * from public.launcher_feedback", [], { role }),
      /permission denied/,
    );
  }
  await rpc(null, "feedback_submit", [feedbackId, 1, feedbackAnswers], {
    role: "service_role",
  });
  assert.equal(
    (await db.query("select count(*) from public.launcher_feedback")).rows[0]
      .count,
    1,
  );
});
test("feedback validates selections, unknown fields, missing answers and versions", async () => {
  for (const [version, answers] of [
    [2, feedbackAnswers],
    [1, { ...feedbackAnswers, launchers: ["invented"] }],
    [1, { ...feedbackAnswers, appeal: [] }],
    [1, { ...feedbackAnswers, playstyle: ["vanilla", "vanilla"] }],
    [1, { ...feedbackAnswers, email: "person@example.com" }],
    [1, { ...feedbackAnswers, appeal: "simple" }],
  ]) {
    await assert.rejects(
      rpc(null, "feedback_submit", [feedbackId, version, answers], {
        role: "service_role",
      }),
      /Invalid|Missing/,
    );
  }
});
test("feedback retries are idempotent and admin summaries count each selected option", async () => {
  await rpc(null, "feedback_submit", [feedbackId, 1, feedbackAnswers], {
    role: "service_role",
  });
  await rpc(
    null,
    "feedback_submit",
    [feedbackId, 1, { ...feedbackAnswers, launchers: ["modrinth"] }],
    { role: "service_role" },
  );
  const result = (await rpc(admin, "feedback_admin_summary"))[0]
    .feedback_admin_summary;
  assert.equal(result.total, 1);
  assert.equal(result.counts.launchers.azuria, 1);
  assert.equal(result.counts.launchers.prism, 1);
  assert.equal(result.counts.launchers.modrinth, undefined);
  assert.deepEqual(
    result.schema,
    (await import("../../../azuria-studios/frontend/src/survey-definition.mjs"))
      .survey,
  );
  const responses = await rpc(admin, "feedback_admin_responses", [0]);
  assert.equal(responses.length, 1);
  assert.deepEqual(Object.keys(responses[0]).sort(), [
    "answers",
    "extra_feedback",
    "id",
    "submitted_on",
    "version",
  ]);
  for (const id of [normal, null])
    await assert.rejects(rpc(id, "feedback_admin_summary"), /Admin access/);
  await assert.rejects(
    rpc(admin, "feedback_admin_summary", [], { claims: { aal: "aal1" } }),
    /Admin access/,
  );
  await assert.rejects(
    rpc(admin, "feedback_admin_responses", [-1]),
    /Invalid page/,
  );
});

test("optional comments retain required answers, reject oversize text, and never overwrite retries", async () => {
  for (const key of Object.keys(feedbackAnswers)) {
    const missing = { ...feedbackAnswers };
    delete missing[key];
    await assert.rejects(
      rpc(
        null,
        "feedback_submit_with_comment",
        [feedbackId, 1, missing, "hello"],
        { role: "service_role" },
      ),
      /Invalid|Missing/,
    );
  }
  await assert.rejects(
    rpc(
      null,
      "feedback_submit_with_comment",
      [feedbackId, 1, feedbackAnswers, "x".repeat(2001)],
      { role: "service_role" },
    ),
    /Invalid written/,
  );
  await assert.rejects(
    rpc(normal, "feedback_submit_with_comment", [
      feedbackId,
      1,
      feedbackAnswers,
      "hello",
    ]),
    /permission denied/,
  );
  await rpc(
    null,
    "feedback_submit_with_comment",
    [
      feedbackId,
      1,
      feedbackAnswers,
      "  More themes please.\n<script>alert(1)</script>  ",
    ],
    { role: "service_role" },
  );
  await rpc(
    null,
    "feedback_submit_with_comment",
    [feedbackId, 1, feedbackAnswers, "replacement"],
    { role: "service_role" },
  );
  assert.equal(
    (await rpc(admin, "feedback_admin_responses", [0]))[0].extra_feedback,
    "More themes please.\n<script>alert(1)</script>",
  );
  const second = "66666666-6666-4666-8666-666666666666";
  await rpc(
    null,
    "feedback_submit_with_comment",
    [second, 1, feedbackAnswers, ""],
    { role: "service_role" },
  );
  assert.equal(
    (
      await db.query(
        "select extra_feedback from public.launcher_feedback where id=$1",
        [second],
      )
    ).rows[0].extra_feedback,
    "",
  );
});
