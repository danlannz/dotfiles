import { afterEach, beforeEach, expect, test } from 'bun:test';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let directory: string;
let installer: string;
let installed: string;
let lock: string;
let home: string;

beforeEach(() => {
  directory = realpathSync(mkdtempSync(join(tmpdir(), 'skills-links-test-')));
  installer = join(directory, 'dotfiles', 'agents', 'setup.ts');
  installed = join(dirname(installer), 'skills');
  lock = join(dirname(installer), '.skill-lock.json');
  home = join(directory, 'home');
  mkdirSync(join(installed, 'upstream'), { recursive: true });
  writeFileSync(join(installed, 'upstream', 'SKILL.md'), '---\nname: upstream\n---\n# Upstream skill');
  writeFileSync(lock, JSON.stringify({ version: 3, skills: { upstream: {
    sourceType: 'github', sourceUrl: 'https://github.com/example/skills.git',
    skillPath: 'skills/upstream/SKILL.md',
  } } }));
  copyFileSync(fileURLToPath(new URL('./setup.ts', import.meta.url)), installer);
  writeFileSync(join(dirname(installer), 'instructions.md'), '# Personal defaults\nPrefer Bun and TypeScript.\n');
  // Fake the CLI, never the setup logic: test downloads without network or real-home writes.
  const bin = join(directory, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'bunx'), `#!${process.execPath}
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const args = Bun.argv.slice(2);
appendFileSync(process.env.CALL_LOG, JSON.stringify(args) + '\\n');
if (process.env.MOCK_STATUS) process.exit(Number(process.env.MOCK_STATUS));
if (process.env.MOCK_SKIP) process.exit(0);
const name = args[args.indexOf('--skill') + 1];
const folder = join(process.env.HOME, '.agents', 'skills', name);
mkdirSync(folder, { recursive: true });
writeFileSync(join(folder, 'SKILL.md'), '---\\nname: ' + name + '\\n---\\nDownloaded');
if (process.env.MOCK_ERASE_LOCK) writeFileSync(process.env.TEST_LOCK, JSON.stringify({ version: 3, skills: {} }));
`, { mode: 0o755 });
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

function run(args: string[] = [], env: Record<string, string> = {}) {
  return Bun.spawnSync([process.execPath, installer, ...args], {
    cwd: directory,
    env: {
      ...process.env, HOME: home, XDG_STATE_HOME: '', PI_CODING_AGENT_DIR: '',
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: join(directory, 'bun-cache'),
      PATH: `${join(directory, 'bin')}:${process.env.PATH}`,
      CALL_LOG: join(directory, 'calls'), TEST_LOCK: lock, ...env,
    },
    stdout: 'pipe', stderr: 'pipe',
  });
}

test('links both whole skill directories and verifies the collection from another cwd', () => {
  const result = run();
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toContain('Verified all 5 global links and the linked skill collection');
  for (const agent of ['.agents', '.claude']) {
    const path = join(home, agent, 'skills');
    expect(lstatSync(path).isSymbolicLink()).toBe(true);
    expect(realpathSync(path)).toBe(installed);
  }
  expect(realpathSync(join(home, '.agents', '.skill-lock.json'))).toBe(lock);
  const instructions = join(dirname(installer), 'instructions.md');
  expect(realpathSync(join(home, '.pi', 'agent', 'AGENTS.md'))).toBe(instructions);
  expect(realpathSync(join(home, '.claude', 'rules', 'dotfiles.md'))).toBe(instructions);
});

test('custom skills created through either agent path are automatically shared and vendored', () => {
  expect(run().exitCode).toBe(0);
  mkdirSync(join(home, '.agents', 'skills', 'local-custom'));
  const content = '---\nname: local-custom\n---\n# Custom skill';
  writeFileSync(join(home, '.agents', 'skills', 'local-custom', 'SKILL.md'), content);
  expect(readFileSync(join(installed, 'local-custom', 'SKILL.md'), 'utf8')).toBe(content);
  expect(readFileSync(join(home, '.claude', 'skills', 'local-custom', 'SKILL.md'), 'utf8')).toBe(content);
  const result = run(); // No new metadata or per-skill mappings required.
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toContain('1 managed skills (0 missing), 1 custom skills');
});

test('backs up existing directories and lockfiles without losing their contents', () => {
  for (const agent of ['.agents', '.claude']) {
    mkdirSync(join(home, agent, 'skills'), { recursive: true });
    writeFileSync(join(home, agent, 'skills', 'existing'), agent);
  }
  writeFileSync(join(home, '.agents', '.skill-lock.json'), 'previous lock');
  expect(run().exitCode).toBe(0);
  for (const agent of ['.agents', '.claude']) {
    const backup = readdirSync(join(home, agent)).find(name => name.startsWith('skills.backup-'))!;
    expect(readFileSync(join(home, agent, backup, 'existing'), 'utf8')).toBe(agent);
  }
  const backup = readdirSync(join(home, '.agents')).find(name => name.startsWith('.skill-lock.json.backup-'))!;
  expect(readFileSync(join(home, '.agents', backup), 'utf8')).toBe('previous lock');
});

test('repeated runs keep the correct links without extra backups', () => {
  expect(run().exitCode).toBe(0);
  expect(run().exitCode).toBe(0);
  expect(readdirSync(join(home, '.agents')).sort()).toEqual(['.skill-lock.json', 'skills']);
  expect(readdirSync(join(home, '.claude')).sort()).toEqual(['rules', 'skills']);
  expect(readdirSync(join(home, '.pi', 'agent'))).toEqual(['AGENTS.md']);
  expect(readdirSync(join(home, '.claude', 'rules'))).toEqual(['dotfiles.md']);
});

test('backs up dangling symlinks before replacing them', () => {
  mkdirSync(join(home, '.agents'), { recursive: true });
  symlinkSync(join(directory, 'missing'), join(home, '.agents', 'skills'));
  expect(run().exitCode).toBe(0);
  expect(realpathSync(join(home, '.agents', 'skills'))).toBe(installed);
  expect(readdirSync(join(home, '.agents')).filter(name => name.startsWith('skills.backup-'))).toHaveLength(1);
});

test('honors XDG_STATE_HOME for the lock but not skill discovery directories', () => {
  const state = join(directory, 'state');
  expect(run([], { XDG_STATE_HOME: state }).exitCode).toBe(0);
  expect(realpathSync(join(state, 'skills', '.skill-lock.json'))).toBe(lock);
  expect(existsSync(join(home, '.agents', '.skill-lock.json'))).toBe(false);
  expect(realpathSync(join(home, '.agents', 'skills'))).toBe(installed);
});

test('dry-run describes five links without writing anything', () => {
  const result = run(['--dry-run']);
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString().match(/Would link/g)).toHaveLength(5);
  expect(existsSync(home)).toBe(false);
});

