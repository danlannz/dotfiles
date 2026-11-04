import { afterEach, beforeEach, expect, test } from 'bun:test';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../script/setup-app-store', import.meta.url));
let directory: string;
let script: string;
let manifest: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'dotfiles app store '));
  const repo = join(directory, 'repo with spaces');
  mkdirSync(join(repo, 'script'), { recursive: true });
  mkdirSync(join(directory, 'bin'));
  mkdirSync(join(directory, 'home'));
  script = join(repo, 'script/setup-app-store');
  manifest = join(repo, 'Brewfile.app-store');
  if (existsSync(source)) copyFileSync(source, script);
  copyFileSync(fileURLToPath(new URL('../Brewfile.app-store', import.meta.url)), manifest);
  writeFileSync(join(directory, 'bin/brew'), `#!/bin/bash
printf '%s\\n' "$*" >> "$TRACE"
case "$1 $2" in
  'bundle check') test -f "$RECEIPT" ;;
  'bundle install')
    test "$INSTALL_STATUS" = 0 || exit "$INSTALL_STATUS"
    touch "$RECEIPT" ;;
  *) exit 99 ;;
esac
`, { mode: 0o755 });
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

function run(overrides: Record<string, string> = {}, args: string[] = []) {
  writeFileSync(join(directory, 'trace'), '');
  const result = Bun.spawnSync(['/bin/bash', script, ...args], {
    cwd: directory,
    env: {
      HOME: join(directory, 'home'), PATH: `${join(directory, 'bin')}:/usr/bin:/bin`,
      TRACE: join(directory, 'trace'), RECEIPT: join(directory, 'receipt'),
      INSTALL_STATUS: '0', ...overrides,
    },
    stdout: 'pipe', stderr: 'pipe',
  });
  const trace = existsSync(join(directory, 'trace')) ? readFileSync(join(directory, 'trace'), 'utf8') : '';
  return { ...result, trace };
}

test('the standalone retry uses only the App Store manifest, independent of cwd', () => {
  const result = run();
  expect(result.exitCode).toBe(0);
  expect(result.trace).toContain(`bundle install --file ${manifest} --no-upgrade`);
  expect(result.trace).not.toContain('--global');
  expect(result.trace).not.toContain('brew update');
});

test('a failed App Store install can be retried, then completed apps become a no-op', () => {
  const failed = run({ INSTALL_STATUS: '9' });
  expect(failed.exitCode).toBe(9);
  const retried = run();
  expect(retried.exitCode).toBe(0);
  expect(retried.trace).toContain('bundle install');
  const complete = run();
  expect(complete.exitCode).toBe(0);
  expect(complete.trace).not.toContain('bundle install');
  expect(complete.stdout.toString()).toContain('nothing to do');
});

test('missing Homebrew fails clearly instead of running any other setup', () => {
  const result = run({ PATH: '/usr/bin:/bin' });
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain('Homebrew is required');
  expect(result.trace).toBe('');
});

test('unexpected arguments fail before calling a package manager', () => {
  const result = run({}, ['--unexpected']);
  expect(result.exitCode).toBe(2);
  expect(result.stderr.toString()).toContain('Usage:');
  expect(result.trace).toBe('');
});
