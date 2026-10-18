import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

// Runs existing failure-injection and disposable PG17 drills in the normal
// GitHub "Backend tests" job. Does not need the GitHub workflow token scope.
// Never invoke deploy-prod.sh against a real host or real data.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
function bash(path:string,timeout=110000) {
 const result=spawnSync('bash',[path],{
  cwd:root,encoding:'utf8',timeout,maxBuffer:3*1024*1024,
  env:{...process.env,CI:'true',DOCKER_BUILDKIT:'0'}
 });
 return result;
}

test('production deployment rollback guards reject injected failures in an isolated checkout',()=>{
 const r=bash('tests/release/deploy-prod-rollback.test.sh');
 assert.equal(r.status,0, 'Mock rollback drill failed: '+(r.stderr||r.stdout).slice(-2500));
});

test('private PG17 archive survives restore and rejects corruption in an isolated Docker project',{
 skip:process.env.CI!=='true'?'Disposable Docker drill runs on GitHub CI only':undefined
},()=>{
 const docker=spawnSync('docker',['info','--format','{{.ServerVersion}}'],{encoding:'utf8',timeout:10000});
 assert.equal(docker.status,0,'GitHub runner must have usable Docker');
 const r=bash('tests/release/compose-backup-drill.sh');
 assert.equal(r.status,0,'PG17 archive drill failed: '+(r.stderr||r.stdout).slice(-2500));
});
