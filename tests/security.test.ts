import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
const A = "00000000-0000-4000-8000-000000000001",
  B = "00000000-0000-4000-8000-000000000002",
  C = "00000000-0000-4000-8000-000000000003";
const W = "00000000-0000-4000-8000-000000000010",
  W2 = "00000000-0000-4000-8000-000000000020";
const M1 = "00000000-0000-4000-8000-000000000101",
  M2 = "00000000-0000-4000-8000-000000000102",
  M3 = "00000000-0000-4000-8000-000000000103";
test("real PostgreSQL migration, tenant isolation, source permissions, and atomic writes", async (t) => {
  const pg = new PGlite({ extensions: { vector } });
  try {
    await pg.exec(`create schema auth; create schema storage; create schema extensions;
 create role anon; create role authenticated; create role service_role bypassrls;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;`);
    await pg.exec(await readFile("supabase/migrations/001_brain.sql", "utf8"));
    // Verify upgrades from 001 and repeated paste-and-run setup are safe.
    await pg.exec(await readFile("supabase/setup.sql", "utf8"));
    await pg.exec(await readFile("supabase/setup.sql", "utf8"));
    await pg.exec(`grant usage on schema public,auth,extensions,storage to authenticated,service_role;grant all on all tables in schema public,storage to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;
 insert into auth.users values('${A}'),('${B}'),('${C}');insert into workspaces(id,name) values('${W}','Digizag'),('${W2}','Other');insert into members values('${A}','${W}'),('${B}','${W}'),('${C}','${W2}');`);
    const emb = JSON.stringify([1, ...Array(1535).fill(0)]);
    async function as(user: string) {
      await pg.exec(
        `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${user}',false);`,
      );
    }
    async function write(
      id: string,
      owner: string,
      workspace: string,
      visibility: string,
    ) {
      return pg.query("select write_memory($1::jsonb,$2::jsonb)", [
        JSON.stringify({
          id,
          owner_id: owner,
          workspace_id: workspace,
          title: "Noon decision",
          content: "Campaign paused",
          source: "note",
          visibility,
          content_hash: "test",
        }),
        JSON.stringify([
          { content: "Noon campaign paused", position: 0, embedding: emb },
        ]),
      ]);
    }
    await as(A);
    await write(M1, A, W, "private");
    await write(M2, A, W, "workspace");
    await as(C);
    await write(M3, C, W2, "workspace");
    await t.test(
      "private memory and another workspace are excluded from vector search",
      async () => {
        await as(B);
        const rows = await pg.query<{ id: string }>(
          "select id from search_memory($1::extensions.vector,$2,$3)",
          [emb, "Noon", W],
        );
        assert.deepEqual(
          rows.rows.map((r) => r.id),
          [M2],
        );
        const other = await pg.query(
          "select id from search_memory($1::extensions.vector,$2,$3)",
          [emb, "Noon", W2],
        );
        assert.equal(other.rows.length, 0);
      },
    );
    await t.test(
      "shared readers cannot update or delete another author’s source",
      async () => {
        await as(B);
        const changed = await pg.query(
          "update memories set content=$1 where id=$2 returning id",
          ["tampered", M2],
        );
        assert.equal(changed.rows.length, 0);
        const deleted = await pg.query(
          "delete from memories where id=$1 returning id",
          [M2],
        );
        assert.equal(deleted.rows.length, 0);
        await assert.rejects(write(M2, B, W, "workspace"));
      },
    );
    await t.test("workspace membership cannot be self-assigned", async () => {
      await as(B);
      const changed = await pg.query(
        "update members set workspace_id=$1 where user_id=$2 returning user_id",
        [W2, B],
      );
      assert.equal(changed.rows.length, 0);
      await assert.rejects(write(crypto.randomUUID(), B, W2, "workspace"));
    });
    await t.test(
      "workspace tasks can be assigned and updated only inside their workspace",
      async () => {
        const task = crypto.randomUUID();
        await as(A);
        await pg.query(
          "insert into tasks(id,workspace_id,creator_id,assignee_id,title) values($1,$2,$3,$4,'Prepare report')",
          [task, W, A, B],
        );
        await as(B);
        assert.equal(
          (
            await pg.query(
              "update tasks set status='on_it' where id=$1 returning status",
              [task],
            )
          ).rows.length,
          1,
        );
        await as(C);
        assert.equal(
          (await pg.query("select id from tasks where id=$1", [task])).rows
            .length,
          0,
        );
        await assert.rejects(
          pg.query(
            "insert into tasks(workspace_id,creator_id,assignee_id,title) values($1,$2,$3,'Forged task')",
            [W, C, A],
          ),
        );
        await as(A);
        await assert.rejects(
          pg.query("update tasks set assignee_id=$1 where id=$2", [C, task]),
        );
      },
    );
    await t.test(
      "failed vector replacement rolls back the content update",
      async () => {
        await as(A);
        await assert.rejects(
          pg.query("select write_memory($1::jsonb,$2::jsonb)", [
            JSON.stringify({
              id: M1,
              owner_id: A,
              workspace_id: W,
              title: "Bad replacement",
              content: "changed",
              source: "note",
              visibility: "private",
              content_hash: "new",
            }),
            JSON.stringify([
              { content: "bad", position: 0, embedding: "[1,2]" },
            ]),
          ]),
        );
        const result = await pg.query<{ title: string }>(
          "select title from memories where id=$1",
          [M1],
        );
        assert.equal(result.rows[0].title, "Noon decision");
      },
    );
    await t.test(
      "removing memory also removes its searchable chunks",
      async () => {
        await as(A);
        await pg.query("delete from memories where id=$1", [M1]);
        const result = await pg.query(
          "select id from chunks where memory_id=$1",
          [M1],
        );
        assert.equal(result.rows.length, 0);
      },
    );
    await t.test(
      "users cannot claim worker jobs or spoof another user’s rate limit",
      async () => {
        await as(A);
        await assert.rejects(pg.query("select claim_connection($1)", [M1]));
        await assert.rejects(pg.query("select consume_request($1)", [B]));
      },
    );
    await t.test(
      "chat deletion removes captured memory and vectors and queues file cleanup",
      async () => {
        await as(A);
        const chat = "00000000-0000-4000-8000-000000000501";
        const memory = "00000000-0000-4000-8000-000000000502";
        await pg.query(
          "insert into conversations(id,workspace_id,owner_id,title) values($1,$2,$3,'File chat')",
          [chat, W, A],
        );
        const record = {
          id: memory,
          workspace_id: W,
          owner_id: A,
          title: "Plan.xlsx",
          content: "Plan",
          source: "file",
          visibility: "workspace",
          metadata: { conversation_id: chat, storage_path: `${A}/plan.xlsx` },
          content_hash: "x",
        };
        const pieces = JSON.stringify([
          { content: "Plan", position: 0, embedding: emb },
        ]);
        await pg.query("select write_memory($1::jsonb,$2::jsonb)", [
          JSON.stringify(record),
          pieces,
        ]);
        await as(B);
        assert.equal(
          (
            await pg.query(
              "delete from conversations where id=$1 returning id",
              [chat],
            )
          ).rows.length,
          0,
        );
        await assert.rejects(
          pg.query("select write_memory($1::jsonb,$2::jsonb)", [
            JSON.stringify({ ...record, id: crypto.randomUUID(), owner_id: B }),
            pieces,
          ]),
        );
        await as(A);
        await pg.query("delete from conversations where id=$1", [chat]);
        assert.equal(
          (await pg.query("select id from memories where id=$1", [memory])).rows
            .length,
          0,
        );
        assert.equal(
          (await pg.query("select id from chunks where memory_id=$1", [memory]))
            .rows.length,
          0,
        );
        await assert.rejects(
          pg.query("select write_memory($1::jsonb,$2::jsonb)", [
            JSON.stringify(record),
            pieces,
          ]),
        );
        await pg.exec("reset role");
        assert.equal(
          (
            await pg.query(
              "select path from storage_deletions where owner_id=$1",
              [A],
            )
          ).rows.length,
          1,
        );
      },
    );
    await t.test(
      "members cannot promote themselves; suspended sessions cannot retrieve memory",
      async () => {
        await as(B);
        assert.equal(
          (
            await pg.query(
              "update members set role='owner' where user_id=$1 returning user_id",
              [B],
            )
          ).rows.length,
          0,
        );
        await pg.exec("reset role");
        await pg.query("update members set disabled=true where user_id=$1", [
          B,
        ]);
        await as(B);
        assert.equal((await pg.query("select * from memories")).rows.length, 0);
        assert.equal((await pg.query("select * from members")).rows.length, 0);
        await assert.rejects(write(crypto.randomUUID(), B, W, "private"));
        await pg.exec("reset role");
        await pg.query("update members set disabled=false where user_id=$1", [
          B,
        ]);
      },
    );
    await t.test(
      "knowledge retrieval respects exact IDs, source dates, generated exclusions and private history",
      async () => {
        await pg.exec("reset role");
        await pg.query("update members set role='owner' where user_id=$1", [A]);
        const ids = [
          crypto.randomUUID(),
          crypto.randomUUID(),
          crypto.randomUUID(),
          crypto.randomUUID(),
        ];
        await as(A);
        for (let i = 0; i < 4; i++)
          await pg.query("select write_memory($1::jsonb,$2::jsonb)", [
            JSON.stringify({
              id: ids[i],
              workspace_id: W,
              owner_id: A,
              title: "Offer update",
              content: `Offer ${i === 1 ? "145340" : "14534"} has payout ${i + 20}`,
              source: "note",
              visibility: i === 2 ? "private" : "workspace",
              content_hash: "x",
              metadata: {
                reported_at: i === 0 ? "2026-01-01" : "2026-09-01",
                generated: i === 3,
              },
            }),
            JSON.stringify([
              {
                content: `Offer ${i === 1 ? "145340" : "14534"} has payout ${i + 20}`,
                position: 0,
                embedding: JSON.stringify([0, 1, ...Array(1534).fill(0)]),
              },
            ]),
          ]);
        await as(B);
        const found = await pg.query<{ id: string }>(
          "select * from search_memory_v2($1::extensions.vector,$2,$3,$4::text[])",
          [emb, "14534", W, ["14534"]],
        );
        assert.ok(found.rows.some((r) => r.id === ids[0]));
        assert.ok(
          !found.rows.some(
            (r) => r.id === ids[1] || r.id === ids[2] || r.id === ids[3],
          ),
        );
        await assert.rejects(
          pg.query(
            "insert into knowledge_rules(workspace_id,content) values($1,'forged rule')",
            [W],
          ),
        );
        await as(A);
        await pg.query(
          "insert into knowledge_rules(workspace_id,content) values($1,'Explicit alias: Noon GCC = Noon Gulf')",
          [W],
        );
        await pg.query(
          "update memories set content='Corrected version' where id=$1",
          [ids[0]],
        );
        assert.equal(
          (
            await pg.query(
              "select * from memory_revisions where memory_id=$1",
              [ids[0]],
            )
          ).rows.length,
          1,
        );
        await as(B);
        assert.equal(
          (
            await pg.query(
              "select * from memory_revisions where memory_id=$1",
              [ids[0]],
            )
          ).rows.length,
          0,
        );
        assert.equal(
          (await pg.query("select * from knowledge_rules")).rows.length,
          1,
        );
        await as(C);
        assert.equal(
          (await pg.query("select * from knowledge_rules")).rows.length,
          0,
        );
        await as(A);
        await pg.query("delete from memories where id=$1", [ids[0]]);
        assert.equal(
          (
            await pg.query(
              "select * from memory_revisions where memory_id=$1",
              [ids[0]],
            )
          ).rows.length,
          0,
        );
      },
    );
    await t.test(
      "sent-date listing sorts before its limit and preserves RLS",
      async () => {
        await as(A);
        await pg.query(
          `insert into memories(workspace_id,owner_id,title,content,source,visibility,metadata,content_hash,created_at)
      select $1,$2,'Old mail '||n,'body','gmail','private','{"date":"2020-01-01T00:00:00Z"}'::jsonb,'x','2026-10-01'::timestamptz from generate_series(1,501) n`,
          [W, A],
        );
        const latest = crypto.randomUUID();
        await pg.query(
          `insert into memories(id,workspace_id,owner_id,title,content,source,visibility,metadata,content_hash,created_at) values($1,$2,$3,'Latest sent','body','pumble','private','{"datetime":"2026-09-22T10:00:00Z"}'::jsonb,'x','2024-01-01')`,
          [latest, W, A],
        );
        const found = await pg.query<{ id: string }>(
          "select id from list_memories_by_date()",
        );
        assert.equal(found.rows.length, 500);
        assert.ok(found.rows.some((r) => r.id === latest));
        await as(B);
        assert.ok(
          !(
            await pg.query<{ id: string }>(
              "select id from list_memories_by_date()",
            )
          ).rows.some((r) => r.id === latest),
        );
      },
    );
    await t.test("original uploads stay private to their owner", async () => {
      await as(A);
      await pg.query(
        "insert into storage.objects(bucket_id,name) values($1,$2)",
        ["knowledge", `${A}/document.txt`],
      );
      await as(B);
      const result = await pg.query("select * from storage.objects");
      assert.equal(result.rows.length, 0);
      await assert.rejects(
        pg.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
          "knowledge",
          `${A}/forged.txt`,
        ]),
      );
    });
  } finally {
    await pg.close();
  }
});
