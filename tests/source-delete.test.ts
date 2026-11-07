// Deleting a configured source must stop collection without destroying existing public content.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { deleteSource, fetchNow, findDuplicateSource, listSources, previewStoredSource, sourceDetail, updateSource } from "@aihot/backend/admin/sources";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { collectSource } from "@aihot/backend/sources/collect";

after(async () => { await stopBoss(); await closeDb(); });

test("removing a source hides it, blocks even forced fetch, and retains its articles and audit", async () => {
  const id = `delete-${tag()}`;
  const config = { feedUrl: `https://example.com/${id}` };
  const [source] = await sql<{ updated_at: Date }[]>`
    INSERT INTO sources (id, name, kind, config)
    VALUES (${id}, 'Remove me', 'rss', ${sql.json(config)}) RETURNING updated_at`;
  const material = await upsertMaterial({
    sourceId: id, url: `https://example.com/articles/${id}`, title: 'Existing article',
    publishedAt: new Date(), via: 'fetch',
  });
  assert.equal((await listSources({ q: id })).rows.length, 1);

  assert.deepEqual(await deleteSource(id, source!.updated_at.toISOString(), "test"), { id, deleted: true });
  const [row] = await sql<{ enabled: boolean; health: string; deleted_at: Date | null; next_fetch_at: Date | null }[]>`
    SELECT enabled, health, deleted_at, next_fetch_at FROM sources WHERE id = ${id}`;
  assert.equal(row!.enabled, false);
  assert.equal(row!.health, "paused");
  assert.ok(row!.deleted_at);
  assert.equal(row!.next_fetch_at, null);

  assert.equal((await listSources({ q: id })).rows.length, 0);
  assert.equal(await sourceDetail(id), null);
  assert.equal(await previewStoredSource(id), null);
  assert.equal(await fetchNow(id, "test"), null);
  assert.equal(await updateSource(id, { patch: { enabled: true }, version: source!.updated_at.toISOString() }, "test"), null);
  assert.equal((await collectSource(id, { force: true })).status, "skipped");
  assert.equal(await findDuplicateSource("rss", config), null);
  assert.equal((await sql<{ id: string }[]>`SELECT id FROM articles WHERE id = ${material.articleId}`)[0]?.id, material.articleId);

  const [audit] = await sql<{ action: string; reason: string | null }[]>`
    SELECT action, reason FROM audit_log WHERE subject = ${`source:${id}`} ORDER BY id DESC LIMIT 1`;
  assert.equal(audit!.action, "source.delete");
  assert.equal(audit!.reason, null);
  assert.equal(await deleteSource(id, source!.updated_at.toISOString(), "test"), null);
});

test("removal rejects a stale version without hiding the source", async () => {
  const id = `delete-${tag()}`;
  const [source] = await sql<{ updated_at: Date }[]>`
    INSERT INTO sources (id, name, kind)
    VALUES (${id}, 'Keep me', 'rss') RETURNING updated_at`;
  await sql`UPDATE sources SET updated_at = updated_at + interval '1 minute' WHERE id = ${id}`;
  await assert.rejects(deleteSource(id, source!.updated_at.toISOString(), "test"), { code: "conflict" });
  const [row] = await sql<{ deleted_at: Date | null }[]>`SELECT deleted_at FROM sources WHERE id = ${id}`;
  assert.equal(row!.deleted_at, null);
});
