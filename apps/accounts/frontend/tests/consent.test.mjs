import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("signup requires explicit consent and only queues verified marketing opt-ins", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb);`);
    await db.exec(
      await readFile(
        new URL(
          "../../../../services/accounts/supabase/migrations/202610210002_signup_consent.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    for (const metadata of [
      {},
      { legal_accepted: false },
      { legal_accepted: "true" },
    ]) {
      await assert.rejects(
        db.query("insert into auth.users values ($1,$2,null,$3)", [
          "11111111-1111-4111-8111-111111111111",
          "a@example.com",
          metadata,
        ]),
        /acceptance is required/,
      );
    }
    for (const [i, optIn] of [
      [1, true],
      [2, false],
    ]) {
      await db.query("insert into auth.users values ($1,$2,null,$3)", [
        `${i}1111111-1111-4111-8111-111111111111`,
        `${i}@example.com`,
        { legal_accepted: true, marketing_opt_in: optIn },
      ]);
    }
    assert.equal(
      (await db.query("select * from public.pending_marketing_contacts()")).rows
        .length,
      0,
    );
    await db.exec(
      "update auth.users set email_confirmed_at = now(), raw_user_meta_data = '{}'",
    );
    const queued = (
      await db.query("select * from public.pending_marketing_contacts()")
    ).rows;
    assert.equal(queued.length, 1);
    assert.equal(queued[0].email, "1@example.com");
    await db.exec(
      "update public.signup_consents set marketing_synced_at = now()",
    );
    assert.equal(
      (await db.query("select * from public.pending_marketing_contacts()")).rows
        .length,
      0,
    );
    await db.exec("set role authenticated");
    await assert.rejects(
      db.exec("select * from public.signup_consents"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
