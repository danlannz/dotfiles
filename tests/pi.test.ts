import { expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mise = process.env.DOTFILES_TEST_MISE_BIN;
const repo = fileURLToPath(new URL('..', import.meta.url));
const defaults = (Bun.TOML.parse(readFileSync(join(repo, 'mise/config.toml'), 'utf8')) as any).tools;

test('Pi uses a locked native binary and a private conventional resource package', () => {
  const lock = Bun.TOML.parse(readFileSync(join(repo, 'mise/mise.lock'), 'utf8')) as any;
  const entry = lock.tools.pi.find((tool: any) => tool.version === defaults.pi);
  expect(entry.backend).toBe('aqua:earendil-works/pi');
  for (const arch of ['arm64', 'x64']) expect(entry[`platforms.macos-${arch}`].url).toBe(`https://github.com/earendil-works/pi/releases/download/v${defaults.pi}/pi-darwin-${arch}.tar.gz`);
  const metadata = JSON.parse(readFileSync(join(repo, 'agents/pi/package.json'), 'utf8'));
  expect(metadata.private).toBe(true);
  expect(metadata).not.toHaveProperty('dependencies');
  for (const dir of ['extensions', 'prompts', 'themes']) expect(statSync(join(repo, 'agents/pi', dir)).isDirectory()).toBe(true);
});

for (const existing of [false, true]) {
  test(`Pi setup preview preserves machine-local configuration without invoking Pi (existing=${existing})`, () => {
    const root = mkdtempSync(join(tmpdir(), 'pi setup preview '));
    const agent = join(root, 'agent');
    mkdirSync(agent); mkdirSync(join(root, 'bin'));
    const trace = join(root, 'pi-used');
    writeFileSync(join(root, 'bin/pi'), '#!/bin/sh\nprintf called > "$TRACE"\nexit 91\n', { mode: 0o755 });
    const content = JSON.stringify({ theme: 'light', futureSetting: true });
    if (existing) writeFileSync(join(agent, 'settings.json'), content);
    try {
      const result = Bun.spawnSync([process.execPath, join(repo, 'agents/setup-pi.ts'), '--dry-run'], {
        cwd: root, env: { HOME: root, PI_CODING_AGENT_DIR: agent, PATH: `${root}/bin:/usr/bin:/bin`, TRACE: trace }, stdout: 'pipe', stderr: 'pipe',
      });
      expect(result.exitCode, result.stderr.toString()).toBe(0);
      expect(result.stdout.toString()).toContain('Would register native Pi package');
      expect(existsSync(trace)).toBe(false);
      expect(readdirSync(agent)).toEqual(existing ? ['settings.json'] : []);
      if (existing) expect(readFileSync(join(agent, 'settings.json'), 'utf8')).toBe(content);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test('Pi setup preserves existing filtered registration without requiring the executable', () => {
  const root = mkdtempSync(join(tmpdir(), 'pi setup existing '));
  const content = '\uFEFF' + JSON.stringify({ packages: [{ source: join(repo, 'agents/pi'), extensions: [], prompts: [] }], theme: 'light' });
  writeFileSync(join(root, 'settings.json'), content);
  try {
    const result = Bun.spawnSync([process.execPath, join(repo, 'agents/setup-pi.ts')], {
      env: { HOME: root, PI_CODING_AGENT_DIR: root, PATH: '/usr/bin:/bin' }, stdout: 'pipe', stderr: 'pipe',
    });
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    expect(result.stdout.toString()).toContain('already registered');
    expect(readFileSync(join(root, 'settings.json'), 'utf8')).toBe(content);
    expect(readdirSync(root)).toEqual(['settings.json']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

function agentFixture() {
  const root = mkdtempSync(join(tmpdir(), 'pi agent setup '));
  const agent = join(root, 'custom agent');
  for (const dir of ['home', 'config', 'state', 'custom agent', 'custom agent/sessions', 'user-package']) mkdirSync(join(root, dir), { recursive: true });
  for (const file of ['config.toml', 'mise.lock', 'miserc.toml']) symlinkSync(join(repo, 'mise', file), join(root, 'config', file));
  writeFileSync(join(root, 'user-package/package.json'), '{"name":"user-package","private":true}');
  const env = { HOME: join(root, 'home'), PATH: `${process.env.MISE_DATA_DIR}/shims:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin`, MISE_CONFIG_DIR: join(root, 'config'), MISE_DATA_DIR: process.env.MISE_DATA_DIR!, MISE_CACHE_DIR: process.env.MISE_CACHE_DIR!, MISE_STATE_DIR: join(root, 'state'), PI_CODING_AGENT_DIR: agent, PI_OFFLINE: '1', PI_TELEMETRY: '0', PI_SKIP_VERSION_CHECK: '1', CI: '1' };
  expect(Bun.spawnSync([mise!, 'trust', join(repo, 'mise.toml')], { env, stdout: 'pipe', stderr: 'pipe' }).exitCode).toBe(0);
  return { root, agent, env, run: () => Bun.spawnSync([mise!, '-C', repo, 'run', 'agents'], { env, stdout: 'pipe', stderr: 'pipe', timeout: 60000 }) };
}

test.skipIf(!mise)('agent setup rejects malformed Pi settings without rewriting them', () => {
  const fixture = agentFixture();
  const settings = join(fixture.agent, 'settings.json');
  writeFileSync(settings, '{"theme":');
  try {
    const result = fixture.run();
    expect(result.exitCode, result.stdout.toString() + result.stderr.toString()).not.toBe(0);
    expect(result.stderr.toString()).toContain('Cannot parse Pi settings');
    expect(readFileSync(settings, 'utf8')).toBe('{"theme":');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
}, 65000);

test.skipIf(!mise)('agent setup registers the native Pi package while preserving local preferences and state', () => {
  const fixture = agentFixture();
  const { root, agent } = fixture;
  const userPackage = { source: join(root, 'user-package'), extensions: [] };
  const settings = { theme: 'light', defaultModel: 'user-selected-model', selfUpdateCommand: ['custom-owner'], packages: [userPackage], futureSetting: { keep: true } };
  writeFileSync(join(agent, 'settings.json'), JSON.stringify(settings));
  writeFileSync(join(agent, 'auth.json'), '{}\n');
  writeFileSync(join(agent, 'sessions/keep.jsonl'), 'session sentinel\n');
  try {
    const result = fixture.run();
    expect(result.exitCode, result.stdout.toString() + result.stderr.toString()).toBe(0);
    const actual = JSON.parse(readFileSync(join(agent, 'settings.json'), 'utf8'));
    expect(actual.packages.filter((entry: unknown) => typeof entry === 'string').map((entry: string) => resolve(agent, entry))).toContain(join(repo, 'agents/pi'));
    expect(actual.packages[0]).toEqual(userPackage);
    for (const key of ['theme', 'defaultModel', 'selfUpdateCommand', 'futureSetting']) expect(actual[key]).toEqual(settings[key as keyof typeof settings]);
    expect(readFileSync(join(agent, 'auth.json'), 'utf8')).toBe('{}\n');
    expect(readFileSync(join(agent, 'sessions/keep.jsonl'), 'utf8')).toBe('session sentinel\n');
    const backups = readdirSync(agent).filter(name => name.startsWith('settings.json.backup-'));
    expect(backups).toHaveLength(1);
    expect(readFileSync(join(agent, backups[0]), 'utf8')).toBe(JSON.stringify(settings));
    expect(statSync(join(agent, backups[0])).mode & 0o777).toBe(0o600);
    const registered = actual.packages.find((entry: unknown) => typeof entry === 'string');
    actual.packages[1] = { source: registered, extensions: [], prompts: [] };
    const filtered = JSON.stringify(actual);
    writeFileSync(join(agent, 'settings.json'), filtered);
    expect(fixture.run().exitCode).toBe(0);
    expect(readFileSync(join(agent, 'settings.json'), 'utf8')).toBe(filtered);
    expect(readdirSync(agent).filter(name => name.startsWith('settings.json.backup-'))).toHaveLength(1);
    expect(existsSync(join(root, 'home/.pi'))).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 65000);

test.skipIf(!mise)('managed Pi is a pinned standalone executable independent of PATH Node', () => {
  const selected = Bun.spawnSync([mise!, '-C', process.env.HOME!, 'which', 'pi'], { env: process.env, stdout: 'pipe', stderr: 'pipe' });
  expect(selected.exitCode, selected.stderr.toString()).toBe(0);
  const executable = selected.stdout.toString().trim();
  expect(executable).toStartWith(join(process.env.MISE_DATA_DIR!, 'installs/pi') + '/');
  const root = mkdtempSync(join(tmpdir(), 'pi standalone '));
  try {
    mkdirSync(join(root, 'bin'));
    const trace = join(root, 'node-used');
    writeFileSync(join(root, 'bin/node'), '#!/bin/sh\nprintf called > "$TRACE"\nexit 91\n', { mode: 0o755 });
    const result = Bun.spawnSync([executable, '--version'], {
      cwd: root, env: { HOME: root, PATH: `${root}/bin:/usr/bin:/bin`, PI_CODING_AGENT_DIR: join(root, 'agent'), PI_OFFLINE: '1', PI_SKIP_VERSION_CHECK: '1', PI_TELEMETRY: '0', TRACE: trace },
      stdout: 'pipe', stderr: 'pipe', timeout: 15000,
    });
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    expect(result.stdout.toString().trim()).toBe(defaults.pi);
    expect(existsSync(trace)).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
