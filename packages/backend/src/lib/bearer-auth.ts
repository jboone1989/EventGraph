import {timingSafeEqual} from 'node:crypto';

/** Constant-time token comparison shared by read-only and privileged internal endpoints. */
export function matchesBearerToken(
 header:unknown, expected:string|undefined,
 options:{requireBearer?:boolean;minSecretLength?:number}={},
):boolean {
 if(typeof header!=='string'||!expected||expected.length<(options.minSecretLength??1))return false;
 const prefix='Bearer ';
 if(options.requireBearer&&!header.startsWith(prefix))return false;
 const supplied=header.startsWith(prefix)?header.slice(prefix.length):header;
 if(!supplied)return false;
 const actual=Buffer.from(supplied),secret=Buffer.from(expected);
 return actual.length===secret.length&&timingSafeEqual(actual,secret);
}
