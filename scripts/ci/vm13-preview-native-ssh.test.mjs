import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflow = readFileSync(new URL('../../.github/workflows/release-develop.yml', import.meta.url), 'utf8');
const start = workflow.indexOf('      - name: Deploy VM13 Web and API from immutable digest\n');
const end = workflow.indexOf('\n  # Acceptance runs on GitHub-hosted Actions', start);
assert.ok(start >= 0 && end > start, 'VM13 deploy step must exist');
const deploy = workflow.slice(start, end);

test('VM13 deploy uses installed OpenSSH, not an on-demand third-party binary', () => {
  assert.match(deploy, /shell: bash/);
  assert.match(deploy, /\bssh\s+-i/);
  assert.doesNotMatch(deploy, /uses:\s*appleboy\/ssh-action|DRONE_SSH_VERSION|curl\s+[^\n]*drone-ssh/);
});
test('SSH host identity is independently pinned, never trust-on-first-use', () => {
  assert.match(deploy, /ssh-keyscan/);
  assert.match(deploy, /ssh-keygen -lf/);
  assert.match(deploy, /fingerprint=SHA256:950EdynTTleTOtbmusu5UrYvSQwgsl4hX3\/frQniLh4/);
  assert.match(deploy, /\[\[ "\$observed" == "\$fingerprint" \]\]/);
  assert.match(deploy, /printf '%s\\n' "\$entry" > "\$known_hosts"/);
  assert.match(deploy, /StrictHostKeyChecking=yes/);
  assert.match(deploy, /UserKnownHostsFile=\$known_hosts/);
  assert.doesNotMatch(deploy, /StrictHostKeyChecking=(?:no|accept-new)|UserKnownHostsFile=\/dev\/null/);
});
test('ephemeral private key is protected and removed, with no command tracing', () => {
  assert.match(deploy, /EVENTGRAPH_DEV_SSH_KEY: \$\{\{ secrets\.EVENTGRAPH_DEV_SSH_KEY \}\}/);
  assert.match(deploy, /umask 077/);
  assert.match(deploy, /key_file="\$\(mktemp/);
  assert.match(deploy, /chmod 600 "\$key_file"/);
  assert.match(deploy, /trap 'rm -f "\$key_file"/);
  assert.doesNotMatch(deploy, /set -x|set -o xtrace/);
});
test('exact immutable inputs are validated and original remote preview script is preserved', () => {
  assert.match(deploy, /EVENTGRAPH_IMAGE: \$\{\{ needs\.publish\.outputs\.image_ref \}\}/);
  assert.match(deploy, /EVENTGRAPH_PREVIEW_RELEASE: \$\{\{ needs\.publish\.outputs\.source_sha \}\}/);
  assert.match(deploy, /EVENTGRAPH_PROD_TUNNEL_HOST_FINGERPRINT: \$\{\{ secrets\.EVENTGRAPH_PROD_SSH_FINGERPRINT \}\}/);
  assert.match(deploy, /@sha256:\[a-f0-9\]\{64\}/);
  assert.match(deploy, /\[a-f0-9\]\{40\}/);
  assert.ok(deploy.includes('sh \\"\\$script_file\\"'), 'must run the complete buffered file, not stdin-backed sh -s');
  assert.ok(deploy.includes('cat > \\"\\$script_file\\"'), 'must fully receive the file before running Docker commands');
  assert.match(deploy, /sha256sum scripts\/ci\/deploy-vm13-preview[.]sh/);
  assert.match(deploy, /deployment script transfer checksum mismatch/);
  assert.doesNotMatch(deploy, / sh -s"/);
  assert.match(deploy, /< scripts\/ci\/deploy-vm13-preview\.sh/);
  assert.match(workflow, /name: "验证 VM13 在线预览"/);
});

test('VM13 script transfer is completed before running potentially stdin-reading Docker commands', () => {
  const readAll = deploy.indexOf('cat > ');
  const checksum = deploy.indexOf('actual_sha=');
  const verify = deploy.indexOf('checksum mismatch');
  const execute = deploy.indexOf(' sh \\"\\$script_file\\"');
  assert.ok(readAll >= 0 && checksum > readAll && verify > checksum && execute > verify,
    'buffer, verify checksum, then execute script file in that order');
  assert.match(deploy, /trap 'rm -f/);
});
