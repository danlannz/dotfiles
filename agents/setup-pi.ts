#!/usr/bin/env bun
// Register a local native Pi package; Pi, not this script, owns settings writes.
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = join(dirname(fileURLToPath(import.meta.url)), 'pi');
const configuredDirectory = process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent');
const agentDirectory = resolve(configuredDirectory.startsWith('~/') ? join(homedir(), configuredDirectory.slice(2)) : configuredDirectory);
const settingsPath = join(agentDirectory, 'settings.json');

type Package = string | { source: string };
function settings() {
  let bytes: Buffer;
  try { bytes = readFileSync(settingsPath); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { packages: [] as Package[], bytes: undefined };
    throw error;
  }
  let value;
  try { value = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')); }
  catch { throw new Error(`Cannot parse Pi settings at ${settingsPath}; file left unchanged.`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || (value.packages !== undefined && !Array.isArray(value.packages))) throw new Error(`Invalid Pi settings at ${settingsPath}; file left unchanged.`);
  const packages = (value.packages || []) as Package[];
  if (packages.some(entry => typeof entry !== 'string' && (!entry || typeof entry.source !== 'string'))) {
    throw new Error(`Invalid Pi package declarations at ${settingsPath}; file left unchanged.`);
  }
  return { packages, bytes };
}
function registered(packages: Package[]) {
  return packages.some(entry => {
    const source = typeof entry === 'string' ? entry : entry.source;
    const path = source.startsWith('~/') ? join(homedir(), source.slice(2)) : resolve(agentDirectory, source);
    return path === packageDirectory;
  });
}

try {
  const args = Bun.argv.slice(2);
  if (args.some(arg => arg !== '--dry-run')) throw new Error('Usage: bun agents/setup-pi.ts [--dry-run]');
  // Fail before configuration writes if the tracked package is missing/malformed.
  JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8'));
  const initial = settings();
  if (registered(initial.packages)) {
    console.log(`Pi package already registered: ${packageDirectory}`);
  } else if (args.includes('--dry-run')) {
    console.log(`Would register native Pi package: ${packageDirectory}`);
  } else {
    if (initial.bytes) {
      const backup = `${settingsPath}.backup-${Date.now()}-${crypto.randomUUID()}`;
      writeFileSync(backup, initial.bytes, { flag: 'wx', mode: 0o600 });
      console.log(`Backed up Pi settings to ${backup}`);
    }
    const result = Bun.spawnSync(['pi', 'install', packageDirectory, '--no-approve'], {
      env: { ...process.env, PI_CODING_AGENT_DIR: agentDirectory, PI_OFFLINE: '1', PI_TELEMETRY: '0' },
      stdin: 'ignore', stdout: 'inherit', stderr: 'inherit',
    });
    if (result.exitCode !== 0) process.exit(result.exitCode || 1);
    // Pi 1.5 may report success after warning about an unwritable settings file.
    if (!registered(settings().packages)) throw new Error('Pi did not persist the package registration; review its diagnostics and any settings backup.');
    console.log(`Verified native Pi package registration: ${packageDirectory}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
