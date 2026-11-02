#!/usr/bin/env bun
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI_VERSION = '1.7.4';
const directory = dirname(fileURLToPath(import.meta.url));
const skills = join(directory, 'skills');
const lock = join(directory, '.skill-lock.json');
const instructions = join(directory, 'instructions.md');
const piAgentDirectory = process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent');
const globalLock = process.env.XDG_STATE_HOME
  ? join(process.env.XDG_STATE_HOME, 'skills', '.skill-lock.json')
  : join(homedir(), '.agents', '.skill-lock.json');
const links = [
  { source: skills, destination: join(homedir(), '.agents', 'skills') },
  { source: skills, destination: join(homedir(), '.claude', 'skills') },
  { source: lock, destination: globalLock },
  { source: instructions, destination: join(piAgentDirectory, 'AGENTS.md') },
  // Unconditional Claude rules preserve existing CLAUDE.md imports and local settings.
  { source: instructions, destination: join(homedir(), '.claude', 'rules', 'dotfiles.md') },
];

type Entries = Record<string, Record<string, unknown>>;

function readEntries(path: string): Entries {
  const metadata = JSON.parse(readFileSync(path, 'utf8'));
  if (!metadata || metadata.version !== 3 || !metadata.skills || typeof metadata.skills !== 'object' || Array.isArray(metadata.skills)) {
    throw new Error('Expected a version 3 global .skill-lock.json with a skills map.');
  }
  for (const [name, entry] of Object.entries(metadata.skills)) {
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error(`Invalid lockfile skill name: ${name}`);
    if (name.startsWith('local-')) throw new Error(`Reserved custom prefix in lockfile: ${name}. Rename it or remove its managed entry.`);
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`Invalid lockfile entry for skill: ${name}`);
  }
  return metadata.skills;
}

function inspectCollection(skillsPath: string, entries: Entries) {
  const root = statSync(skillsPath, { throwIfNoEntry: false });
  if (root && !root.isDirectory()) throw new Error(`Not a skills directory: ${skillsPath}`);
  const names = new Set<string>();
  for (const name of root ? readdirSync(skillsPath) : []) {
    const path = join(skillsPath, name);
    if (!statSync(path).isDirectory()) continue;
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error(`Invalid skill directory name: ${name}`);
    const skillFile = join(path, 'SKILL.md');
    if (!statSync(skillFile, { throwIfNoEntry: false })?.isFile()) throw new Error(`Missing SKILL.md for skill: ${name}`);
    const frontmatter = readFileSync(skillFile, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!frontmatter) throw new Error(`Missing YAML frontmatter for skill: ${name}`);
    let parsed: unknown;
    try {
      parsed = Bun.YAML.parse(frontmatter[1]!);
    } catch {
      throw new Error(`Invalid YAML frontmatter for skill: ${name}`);
    }
    if (!parsed || typeof parsed !== 'object' || !('name' in parsed) || parsed.name !== name) {
      throw new Error(`Frontmatter name must match skill directory: ${name}`);
    }
    names.add(name);
  }
  const managed = Object.keys(entries);
  const custom = [...names].filter(name => !Object.hasOwn(entries, name));
  return {
    missing: managed.filter(name => !names.has(name)),
    custom: custom.length,
    untracked: custom.filter(name => !name.startsWith('local-')),
  };
}

function restoreCommand(name: string, entry: Record<string, unknown>): string[] {
  if (entry.sourceType !== 'github' || typeof entry.sourceUrl !== 'string'
    || typeof entry.skillPath !== 'string' || !entry.skillPath.endsWith('/SKILL.md')
    || (entry.ref !== undefined && (typeof entry.ref !== 'string' || !entry.ref))) {
    throw new Error(`Cannot restore ${name}: expected a GitHub source URL and skillPath.`);
  }
  const repository = new URL(entry.sourceUrl);
  if (repository.protocol !== 'https:' || repository.hostname !== 'github.com'
    || !/^\/[^/]+\/[^/]+$/.test(repository.pathname.replace(/\.git$/, ''))
    || entry.skillPath.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Cannot restore ${name}: unsupported source URL or skill path.`);
  }
  // Shorthand addresses the exact skill folder without assuming a default branch.
  const source = `${repository.pathname.slice(1).replace(/\.git$/, '')}/${dirname(entry.skillPath)}${entry.ref ? `#${encodeURIComponent(entry.ref as string)}` : ''}`;
  return ['bunx', '--bun', `skills@${CLI_VERSION}`, 'add', source,
    '--global', '--agent', 'claude-code', 'pi', '--skill', name, '--yes'];
}

function link(source: string, destination: string): void {
  let existing;
  try {
    existing = lstatSync(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (existing?.isSymbolicLink()) {
    try {
      if (realpathSync(destination) === realpathSync(source)) return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  mkdirSync(dirname(destination), { recursive: true });
  const backup = existing ? `${destination}.backup-${Date.now()}-${crypto.randomUUID()}` : undefined;
  if (backup) {
    renameSync(destination, backup);
    console.log(`Backed up ${destination} to ${backup}`);
  }
  try {
    symlinkSync(source, destination);
  } catch (error) {
    if (backup) renameSync(backup, destination);
    throw error;
  }
  console.log(`Linked ${destination} -> ${source}`);
}

try {
  const args = Bun.argv.slice(2);
  if (args.some(arg => arg !== '--dry-run')) throw new Error('Usage: bun agents/setup.ts [--dry-run]');
  const dryRun = args.includes('--dry-run');
  if (!readFileSync(instructions, 'utf8').trim()) throw new Error('Shared instructions.md must not be empty.');
  const entries = readEntries(lock);
  const initial = inspectCollection(skills, entries);
  // Snapshot all restore commands before any CLI invocation can rewrite the shared lockfile.
  const commands = initial.missing.map(name => restoreCommand(name, entries[name]!));
  for (const name of initial.untracked) {
    console.warn(`Warning: ${name} has no lockfile entry and is ignored by Git. Rename it to local-${name} (including frontmatter) to keep it in dotfiles.`);
  }
  console.log(`${Object.keys(entries).length} managed skills (${initial.missing.length} missing), ${initial.custom} custom skills.`);
  if (!dryRun) mkdirSync(skills, { recursive: true });
  for (const { source, destination } of links) {
    if (dryRun) console.log(`Would link ${destination} -> ${source}`);
    else link(source, destination);
  }
  for (const command of commands) {
    console.log(`${dryRun ? 'Would run' : 'Running'}: ${command.join(' ')}`);
    if (dryRun) continue;
    const result = Bun.spawnSync(command, { stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' });
    if (result.exitCode !== 0) process.exit(result.exitCode || 1);
  }
  if (!dryRun) {
    for (const { source, destination } of links) {
      if (!lstatSync(destination).isSymbolicLink() || realpathSync(destination) !== realpathSync(source)) {
        throw new Error(`Global link does not resolve to the repo: ${destination}`);
      }
    }
    const finalEntries = readEntries(globalLock);
    for (const name of Object.keys(entries)) {
      if (!Object.hasOwn(finalEntries, name)) throw new Error(`Restore unexpectedly removed lockfile entry: ${name}`);
    }
    const final = inspectCollection(join(homedir(), '.agents', 'skills'), finalEntries);
    if (final.missing.length) throw new Error(`Restore did not provide skills: ${final.missing.join(', ')}`);
    console.log(`Verified all ${links.length} global links and the linked skill collection (structure only; upstream hashes not checked).`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
