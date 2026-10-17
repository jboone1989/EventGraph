import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';
import {credential} from '../../config.ts';
import {ProviderConfigError} from './connection-types.ts';

function encryptionKey():Buffer {
 const raw=credential('models','MODEL_CREDENTIAL_ENCRYPTION_KEY');
 const key=raw?Buffer.from(raw,'base64'):null;
 if(!key||key.length!==32)throw new ProviderConfigError('Configure MODEL_CREDENTIAL_ENCRYPTION_KEY with a base64 encoded 32 byte key before storing credentials','credential',503);
 return key;
}
export function encryptCredential(value:string):string {
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);
 const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
 return [iv,cipher.getAuthTag(),encrypted].map(v=>v.toString('base64')).join('.');
}
export function decryptCredential(value:string):string {
 try {
  const parts=value.split('.').map(v=>Buffer.from(v,'base64'));
  if(parts.length!==3)throw Error();
  const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),parts[0]!);
  decipher.setAuthTag(parts[1]!);
  return Buffer.concat([decipher.update(parts[2]!),decipher.final()]).toString('utf8');
 } catch {throw new ProviderConfigError('Provider credential cannot be decrypted','credential',503);}
}
export function storedCredential(row:{credential_secret:string|null;credential_env:string|null}):string|null {
 return row.credential_secret?decryptCredential(row.credential_secret):row.credential_env?credential('models',row.credential_env):null;
}
/** Never persist or return secret values; the digest also invalidates checks after environment key rotation. */
export function credentialDigest(value:string|null):string {
 return createHash('sha256').update(value??'').digest('hex');
}