test('invalid arguments make no changes', () => {
  expect(run(['--unknown']).exitCode).toBe(1);
  expect(existsSync(home)).toBe(false);
});

test('rejects a project-format lock before changing global state', () => {
  writeFileSync(lock, JSON.stringify({ version: 1, skills: {} }));
  expect(run().exitCode).toBe(1);
  expect(existsSync(home)).toBe(false);
});

test('restores missing managed skills through the global links', () => {
  rmSync(join(installed, 'upstream'), { recursive: true });
  const result = run();
  expect(result.exitCode).toBe(0);
  expect(readFileSync(join(installed, 'upstream', 'SKILL.md'), 'utf8')).toContain('Downloaded');
  const calls = readFileSync(join(directory, 'calls'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  expect(calls).toEqual([['--bun', 'skills@1.7.4', 'add', 'example/skills/skills/upstream',
    '--global', '--agent', 'claude-code', 'pi', '--skill', 'upstream', '--yes']]);
});

test.each([
  ['missing frontmatter', '# No metadata', 'Missing YAML frontmatter'],
  ['invalid YAML', '---\nname: [broken\n---\n', 'Invalid YAML frontmatter'],
  ['missing name', '---\ndescription: A skill\n---\n', 'Frontmatter name must match'],
  ['mismatched name', '---\nname: another-skill\n---\n', 'Frontmatter name must match'],
])('rejects %s before touching existing home directories', (_label, content, message) => {
  writeFileSync(join(installed, 'upstream', 'SKILL.md'), content);
  mkdirSync(join(home, '.agents', 'skills'), { recursive: true });
  writeFileSync(join(home, '.agents', 'skills', 'keep'), 'untouched');
  const result = run();
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain(message);
  expect(readFileSync(join(home, '.agents', 'skills', 'keep'), 'utf8')).toBe('untouched');
  expect(existsSync(join(home, '.claude'))).toBe(false);
});

test('validates custom skills as well as lockfile-managed skills', () => {
  mkdirSync(join(installed, 'custom'));
  writeFileSync(join(installed, 'custom', 'SKILL.md'), '---\nname: upstream\n---\n');
  const result = run();
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain('Frontmatter name must match skill directory: custom');
  expect(existsSync(home)).toBe(false);
});

test('rejects skill directories without SKILL.md', () => {
  rmSync(join(installed, 'upstream', 'SKILL.md'));
  const result = run();
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain('Missing SKILL.md for skill: upstream');
  expect(existsSync(home)).toBe(false);
});

test('accepts quoted YAML names and CRLF frontmatter', () => {
  writeFileSync(join(installed, 'upstream', 'SKILL.md'), '---\r\nname: "upstream"\r\n---\r\n');
  expect(run().exitCode).toBe(0);
});

test('ignores collection-level documentation files', () => {
  writeFileSync(join(installed, 'README.md'), '# Notes, not a skill');
  expect(run().exitCode).toBe(0);
});

test('rejects non-object lockfile entries without making changes', () => {
  writeFileSync(lock, JSON.stringify({ version: 3, skills: { upstream: null } }));
  const result = run();
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain('Invalid lockfile entry for skill: upstream');
  expect(existsSync(home)).toBe(false);
});

test('fresh clones without any skills directory restore from the lockfile', () => {
  rmSync(installed, { recursive: true });
  expect(run().exitCode).toBe(0);
  expect(existsSync(join(installed, 'upstream', 'SKILL.md'))).toBe(true);
});

test('dry-run plans missing downloads without linking, downloading, or creating skills', () => {
  rmSync(installed, { recursive: true });
  const result = run(['--dry-run']);
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toContain('Would run: bunx --bun skills@1.7.4 add');
  expect(existsSync(installed)).toBe(false);
  expect(existsSync(home)).toBe(false);
  expect(existsSync(join(directory, 'calls'))).toBe(false);
});

test('existing upstream skills are not redownloaded', () => {
  expect(run().exitCode).toBe(0);
  expect(existsSync(join(directory, 'calls'))).toBe(false);
});

test('reserves local- for custom skills even when the managed skill is missing', () => {
  writeFileSync(lock, JSON.stringify({ version: 3, skills: { 'local-bad': {} } }));
  const result = run();
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain('Reserved custom prefix in lockfile: local-bad');
  expect(existsSync(home)).toBe(false);
});

test('warns about unmanaged skills that Git would silently ignore', () => {
  mkdirSync(join(installed, 'personal'));
  writeFileSync(join(installed, 'personal', 'SKILL.md'), '---\nname: personal\n---\n');
  const result = run();
  expect(result.exitCode).toBe(0);
  expect(result.stderr.toString()).toContain('personal has no lockfile entry and is ignored by Git');
  expect(result.stderr.toString()).toContain('local-personal');
});

test('honors recorded Git refs when restoring', () => {
  rmSync(installed, { recursive: true });
  const metadata = JSON.parse(readFileSync(lock, 'utf8'));
  metadata.skills.upstream.ref = 'abc123';
  writeFileSync(lock, JSON.stringify(metadata));
  expect(run().exitCode).toBe(0);
  expect(readFileSync(join(directory, 'calls'), 'utf8')).toContain('example/skills/skills/upstream#abc123');
});

test('unsupported missing sources fail before changing global state', () => {
  rmSync(installed, { recursive: true });
  const metadata = JSON.parse(readFileSync(lock, 'utf8'));
  metadata.skills.upstream.sourceType = 'local';
  writeFileSync(lock, JSON.stringify(metadata));
  const result = run();
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain('Cannot restore upstream');
  expect(existsSync(home)).toBe(false);
});

test('failed downloads stop immediately, return failure, and preserve custom files', () => {
  rmSync(join(installed, 'upstream'), { recursive: true });
  mkdirSync(join(installed, 'local-personal'));
  const file = join(installed, 'local-personal', 'SKILL.md');
  const content = '---\nname: local-personal\n---\nKeep me';
  writeFileSync(file, content);
  expect(run([], { MOCK_STATUS: '7' }).exitCode).toBe(7);
  expect(readFileSync(file, 'utf8')).toBe(content);
  expect(readFileSync(join(directory, 'calls'), 'utf8').trim().split('\n')).toHaveLength(1);
});

test('detects successful CLI exit without the promised skill files', () => {
  rmSync(installed, { recursive: true });
  const result = run([], { MOCK_SKIP: '1' });
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain('Restore did not provide skills: upstream');
});

test('snapshots all downloads before CLI writes and detects lost lock entries', () => {
  const metadata = JSON.parse(readFileSync(lock, 'utf8'));
  metadata.skills.second = { ...metadata.skills.upstream, skillPath: 'skills/second/SKILL.md' };
  writeFileSync(lock, JSON.stringify(metadata));
  rmSync(installed, { recursive: true });
  const result = run([], { MOCK_ERASE_LOCK: '1' });
  expect(result.exitCode).toBe(1);
  expect(readFileSync(join(directory, 'calls'), 'utf8').trim().split('\n')).toHaveLength(2);
  expect(result.stderr.toString()).toContain('Restore unexpectedly removed lockfile entry');
});

test('gitignore excludes downloads but includes local- skills and nested resources', () => {
  const repo = dirname(dirname(installer));
  const ignore = fileURLToPath(new URL('../.gitignore', import.meta.url));
  copyFileSync(ignore, join(repo, '.gitignore'));
  expect(Bun.spawnSync(['git', 'init', '--quiet', repo]).exitCode).toBe(0);
  const ignored = (path: string) => Bun.spawnSync(['git', '-C', repo, 'check-ignore', '--no-index', '-q', path]).exitCode;
  expect(ignored('agents/skills/upstream/SKILL.md')).toBe(0);
  expect(ignored('agents/skills/unprefixed/SKILL.md')).toBe(0);
  expect(ignored('agents/skills/local-personal/SKILL.md')).toBe(1);
  expect(ignored('agents/skills/local-personal/resources/helper.ts')).toBe(1);
  expect(ignored('agents/.skill-lock.json')).toBe(1);
});

test('preserves existing Claude instructions, imports, and unrelated rules', () => {
  mkdirSync(join(home, '.claude', 'rules'), { recursive: true });
  writeFileSync(join(home, '.claude', 'CLAUDE.md'), '@RTK.md\n');
  writeFileSync(join(home, '.claude', 'RTK.md'), '# Existing RTK config');
  writeFileSync(join(home, '.claude', 'rules', 'other.md'), '# Other preferences');
  expect(run().exitCode).toBe(0);
  expect(readFileSync(join(home, '.claude', 'CLAUDE.md'), 'utf8')).toBe('@RTK.md\n');
  expect(readFileSync(join(home, '.claude', 'RTK.md'), 'utf8')).toBe('# Existing RTK config');
  expect(readFileSync(join(home, '.claude', 'rules', 'other.md'), 'utf8')).toBe('# Other preferences');
});

test('backs up conflicting global instruction files before linking shared defaults', () => {
  const targets = [join(home, '.pi', 'agent', 'AGENTS.md'), join(home, '.claude', 'rules', 'dotfiles.md')];
  for (const target of targets) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, '# Previous instructions');
  }
  expect(run().exitCode).toBe(0);
  for (const target of targets) {
    expect(lstatSync(target).isSymbolicLink()).toBe(true);
    const backup = readdirSync(dirname(target)).find(name => name.startsWith(target.split('/').at(-1)! + '.backup-'))!;
    expect(readFileSync(join(dirname(target), backup), 'utf8')).toBe('# Previous instructions');
  }
});

test('honors the Pi agent directory override for personal instructions', () => {
  const piDirectory = join(directory, 'custom-pi');
  expect(run([], { PI_CODING_AGENT_DIR: piDirectory }).exitCode).toBe(0);
  expect(realpathSync(join(piDirectory, 'AGENTS.md'))).toBe(join(dirname(installer), 'instructions.md'));
  expect(existsSync(join(home, '.pi'))).toBe(false);
});

test.each(['', '   \n', null])('missing or empty shared instructions fail before changing home', content => {
  const path = join(dirname(installer), 'instructions.md');
  if (content === null) rmSync(path);
  else writeFileSync(path, content);
  expect(run().exitCode).toBe(1);
  expect(existsSync(home)).toBe(false);
});
