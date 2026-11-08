import { afterEach, beforeEach, expect, test } from 'bun:test';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const nativeMise = process.env.DOTFILES_TEST_MISE_BIN;
const source = fileURLToPath(new URL('..', import.meta.url));
let root: string;
let repo: string;
let home: string;
let env: Record<string, string>;
beforeEach(() => {
  if (!nativeMise) return;
  root = mkdtempSync(join(tmpdir(), 'dotfiles verification '));
  repo = join(root, 'checkout'); home = join(root, 'home');
  mkdirSync(repo); mkdirSync(home); mkdirSync(join(root, 'bin'));
  copyFileSync(join(source, 'mise.toml'), join(repo, 'mise.toml'));
  copyFileSync(join(source, '.path'), join(repo, '.path'));
  writeFileSync(join(home, '.zshrc'), 'user configuration\n');
  symlinkSync(nativeMise, join(root, 'bin/mise'));
  // External command boundaries: no recursive test suite or machine tools run.
  writeFileSync(join(root, 'bin/bun'), '#!/bin/sh\n[ -z "$DOTFILES_TEST_MISE_BIN$DOTFILES_TEST_ROOT$DOTFILES_ITERM_FIRST_LAUNCH" ] || exit 71\nprintf tested > "$TRACE"\nexit "${VERIFY_FAIL_STATUS:-0}"\n', { mode: 0o755 });
  for (const tool of ['bash', 'zsh', 'ruby', 'shellcheck', 'git']) {
    writeFileSync(join(root, 'bin', tool), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  }
  env = { HOME: home, PATH: `${root}/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
    MISE_CONFIG_DIR: join(root, 'config'), MISE_DATA_DIR: join(root, 'data'), MISE_CACHE_DIR: join(root, 'cache'), MISE_STATE_DIR: join(root, 'state'),
    DOTFILES_TEST_MISE_BIN: '/not-a-test-binary', DOTFILES_TEST_ROOT: '/not-a-test-home', DOTFILES_ITERM_FIRST_LAUNCH: '1', TRACE: join(root, 'trace'), CI: '1' };
  const trust = Bun.spawnSync([nativeMise, 'trust', join(repo, 'mise.toml')], { env, stdout: 'pipe', stderr: 'pipe' });
  expect(trust.exitCode, trust.stderr.toString()).toBe(0);
});
afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); });
function run(task: string, extra: Record<string, string> = {}) {
  return Bun.spawnSync([nativeMise!, '-C', repo, 'run', task], { cwd: home, env: { ...env, ...extra }, stdout: 'pipe', stderr: 'pipe', timeout: 15000 });
}

test.skipIf(!nativeMise)('ordinary verification clears VM and GUI opt-ins without installing tools or changing home configuration', () => {
  const result = run('verify');
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(readFileSync(join(root, 'trace'), 'utf8')).toBe('tested');
  expect(readFileSync(join(home, '.zshrc'), 'utf8')).toBe('user configuration\n');
  expect(existsSync(join(root, 'data/installs'))).toBe(false);
});

test.skipIf(!nativeMise)('verification propagates a failed test command', () => {
  const result = run('verify', { VERIFY_FAIL_STATUS: '9' });
  expect(result.exitCode).not.toBe(0);
  expect(readFileSync(join(root, 'trace'), 'utf8')).toBe('tested');
  expect(readFileSync(join(home, '.zshrc'), 'utf8')).toBe('user configuration\n');
});

test.skipIf(!nativeMise)('VM verification refuses an unprepared environment before running tests or provisioning', () => {
  const result = run('verify:vm');
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain('prepared disposable VM');
  expect(existsSync(join(root, 'trace'))).toBe(false);
  expect(existsSync(join(root, 'data/installs'))).toBe(false);
});
