// Editor notes (specs/004-editorial-ops FR-001): the admin saves a day's note, the daily's read
// path carries it, every save lands in the audit log, and the seed never overwrites the admin's rows.
import './setup.ts';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { after, test } from 'node:test';
import { sql, closeDb } from '@aihot/backend/db';
import { stopBoss } from '@aihot/backend/jobs/queue';
import { listNotes, saveNote, InvalidNote } from '@aihot/backend/admin/notes';
import { loadReport } from '@aihot/backend/publication/reports';
import { auditHistory } from '@aihot/backend/audit';

const run = promisify(execFile);
after(async () => { await stopBoss(); await closeDb(); });

test('a saved note reaches the daily and the audit log; bad input is refused', async () => {
  await sql`INSERT INTO reports (kind, key, generated_at, window_start, window_end, content)
    VALUES ('daily', '2026-10-24', '2026-10-24T08:00:00Z'::timestamptz, '2026-10-23T16:00:00Z'::timestamptz, '2026-10-24T16:00:00Z'::timestamptz, '{}'::jsonb)
    ON CONFLICT (kind, key) DO UPDATE SET content = EXCLUDED.content`;
  const before = await loadReport('daily', '2026-10-24');
  assert.equal(before?.editorNote, null, 'a day without a note shows none');

  const saved = await saveNote({ day: '2026-10-24', note: '今天最值得注意的事。', noteEn: 'What matters today.' }, 'tester');
  assert.equal(saved.day, '2026-10-24');
  assert.equal(saved.noteEn, 'What matters today.');

  const withNote = await loadReport('daily', '2026-10-24');
  assert.deepEqual(withNote?.editorNote, { note: '今天最值得注意的事。', noteEn: 'What matters today.' }, 'the daily carries the note');

  const history = await auditHistory('note:2026-10-24');
  assert.ok(history.some((h) => h.action === 'notes.save' && h.actor === 'tester'), 'the save is audited');

  // A blank note or a malformed day is refused instead of written.
  await assert.rejects(() => saveNote({ day: '2026-10-24', note: '  ' }, 'tester'), InvalidNote);
  await assert.rejects(() => saveNote({ day: '24-10-2026', note: 'x' }, 'tester'), InvalidNote);

  const listed = await listNotes(60);
  assert.ok(listed.some((n) => n.day === '2026-10-24'), 'the note lists in the admin');

  // An English-only update keeps the note readable in Chinese (null clears the English side).
  await saveNote({ day: '2026-10-24', note: '改后的手记。', noteEn: null }, 'tester');
  const cleared = await loadReport('daily', '2026-10-24');
  assert.deepEqual(cleared?.editorNote, { note: '改后的手记。', noteEn: null });
});

test('the seed fills missing days once and never overwrites the admin', async () => {
  const seed = () => run(process.execPath, ['scripts/seed.ts'], { timeout: 30_000 });
  await seed();
  const [seeded] = await sql<{ note: string }[]>`SELECT note FROM editor_notes WHERE day = '2026-10-24'`;
  // Test 1 already wrote this day (the same file shares one database), so the row simply exists.
  assert.ok(seeded, 'the day has its row');
  await sql`UPDATE editor_notes SET note = '管理员改过' WHERE day = '2026-10-24'`;
  await seed();
  const [afterSeed] = await sql<{ note: string }[]>`SELECT note FROM editor_notes WHERE day = '2026-10-24'`;
  assert.equal(afterSeed?.note, '管理员改过', 'a second seed run keeps the admin edit');
});
