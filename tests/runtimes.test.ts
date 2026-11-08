import { expect, test } from 'bun:test';
import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Opt-in integration against the production config, never a second runtime pin.
const mise = process.env.DOTFILES_TEST_MISE_BIN;
const source = fileURLToPath(new URL('..', import.meta.url));
const defaults = Bun.TOML.parse(readFileSync(join(source, 'mise/config.toml'), 'utf8')).tools as Record<string, string>;
function run(tool: 'node' | 'bun', expression: string) {
  const root = process.env.DOTFILES_TEST_ROOT;
  expect(root).toBeTruthy();
  expect(mise).toBe(join(root!, 'bin/mise'));
  expect(process.env.HOME).toBe(join(root!, 'home'));
  for (const [key, directory] of Object.entries({
    MISE_CONFIG_DIR: 'config', MISE_DATA_DIR: 'data', MISE_CACHE_DIR: 'cache', MISE_STATE_DIR: 'state',
  })) expect(process.env[key]).toBe(join(root!, directory));
  expect(realpathSync(join(root!, 'config/config.toml'))).toBe(realpathSync(join(source, 'mise/config.toml')));
  expect(realpathSync(join(root!, 'config/mise.lock'))).toBe(realpathSync(join(source, 'mise/mise.lock')));
  const which = Bun.spawnSync([mise!, '-C', process.env.HOME!, 'which', tool], { env: process.env, stdout: 'pipe', stderr: 'pipe' });
  expect(which.exitCode, which.stderr.toString()).toBe(0);
  const result = Bun.spawnSync([mise!, '-C', process.env.HOME!, 'exec', '--', tool, '-e', expression], {
    env: process.env, stdout: 'pipe', stderr: 'pipe', timeout: 60_000,
  });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  return JSON.parse(result.stdout.toString()) as { version: string; executable: string };
}

test.skipIf(!mise)('production defaults select Node from isolated mise data, not an existing manager', () => {
  const node = run('node', 'console.log(JSON.stringify({version:process.version,executable:process.execPath}))');
  expect(node.version).toBe(`v${defaults.node}`);
  expect(node.executable.startsWith(join(process.env.MISE_DATA_DIR!, 'installs/node') + '/')).toBe(true);
}, 65_000);

test.skipIf(!mise)('production defaults select Bun from isolated mise data, not the Brewfile runtime', () => {
  const bun = run('bun', 'console.log(JSON.stringify({version:Bun.version,executable:process.execPath}))');
  expect(bun.version).toBe(defaults.bun);
  expect(bun.executable.startsWith(join(process.env.MISE_DATA_DIR!, 'installs/bun') + '/')).toBe(true);
}, 65_000);
