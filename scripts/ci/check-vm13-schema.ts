// The preview may write admin data but must never migrate the shared production DB.
// Compare against the exact migration list used by the existing production runner.
import { REPO_ROOT } from '@aihot/backend/config';
import { sql, closeDb } from '@aihot/backend/db';
import { listMigrationFiles } from '../migrate.ts';

try {
  const required = listMigrationFiles(REPO_ROOT).map(m => m.name);
  const applied = new Set((await sql<{name:string}[]>`SELECT name FROM schema_migrations`).map(r => r.name));
  const missing = required.filter(name => !applied.has(name));
  if (missing.length) {
    console.error('VM13 preview blocked: production database schema is behind this image. Missing migrations: '+missing.join(', '));
    process.exitCode = 1;
  } else {
    console.log('VM13 preview schema is current ('+required.length+' migrations); no database changes');
  }
} finally {
  await closeDb();
}
