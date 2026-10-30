import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const yaml=readFileSync(new URL('../../.github/workflows/claude-pr-dispatch.yml',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const start=yaml.indexOf('          if [[ "$e2e" != success');
const end=yaml.indexOf('          status=',start);
assert.ok(start>=0 && end>start,'missing actual merge guard');
const script=yaml.slice(start,end).replace(/^          /gm,'');
function check(e2e,docker,files){
 const result=spawnSync(process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash',['-c',`set -euo pipefail\ngh(){ case "$*" in *branches/develop*) printf '%s\\n' "$REVIEW_BASE_SHA";; *) printf '%s\\n' "$FILES";; esac; }\n${script}`],{encoding:'utf8',env:{...process.env,e2e,docker,FILES:files,number:'42',REVIEW_BASE_REF:'develop',REVIEW_BASE_SHA:'b'.repeat(40),GITHUB_REPOSITORY:'jboone1989/EventGraph'}});
 return result.status;
}
test('both heavy checks succeeding permits the merge guard',()=>assert.equal(check('success','success','apps/api/a.ts'),0));
test('both explicitly skipped checks permit a documentation-only PR',()=>{for(const files of ['docs/ci-cd.md\nspecs/example/spec.md','AGENTS.md','.agents/skills/example/SKILL.md','docs/notes.txt'])assert.equal(check('skipped','skipped',files),0);});
test('skipped heavy checks never permit executable changes',()=>{for(const files of ['docs/ci-cd.md\napps/api/a.ts','docs/deploy.sh','.github/workflows/check.yml','docs/moved.md\napps/api/before.ts'])assert.notEqual(check('skipped','skipped',files),0);});
test('failed or inconsistent heavy check results block merge',()=>{for(const pair of [['failure','success'],['skipped','success'],['success','skipped']])assert.notEqual(check(...pair,'docs/ci-cd.md'),0);});
