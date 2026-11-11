import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';

// A failing source-avatar host must not fail an otherwise healthy daily report.
// Test the actual Fastify route, including signed URL verification and upstream errors.
test('only signed optional avatars degrade gracefully on upstream failure',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'eventgraph-avatar-'));
 const priorDir=process.env.AIHOT_DATA_DIR;
 const priorPrivate=process.env.ALLOW_PRIVATE_NETWORK_FETCH;
 process.env.AIHOT_DATA_DIR=dir;
 process.env.ALLOW_PRIVATE_NETWORK_FETCH='true';
 const png=await (await import('sharp')).default({create:{width:32,height:32,channels:3,background:'#6a8a9c'}}).png().toBuffer();
 const upstream=createServer((req,res)=>{
  if(req.url==='/fail')return res.writeHead(502).end('temporarily missing');
  return res.writeHead(200,{'content-type':'image/png'}).end(png);
 });
 await new Promise<void>(resolve=>upstream.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+(upstream.address() as {port:number}).port;
 const {registerMedia}=await import('../apps/api/src/routes/media.ts');
 const {proxyExpiry,signature}=await import('@aihot/backend/media/imgproxy');
 const app=Fastify({logger:false});
 registerMedia(app);
 const url=(source:string,mode:string)=>{
  const exp=proxyExpiry();
  return '/api/img-proxy?'+new URLSearchParams({
   u:source,mode,exp:String(exp),sig:signature(source,mode,exp).slice(0,16)
  });
 };
 try{
  const avatar=await app.inject({url:url(base+'/fail','avatar-48')});
  assert.equal(avatar.statusCode,204);
  assert.equal(avatar.body,'');
  assert.equal(avatar.headers['x-img-proxy-fallback'],'unavailable');
  assert.equal(avatar.headers['x-img-proxy-sig'],'valid');
  assert.match(String(avatar.headers['cache-control']),/max-age=60/);
  const otherAvatar=await app.inject({url:url(base+'/fail','avatar')});
  assert.equal(otherAvatar.statusCode,204);
  const full=await app.inject({url:url(base+'/fail','full')});
  assert.equal(full.statusCode,502,'broken article images must remain visible errors');
  assert.equal(full.body,'Upstream image unavailable');
  const good=await app.inject({url:url(base+'/good','avatar-48')});
  assert.equal(good.statusCode,200);
  assert.match(String(good.headers['content-type']),/^image\//);
  assert.ok(good.rawPayload.length>0);
  const unsigned=await app.inject({url:url(base+'/fail','avatar-48').replace(/sig=[^&]+/,'sig=0000000000000000')});
  assert.equal(unsigned.statusCode,403,'invalid signatures cannot be converted to 204');
 }finally{
  await app.close();
  upstream.closeAllConnections();
  await new Promise<void>(resolve=>upstream.close(()=>resolve()));
  await rm(dir,{recursive:true,force:true});
  if(priorDir===undefined)delete process.env.AIHOT_DATA_DIR;else process.env.AIHOT_DATA_DIR=priorDir;
  if(priorPrivate===undefined)delete process.env.ALLOW_PRIVATE_NETWORK_FETCH;else process.env.ALLOW_PRIVATE_NETWORK_FETCH=priorPrivate;
 }
});
