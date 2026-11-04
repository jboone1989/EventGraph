import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';

test('missing encryption environment key uses one persistent restricted key, not plaintext',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'eventgraph-key-test-'));
 const originalData=process.env.AIHOT_DATA_DIR;
 const originalKey=process.env.MODEL_CREDENTIAL_ENCRYPTION_KEY;
 delete process.env.MODEL_CREDENTIAL_ENCRYPTION_KEY;
 process.env.AIHOT_DATA_DIR=dir;
 try{
  const {encryptCredential,decryptCredential,credentialDigest}=await import('@aihot/backend/providers/registry/connection-secrets');
  const value='example-api-key-'+randomUUID();
  const cipher=encryptCredential(value);
  const keyFile=join(dir,'.model-credential-encryption-key');
  const firstKey=readFileSync(keyFile,'utf8');
  assert.match(firstKey.trim(),/^[A-Za-z0-9+/]{43}=$/);
  assert.equal(statSync(keyFile).mode&0o077,0,'persistent key must not be world/group readable');
  assert.ok(!cipher.includes(value));
  assert.equal(decryptCredential(cipher),value);
  const fingerprint=credentialDigest(value);
  assert.equal(decryptCredential(encryptCredential(value)),value);
  assert.equal(credentialDigest(value),fingerprint,'same key must be reused by successive calls');
  assert.equal(readFileSync(keyFile,'utf8'),firstKey,'never overwrite the existing key');

  process.env.MODEL_CREDENTIAL_ENCRYPTION_KEY='not-a-base64-32-byte-key';
  assert.throws(()=>encryptCredential(value),/base64 encoded 32 byte key/,'invalid explicit key must fail closed');
  delete process.env.MODEL_CREDENTIAL_ENCRYPTION_KEY;
  assert.equal(decryptCredential(cipher),value,'previous ciphertext remains readable via persisted key');
 }finally{
  if(originalKey===undefined)delete process.env.MODEL_CREDENTIAL_ENCRYPTION_KEY;
  else process.env.MODEL_CREDENTIAL_ENCRYPTION_KEY=originalKey;
  if(originalData===undefined)delete process.env.AIHOT_DATA_DIR;
  else process.env.AIHOT_DATA_DIR=originalData;
  rmSync(dir,{recursive:true,force:true});
 }
});
