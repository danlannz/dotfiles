import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Optional integration seam: the normal test suite never installs mise/tools.
// The VM pilot explicitly supplies a private binary, HOME and mise directories.
const mise = process.env.DOTFILES_MISE_PILOT_BIN;
const pilot = fileURLToPath(new URL('../mise/pilot/', import.meta.url));

function run(tool: 'node' | 'bun', expression: string) {
  const root = process.env.DOTFILES_MISE_PILOT_ROOT;
  expect(root).toBeTruthy();
  expect(mise).toBe(join(root!, 'bin/mise'));
  expect(process.env.HOME).toBe(join(root!, 'home'));
  for (const [key, directory] of Object.entries({
    MISE_CONFIG_DIR: 'config', MISE_DATA_DIR: 'data', MISE_CACHE_DIR: 'cache', MISE_STATE_DIR: 'state',
  })) expect(process.env[key]).toBe(join(root!, directory));

  const result = Bun.spawnSync([mise!, '-C', pilot, 'exec', '--', tool, '-e', expression], {
    cwd: pilot, env: process.env, stdout: 'pipe', stderr: 'pipe', timeout: 60_000,
  });
  expect({ status: result.exitCode, stderr: result.stderr.toString() }).toMatchObject({ status: 0 });
  return JSON.parse(result.stdout.toString()) as { version: string; executable: string };
}

test.skipIf(!mise)('the pilot selects pinned Node from isolated mise data, not an existing manager', () => {
  const node = run('node', 'console.log(JSON.stringify({version:process.version,executable:process.execPath}))');
  expect(node.version).toBe('v26.13.0');
  expect(node.executable.startsWith(join(process.env.MISE_DATA_DIR!, 'installs') + '/')).toBe(true);
}, 65_000);

test.skipIf(!mise)('the pilot selects pinned Bun from isolated mise data, not the Brewfile runtime', () => {
  const bun = run('bun', 'console.log(JSON.stringify({version:Bun.version,executable:process.execPath}))');
  expect(bun.version).toBe('1.4.4');
  expect(bun.executable.startsWith(join(process.env.MISE_DATA_DIR!, 'installs') + '/')).toBe(true);
}, 65_000);
