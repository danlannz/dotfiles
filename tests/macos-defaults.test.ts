import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('..', import.meta.url));
let root: string;
let state: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'macOS preferences '));
  state = join(root, 'preferences.json');
  mkdirSync(join(root, 'bin')); mkdirSync(join(root, 'home'));
  writeFileSync(state, '{}'); writeFileSync(join(root, 'trace'), '');
  writeFileSync(join(root, 'bin/id'), '#!/bin/sh\nprintf "%s\\n" "${FAKE_UID:-501}"\n', { mode: 0o755 });
  writeFileSync(join(root, 'bin/uname'), '#!/bin/sh\nprintf "%s\\n" "${FAKE_OS:-Darwin}"\n', { mode: 0o755 });
  writeFileSync(join(root, 'bin/defaults'), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} "$FIXTURE/defaults.ts" "$@"\n`, { mode: 0o755 });
  writeFileSync(join(root, 'defaults.ts'), `
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
const [action, domain, key, type, value] = process.argv.slice(2);
appendFileSync(process.env.TRACE!, [action, domain, key, type, value].filter(x => x !== undefined).join(' ') + '\\n');
const path = process.env.STATE!;
const data = JSON.parse(readFileSync(path, 'utf8'));
const entry = data[domain]?.[key];
if (action === 'read' || action === 'read-type') {
  if (key === process.env.READ_FAIL_KEY) { console.error('Could not read preferences'); process.exit(7); }
  if (!entry) {
    if (!process.env.EMPTY_READ_ERROR) console.error('The domain/default pair of (' + domain + ', ' + key + ') does not exist');
    process.exit(1);
  }
  console.log(action === 'read-type' ? 'Type is ' + entry.type : entry.value);
} else if (action === 'write') {
  if (key === process.env.WRITE_FAIL_KEY) process.exit(8);
  if (!process.env.FALSE_WRITE) {
    data[domain] ??= {};
    data[domain][key] = { type: process.env.WRONG_TYPE ? 'string' : ({ '-bool': 'boolean', '-int': 'integer', '-float': 'float', '-string': 'string' })[type], value: type === '-bool' ? (value === 'true' ? '1' : '0') : value };
    writeFileSync(path, JSON.stringify(data));
  }
} else process.exit(99);
`);
  for (const name of ['sudo', 'killall', 'pkill', 'launchctl', 'osascript']) {
    writeFileSync(join(root, 'bin', name), '#!/bin/sh\nprintf "FORBIDDEN %s\\n" "$0" >> "$TRACE"\nexit 91\n', { mode: 0o755 });
  }
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function environment(extra: Record<string, string> = {}) {
  return { HOME: join(root, 'home'), PATH: `${root}/bin:/usr/bin:/bin`, FIXTURE: root, STATE: state, TRACE: join(root, 'trace'), ...extra };
}

function run(args: string[] = [], extra: Record<string, string> = {}) {
  const result = Bun.spawnSync(['/bin/bash', join(source, '.macos'), ...args], {
    cwd: root, env: environment(extra),
    stdout: 'pipe', stderr: 'pipe',
  });
  return { ...result, trace: readFileSync(join(root, 'trace'), 'utf8'), preferences: JSON.parse(readFileSync(state, 'utf8')) };
}

test('explicit apply seeds exactly the eleven reviewed typed preferences, then becomes a no-op', () => {
  const first = run(['--apply']);
  expect(first.exitCode, first.stderr.toString()).toBe(0);
  expect(first.preferences).toEqual({
    'com.apple.iphonesimulator': { ShowSingleTouches: { type: 'boolean', value: '1' } },
    'com.apple.dock': { autohide: { type: 'boolean', value: '1' }, 'mru-spaces': { type: 'boolean', value: '0' } },
    NSGlobalDomain: {
      'com.apple.mouse.scaling': { type: 'float', value: '2' },
      KeyRepeat: { type: 'integer', value: '1' }, InitialKeyRepeat: { type: 'integer', value: '25' },
      AppleShowAllExtensions: { type: 'boolean', value: '1' },
    },
    'com.apple.finder': {
      ShowPathbar: { type: 'boolean', value: '1' }, FXPreferredViewStyle: { type: 'string', value: 'Nlsv' },
      ShowHardDrivesOnDesktop: { type: 'boolean', value: '1' }, ShowMountedServersOnDesktop: { type: 'boolean', value: '1' },
    },
  });
  writeFileSync(join(root, 'trace'), '');
  const repeat = run(['--apply']);
  expect(repeat.exitCode, repeat.stderr.toString()).toBe(0);
  expect(repeat.trace).not.toContain('write ');
  expect(repeat.trace).not.toContain('FORBIDDEN');
  expect(repeat.preferences).toEqual(first.preferences);
});

test('existing false, zero, alternate views, types and unrelated preferences survive apply', () => {
  const existing = {
    'com.apple.dock': { autohide: { type: 'boolean', value: '0' }, tilesize: { type: 'integer', value: '70' } },
    NSGlobalDomain: { KeyRepeat: { type: 'integer', value: '0' }, 'private-unrelated': { type: 'string', value: 'keep' } },
    'com.apple.finder': { FXPreferredViewStyle: { type: 'string', value: 'icnv' }, ShowPathbar: { type: 'string', value: 'NO' } },
  };
  writeFileSync(state, JSON.stringify(existing));
  const result = run(['--apply']);
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  for (const [domain, entries] of Object.entries(existing)) for (const [key, value] of Object.entries(entries)) {
    expect(result.preferences[domain][key]).toEqual(value);
    expect(result.trace).not.toContain(`write ${domain} ${key} `);
  }
});

test.each([{ READ_FAIL_KEY: 'FXPreferredViewStyle' }, { EMPTY_READ_ERROR: '1' }])('unknown read errors stop before any writes: %j', failure => {
  const result = run(['--apply'], failure);
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain('Cannot read');
  expect(result.trace).not.toContain('write ');
  expect(result.preferences).toEqual({});
});

test('a partial write failure is visible and retry fills only the remaining missing settings', () => {
  const failed = run(['--apply'], { WRITE_FAIL_KEY: 'FXPreferredViewStyle' });
  expect(failed.exitCode).toBe(8);
  expect(failed.stderr.toString()).toContain('Cannot write');
  expect(failed.preferences['com.apple.dock'].autohide.value).toBe('1');
  writeFileSync(join(root, 'trace'), '');
  const retry = run(['--apply']);
  expect(retry.exitCode, retry.stderr.toString()).toBe(0);
  expect(retry.trace).not.toContain('write com.apple.dock autohide');
  expect(retry.preferences['com.apple.finder'].FXPreferredViewStyle.value).toBe('Nlsv');
});

test.each([{ FALSE_WRITE: '1' }, { WRONG_TYPE: '1' }])('successful exit without correctly persisted typed values is rejected: %j', failure => {
  expect(run(['--apply'], failure).exitCode).not.toBe(0);
});

test.each([
  { args: ['--unknown'], env: {}, status: 2 },
  { args: ['--apply', '--preview'], env: {}, status: 2 },
  { args: ['--apply'], env: { CI: '1' }, status: 1 },
  { args: [], env: { FAKE_OS: 'Linux' }, status: 1 },
  { args: ['--apply'], env: { FAKE_UID: '0' }, status: 1 },
])('invalid invocation/CI/platform cannot reach preferences: %j', ({ args, env, status }) => {
  const result = run(args, env);
  expect(result.exitCode).toBe(status);
  expect(result.trace).toBe('');
});

test('native tasks separate preview from bootstrap seed-only application', () => {
  const config = Bun.TOML.parse(readFileSync(join(source, 'mise.toml'), 'utf8')) as any;
  expect(config.tasks['macos-defaults'].run).toBe('bash "{{ config_root }}/.macos" --preview');
  expect(config.tasks['macos-defaults-apply'].run).toBe('bash "{{ config_root }}/.macos" --apply');
});

test('CI may preview but never writes preferences', () => {
  const result = run([], { CI: '1' });
  expect(result.exitCode).toBe(0);
  expect(result.preferences).toEqual({});
});

test.each(['showHiddenFiles', 'hideHiddenFiles'])('Finder helper %s changes only its requested key without restarting anything', name => {
  const result = Bun.spawnSync(['/bin/zsh', '-dfc', 'source "$1"; eval "$2"', 'preference-alias', join(source, '.alias'), name], {
    env: environment(), stdout: 'pipe', stderr: 'pipe',
  });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  const trace = readFileSync(join(root, 'trace'), 'utf8');
  expect(trace.trim()).toBe(`write com.apple.finder AppleShowAllFiles -bool ${name === 'showHiddenFiles' ? 'true' : 'false'}`);
  expect(result.stdout.toString()).toContain('manually');
});

test('macOS defaults preview is read-only and reports missing reviewed settings', () => {
  const result = run();
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(result.preferences).toEqual({});
  expect(result.trace).not.toContain('write ');
  expect(result.stdout.toString()).toContain('--apply');
  expect(result.stdout.toString()).toContain('ShowPathbar');
});
