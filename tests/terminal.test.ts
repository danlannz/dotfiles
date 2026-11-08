import { afterEach, beforeEach, expect, test } from 'bun:test';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const profileURL = new URL('../terminal/iterm2.json', import.meta.url);
const nativeMac = Boolean(process.env.DOTFILES_TEST_MISE_BIN);
const script = fileURLToPath(new URL('../terminal/setup.js', import.meta.url));
let directory: string;
let domain: string;
let deployed: string;
beforeEach(() => {
  if (!nativeMac) return;
  directory = mkdtempSync(join(tmpdir(), 'dotfiles terminal '));
  domain = `nz.danlannz.dotfiles.tests.iterm.${crypto.randomUUID()}`;
  deployed = join(directory, 'profile.json');
  copyFileSync(profileURL, deployed);
});
afterEach(() => {
  if (!nativeMac) return;
  Bun.spawnSync(['/usr/bin/defaults', 'delete', domain], { stdout: 'pipe', stderr: 'pipe' });
  rmSync(directory, { recursive: true, force: true });
});
function configure(args: string[] = []) {
  return Bun.spawnSync(['/usr/bin/osascript', '-l', 'JavaScript', script, deployed, fileURLToPath(profileURL), '--test-domain', domain, ...args], {
    stdout: 'pipe', stderr: 'pipe', timeout: 10000,
  });
}
function seed(value: unknown) {
  const xml = Bun.spawnSync(['/usr/bin/plutil', '-convert', 'xml1', '-o', '-', '-'], { stdin: Buffer.from(JSON.stringify(value)), stdout: 'pipe', stderr: 'pipe' });
  expect(xml.exitCode).toBe(0);
  const result = Bun.spawnSync(['/usr/bin/defaults', 'import', domain, '-'], { stdin: xml.stdout, stdout: 'pipe', stderr: 'pipe' });
  expect(result.exitCode).toBe(0);
}
function preferences() {
  const result = Bun.spawnSync(['/usr/bin/defaults', 'export', domain, '-'], { stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) return {};
  const json = Bun.spawnSync(['/usr/bin/plutil', '-convert', 'json', '-o', '-', '-'], { stdin: result.stdout, stdout: 'pipe', stderr: 'pipe' });
  expect(json.exitCode).toBe(0);
  return JSON.parse(json.stdout.toString());
}

test('the native terminal profile matches the host appearance without exporting machine-specific commands', () => {
  const file = JSON.parse(readFileSync(profileURL, 'utf8'));
  expect(file.Profiles).toHaveLength(1);
  const profile = file.Profiles[0];
  expect(profile.Name).toBe('Dotfiles');
  expect(profile.Guid).toMatch(/^[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}$/i);
  expect(profile['Normal Font']).toBe('MesloLGMNFM-Regular 12');
  expect(profile['Use Non-ASCII Font']).toBe(false);
  expect(profile['Use Separate Colors for Light and Dark Mode']).toBe(false);
  expect(profile['Custom Command']).toBe('No');
  expect(profile['Custom Directory']).toBe('No');
  expect(profile.Rewritable).toBe(true);
  expect(profile['Background Color']['Red Component']).toBe(0);
  expect(profile['Background Color']['Blue Component']).toBeCloseTo(0.15170273);
  for (let i = 0; i < 16; i++) expect(profile[`Ansi ${i} Color`]).toBeObject();
  // Dynamic profiles inherit unspecified attributes from the default profile.
  // Clear automatic actions/host-specific fields rather than inheriting an SSH
  // command, initial text or password trigger from a user's custom default.
  for (const key of ['Command', 'Working Directory', 'Initial Text']) expect(profile[key]).toBe('');
  expect(profile).not.toHaveProperty('Environment Vars');
  expect(profile['Bound Hosts']).toEqual([]);
  expect(profile.Triggers).toEqual([]);
  expect(JSON.stringify(profile)).not.toContain('/Users/');
});

test.skipIf(!nativeMac)('fresh native preferences select the dynamic GUID without creating a conflicting regular profile', () => {
  const result = configure();
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  const prefs = preferences();
  const guid = JSON.parse(readFileSync(profileURL, 'utf8')).Profiles[0].Guid;
  expect(prefs).toEqual({ 'Default Bookmark Guid': guid });
});

test.skipIf(!nativeMac)('the actual Meslo face covers Agnoster separators and Nerd Font glyphs', () => {
  const result = Bun.spawnSync(['/usr/bin/osascript', '-l', 'JavaScript', '-e', `function run() {
    ObjC.import('AppKit');
    const font = $.NSFont.fontWithNameSize('MesloLGMNFM-Regular', 12);
    if (font.isNil()) throw Error('Missing profile font');
    return JSON.stringify([0xe0b0, 0xe0a0, 0xf013].map(code => Boolean(font.coveredCharacterSet.characterIsMember(code))));
  }`], { stdout: 'pipe', stderr: 'pipe' });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(JSON.parse(result.stdout.toString())).toEqual([true, true, true]);
});

test.skipIf(!nativeMac)('native setup reruns preserve user changes without adding profiles', () => {
  expect(configure().exitCode).toBe(0);
  const before = preferences();
  const edited = JSON.parse(readFileSync(deployed, 'utf8'));
  edited.Profiles[0]['Normal Font'] = 'Monaco 17';
  writeFileSync(deployed, JSON.stringify(edited));
  before['Unrelated Setting'] = { enabled: true, count: 3 };
  seed(before);
  expect(configure().exitCode).toBe(0);
  expect(preferences()).toEqual(before);
  expect(JSON.parse(readFileSync(deployed, 'utf8'))).toEqual(edited);
});

test.skipIf(!nativeMac)('existing profiles and default choices are not inferred to be unused', () => {
  const before = { 'Default Bookmark Guid': 'personal', 'New Bookmarks': [{ Guid: 'personal', Name: 'Personal', 'Custom Command': 'Yes', Command: 'fixture-only-command' }], Theme: 2 };
  seed(before);
  expect(configure().exitCode).toBe(0);
  expect(preferences()).toEqual(before);
});

test.skipIf(!nativeMac)('existing profiles without an explicit default also remain untouched', () => {
  const before = { 'New Bookmarks': [{ Guid: 'personal', Name: 'Default' }] };
  seed(before);
  expect(configure().exitCode).toBe(0);
  expect(preferences()).toEqual(before);
});

test.skipIf(!nativeMac)('explicit selection changes only the default GUID and never appends a regular profile', () => {
  const personal = { Guid: 'personal', Name: 'Personal', 'Normal Font': 'Monaco 15' };
  seed({ 'Default Bookmark Guid': 'personal', 'New Bookmarks': [personal], Theme: 2 });
  const result = configure(['--make-default']);
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  const after = preferences();
  expect(after['New Bookmarks']).toEqual([personal]);
  expect(after['Default Bookmark Guid']).toBe(JSON.parse(readFileSync(profileURL, 'utf8')).Profiles[0].Guid);
  expect(after.Theme).toBe(2);
  expect(configure(['--make-default']).exitCode).toBe(0);
  expect(preferences()).toEqual(after);
});

test.skipIf(!nativeMac)('a colliding regular profile fails visibly without deleting or overwriting user edits', () => {
  const ours = JSON.parse(readFileSync(profileURL, 'utf8')).Profiles[0];
  ours.Name = 'My edited Dotfiles';
  ours['Normal Font'] = 'Monaco 15';
  seed({ 'New Bookmarks': [ours] });
  for (const args of [[], ['--make-default']]) {
    const result = configure(args);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain('non-dynamic profile');
    expect(preferences()).toEqual({ 'New Bookmarks': [ours] });
  }
});

test.skipIf(!nativeMac)('an iTerm-marked dynamic profile is not mistaken for a regular GUID collision', () => {
  const ours = { ...JSON.parse(readFileSync(profileURL, 'utf8')).Profiles[0], 'Is Dynamic Profile': true };
  seed({ 'New Bookmarks': [ours] });
  const result = configure(['--make-default']);
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(preferences()).toEqual({ 'New Bookmarks': [ours], 'Default Bookmark Guid': ours.Guid });
});

test.skipIf(!nativeMac)('fresh selection preserves unrelated preferences', () => {
  seed({ Theme: 2, Personal: { enabled: true } });
  expect(configure().exitCode).toBe(0);
  const after = preferences();
  expect(after.Theme).toBe(2);
  expect(after.Personal).toEqual({ enabled: true });
});

test.skipIf(!nativeMac)('native updates preserve opaque preference data without JSON round-tripping it', () => {
  const write = Bun.spawnSync(['/usr/bin/defaults', 'write', domain, 'Opaque', '-data', '00ff0102'], { stdout: 'pipe', stderr: 'pipe' });
  expect(write.exitCode).toBe(0);
  const before = Bun.spawnSync(['/usr/bin/defaults', 'read', domain, 'Opaque'], { stdout: 'pipe', stderr: 'pipe' }).stdout.toString();
  expect(configure().exitCode).toBe(0);
  const after = Bun.spawnSync(['/usr/bin/defaults', 'read', domain, 'Opaque'], { stdout: 'pipe', stderr: 'pipe' });
  expect(after.exitCode).toBe(0);
  expect(after.stdout.toString()).toBe(before);
  const type = Bun.spawnSync(['/usr/bin/defaults', 'read-type', domain, 'Opaque'], { stdout: 'pipe', stderr: 'pipe' });
  expect(type.stdout.toString()).toContain('data');
});

test.skipIf(!nativeMac)('the test-only domain override cannot target a real application domain', () => {
  const result = configure(['--test-domain', 'com.googlecode.iterm2']);
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain('Invalid isolated test domain');
  expect(preferences()).toEqual({});
});

test.skipIf(!nativeMac)('external preference folders are never silently replaced', () => {
  const before = { LoadPrefsFromCustomFolder: true, PrefsCustomFolder: '/fixture/external' };
  seed(before);
  expect(configure().exitCode).toBe(0);
  expect(configure(['--make-default']).exitCode).not.toBe(0);
  expect(preferences()).toEqual(before);
});

test.skipIf(!nativeMac)('preview validates the font but writes no preferences', () => {
  const result = configure(['--dry-run']);
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(result.stdout.toString()).toContain('no preferences changed');
  expect(preferences()).toEqual({});
});

test.skipIf(!nativeMac)('a missing font fails before recording an unusable default', () => {
  const file = JSON.parse(readFileSync(deployed, 'utf8'));
  file.Profiles[0]['Normal Font'] = 'DeliberatelyMissingDotfilesFont 12';
  writeFileSync(deployed, JSON.stringify(file));
  const result = configure();
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain('font is unavailable');
  expect(preferences()).toEqual({});
});

test.skipIf(!nativeMac)('a deployed profile rewritten as a native XML plist remains usable', () => {
  const converted = Bun.spawnSync(['/usr/bin/plutil', '-convert', 'xml1', deployed], { stdout: 'pipe', stderr: 'pipe' });
  expect(converted.exitCode).toBe(0);
  const result = configure();
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(preferences()).toEqual({ 'Default Bookmark Guid': JSON.parse(readFileSync(profileURL, 'utf8')).Profiles[0].Guid });
});

test.skipIf(!nativeMac)('a malformed or differently owned profile file is preserved without changing preferences', () => {
  writeFileSync(deployed, '{');
  expect(configure().exitCode).not.toBe(0);
  expect(readFileSync(deployed, 'utf8')).toBe('{');
  const file = JSON.parse(readFileSync(profileURL, 'utf8'));
  file.Profiles[0].Guid = 'different-owner';
  writeFileSync(deployed, JSON.stringify(file));
  expect(configure().exitCode).toBe(0);
  expect(configure(['--make-default']).exitCode).not.toBe(0);
  expect(preferences()).toEqual({});
});
