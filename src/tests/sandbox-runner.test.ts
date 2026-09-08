import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalSandboxAdapter } from '../sandbox/adapter.js';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('sandbox runs a child process inside its workspace', async () => {
  const sandbox = new LocalSandboxAdapter().create({id:'s',root:mkdtempSync(join(tmpdir(),'gah-sandbox-')),network:'full'});
  const result = await sandbox.run(process.execPath, ['-e', 'process.stdout.write(process.cwd())']);
  assert.equal(result.code, 0);
  assert.ok(result.stdout);
  await sandbox.dispose();
});
