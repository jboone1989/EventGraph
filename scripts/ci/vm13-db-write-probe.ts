// A minimal, rollback-only verification of the actual VM13 -> production DB write path.
// Called from the exact preview API image, never as part of production migrations.
import {randomUUID} from 'node:crypto';
import {sql,closeDb} from '@aihot/backend/db';

if(process.env.EVENTGRAPH_PREVIEW_MODE !== 'true')
 throw new Error('Refusing DB write probe outside VM13 preview mode');
if(process.env.EVENTGRAPH_PREVIEW_READONLY === 'true')
 throw new Error('Preview DB write probe cannot run in read-only mode');

const connection=await sql.reserve();
let begun=false;
try {
 await connection`BEGIN`;
 begun=true;
 const key='vm13.preview.write-probe.'+randomUUID();
 const [inserted]=await connection<{key:string}[]>`INSERT INTO settings(key,value,updated_by)
  VALUES (${key}, '{}'::jsonb, 'vm13-preview-probe') RETURNING key`;
 const [readBack]=await connection<{key:string}[]>`SELECT key FROM settings WHERE key=${key}`;
 if(inserted?.key!==key||readBack?.key!==key)
  throw new Error('Preview DB write probe failed to read back its inserted row');
 console.log('VM13 writable database probe passed (transaction rolled back)');
}finally{
 try {if(begun)await connection`ROLLBACK`;}
 finally {connection.release();await closeDb();}
}
