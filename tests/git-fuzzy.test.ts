import { afterEach, beforeEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
let root: string;
let origin: string;
let target: string;
let revision: string;
let env: Record<string, string>;
function git(...args: string[]) {
  const result = Bun.spawnSync(['/usr/bin/git', ...args], { env, stdout: 'pipe', stderr: 'pipe' });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  return result.stdout.toString().trim();
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'optional git helper ')); origin = join(root, 'origin');
  target = join(root, 'home/.oh-my-zsh/custom/plugins/git-fuzzy');
  for (const path of ['home/.oh-my-zsh', 'bin', 'origin/bin', 'origin/lib']) mkdirSync(join(root, path), { recursive: true });
  env = { HOME: join(root, 'home'), PATH: `${root}/bin:/usr/bin:/bin`, GIT_CONFIG_NOSYSTEM: '1', GIT_ALLOW_PROTOCOL: 'file', GIT_TERMINAL_PROMPT: '0' };
  writeFileSync(join(root, 'bin/fzf'), '#!/bin/sh\nexit 99\n', { mode: 0o755 });
  writeFileSync(join(origin, 'bin/git-fuzzy'), '#!/bin/sh\necho fixture\n', { mode: 0o755 });
  writeFileSync(join(origin, 'lib/core.sh'), '# fixture\n');
  git('init', '-q', origin); git('-C', origin, 'add', '.');
  git('-C', origin, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
  revision = git('-C', origin, 'rev-parse', 'HEAD');
  // Redirect only the external network boundary. Filesystem/Git behavior is real.
  git('config', '--global', `url.file://${origin}.insteadOf`, 'https://github.com/bigH/git-fuzzy.git');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
function run(extra: Record<string, string> = {}, args = [revision]) {
  return Bun.spawnSync(['/bin/bash', join(repo, 'script/setup-git-fuzzy'), ...args], { cwd: root, env: { ...env, ...extra }, stdout: 'pipe', stderr: 'pipe', timeout: 10000 });
}

test('git-fuzzy installs the requested detached commit, then preserves a dirty checkout at another revision', () => {
  const result = run();
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(git('-C', target, 'rev-parse', 'HEAD')).toBe(revision);
  expect(Bun.spawnSync(['/usr/bin/git', '-C', target, 'symbolic-ref', '-q', 'HEAD'], { env }).exitCode).not.toBe(0);
  writeFileSync(join(target, 'keep'), 'user work\n');
  git('-C', target, 'add', 'keep');
  git('-C', target, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'user commit');
  const userRevision = git('-C', target, 'rev-parse', 'HEAD');
  writeFileSync(join(target, 'lib/core.sh'), '# user change\n');
  const repeated = run();
  expect(repeated.exitCode, repeated.stderr.toString()).toBe(0);
  expect(repeated.stdout.toString()).toContain('Existing checkout preserved');
  expect(git('-C', target, 'rev-parse', 'HEAD')).toBe(userRevision);
  expect(readFileSync(join(target, 'lib/core.sh'), 'utf8')).toBe('# user change\n');
});

for (const conflict of ['file', 'directory', 'dangling symlink', 'ancestor repository']) {
  test(`git-fuzzy refuses a conflicting ${conflict} without replacement`, () => {
    mkdirSync(join(target, '..'), { recursive: true });
    if (conflict === 'file') writeFileSync(target, 'user file\n');
    else if (conflict === 'dangling symlink') symlinkSync(join(root, 'missing'), target);
    else {
      mkdirSync(target); writeFileSync(join(target, 'keep'), 'user data\n');
      if (conflict === 'ancestor repository') {
        git('init', '-q', join(root, 'home/.oh-my-zsh'));
        mkdirSync(join(target, 'bin')); mkdirSync(join(target, 'lib'));
        writeFileSync(join(target, 'bin/git-fuzzy'), '#!/bin/sh\n', { mode: 0o755 });
        writeFileSync(join(target, 'lib/core.sh'), '# incomplete\n');
      }
    }
    const result = run();
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('nothing was replaced');
    if (conflict === 'file') expect(readFileSync(target, 'utf8')).toBe('user file\n');
    else if (conflict !== 'dangling symlink') expect(readFileSync(join(target, 'keep'), 'utf8')).toBe('user data\n');
    else expect(Bun.spawnSync(['/usr/bin/readlink', target]).stdout.toString().trim()).toBe(join(root, 'missing'));
  });
}

test('git-fuzzy rejects a bad pin and an interrupted checkout remains a visible conflict on retry', () => {
  expect(run({}, ['HEAD']).exitCode).toBe(2);
  expect(existsSync(target)).toBe(false);
  expect(run({}, ['0'.repeat(40)]).exitCode).not.toBe(0);
  expect(run().exitCode).toBe(1);
  expect(existsSync(join(target, '.git'))).toBe(true);
});

test('git-fuzzy supports an explicit absolute bin path and never creates a partial Oh My Zsh installation', () => {
  rmSync(join(root, 'home/.oh-my-zsh'), { recursive: true });
  expect(run().exitCode).toBe(1);
  expect(existsSync(join(root, 'home/.oh-my-zsh'))).toBe(false);
  expect(run({ GIT_FUZZY_BIN: 'relative/bin' }).exitCode).toBe(2);
  const bin = join(root, 'custom helper/bin');
  expect(run({ GIT_FUZZY_BIN: bin }).exitCode).toBe(0);
  expect(git('-C', join(bin, '..'), 'rev-parse', 'HEAD')).toBe(revision);
  const shell = Bun.spawnSync(['/bin/sh', '-c', '. "$1"; command -v git-fuzzy', 'sh', join(repo, '.path')], {
    env: { ...env, GIT_FUZZY_BIN: bin }, stdout: 'pipe', stderr: 'pipe',
  });
  expect(shell.exitCode, shell.stderr.toString()).toBe(0);
  expect(shell.stdout.toString().trim()).toBe(join(bin, 'git-fuzzy'));
});

test('git-fuzzy native task pins the reviewed source revision and stays outside automatic provisioning', () => {
  const config = Bun.TOML.parse(readFileSync(join(repo, 'mise.toml'), 'utf8')) as any;
  expect(config.tasks['git-fuzzy'].run).toBe('bash "{{ config_root }}/script/setup-git-fuzzy" 36fc08f084a0cabf3e381dbbbce8e3a1a22fbaa4');
  for (const path of ['bootstrap.sh', 'script/after-setup', '.Brewfile']) expect(readFileSync(join(repo, path), 'utf8')).not.toMatch(/setup-git-fuzzy|run git-fuzzy/);
});
