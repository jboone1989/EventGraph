// Editor notes for each daily (specs/004-editorial-ops FR-001): written in the admin, read by the
// daily's public read path. The site/editor-notes.ts file seeds these rows once and then stops mattering.
import { sql } from "../db.ts";
import { audit } from "../audit.ts";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface EditorNoteRow {
  day: string;
  note: string;
  noteEn: string | null;
  updatedAt: string;
  updatedBy: string;
}

export class InvalidNote extends Error {
  code = "invalid_note";
  statusCode = 400;
}

/** The notes of the last `days` days, newest first; the admin lists them beside their dailies. */
export async function listNotes(days = 60): Promise<EditorNoteRow[]> {
  const rows = await sql<{ day: Date; note: string; note_en: string | null; updated_at: Date; updated_by: string }[]>`
    SELECT day, note, note_en, updated_at, updated_by FROM editor_notes
    WHERE day > current_date - (${Math.min(Math.max(days, 1), 365)} || ' days')::interval ORDER BY day DESC`;
  return rows.map((r) => ({ day: r.day.toISOString().slice(0, 10), note: r.note, noteEn: r.note_en, updatedAt: r.updated_at.toISOString(), updatedBy: r.updated_by }));
}

/** Save one day's note (upsert): the newest write wins, and every save lands in the audit log. */
export async function saveNote(input: { day: string; note: string; noteEn?: string | null }, actor: string): Promise<EditorNoteRow> {
  const day = String(input.day ?? "");
  const note = String(input.note ?? "").trim();
  const noteEn = input.noteEn == null || String(input.noteEn).trim() === "" ? null : String(input.noteEn).trim();
  if (!DAY.test(day)) throw new InvalidNote("day must be YYYY-MM-DD");
  if (!note) throw new InvalidNote("note is required");
  if (note.length > 2000 || (noteEn && noteEn.length > 2000)) throw new InvalidNote("note too long");
  const [before] = await sql<{ note: string; note_en: string | null }[]>`SELECT note, note_en FROM editor_notes WHERE day = ${day}`;
  const [row] = await sql<{ day: Date; note: string; note_en: string | null; updated_at: Date; updated_by: string }[]>`
    INSERT INTO editor_notes (day, note, note_en, updated_by) VALUES (${day}, ${note}, ${noteEn}, ${actor})
    ON CONFLICT (day) DO UPDATE SET note = excluded.note, note_en = excluded.note_en, updated_at = now(), updated_by = excluded.updated_by
    RETURNING day, note, note_en, updated_at, updated_by`;
  await audit(actor, "notes.save", `note:${day}`, null, before ?? null, { note, noteEn });
  return { day: row!.day.toISOString().slice(0, 10), note: row!.note, noteEn: row!.note_en, updatedAt: row!.updated_at.toISOString(), updatedBy: row!.updated_by };
}
