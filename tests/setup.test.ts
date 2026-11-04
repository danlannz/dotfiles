import { afterEach, beforeEach, expect, test } from 'bun:test';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('..', import.meta.url));
let root: string;
let home: string;
let repo: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'dotfiles-deployment-')));
  home = join(root, 'home');
  repo = join(root, 'checkout with spaces');
  mkdirSync(home);
  mkdirSync(join(repo, 'script'), { recursive: true });
  mkdirSync(join(root, 'bin'));
  copyFileSync(join(source, 'script/setup'), join(repo, 'script/setup'));
  writeFileSync(join(repo, '.zshrc'), 'managed shell\n');
  writeFileSync(join(home, '.zshrc'), 'existing user configuration\n');
  writeFileSync(join(root, 'bin/mise'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$TRACE"\nexit "${MISE_STATUS:-0}"\n', { mode: 0o755 });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function run(args: string[] = [], extra: Record<string, string> = {}) {
  const result = Bun.spawnSync(['/bin/bash', join(repo, 'script/setup'), ...args], {
    cwd: root,
    env: { HOME: home, PATH: `${root}/bin:/usr/bin:/bin`, TRACE: join(root, 'trace'), ...extra },
    stdout: 'pipe', stderr: 'pipe',
  });
  return result;
}

const nativeMise = process.env.DOTFILES_MISE_PILOT_BIN;
function deploy(args: string[] = [], env: Record<string, string> = {}) {
  copyFileSync(join(source, 'mise.toml'), join(repo, 'mise.toml'));
  const config = Bun.TOML.parse(readFileSync(join(repo, 'mise.toml'), 'utf8'));
  for (const entry of Object.values(config.dotfiles) as { source: string }[]) {
    const target = join(repo, entry.source);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(source, entry.source), target);
  }
  return run(args, {
    PATH: `${dirname(nativeMise!)}:/usr/bin:/bin:/usr/sbin:/sbin`,
    MISE_CONFIG_DIR: join(home, '.config/mise'), MISE_DATA_DIR: join(root, 'data'),
    MISE_CACHE_DIR: join(root, 'cache'), MISE_STATE_DIR: join(root, 'state'), CI: '1',
    ...env,
  });
}

test('unknown deployment options fail before invoking mise', () => {
  expect(run(['--force']).exitCode).toBe(2);
  expect(existsSync(join(root, 'trace'))).toBe(false);
  expect(readFileSync(join(home, '.zshrc'), 'utf8')).toBe('existing user configuration\n');
});

test('native deployment failure propagates without modifying configuration itself', () => {
  expect(run([], { MISE_STATUS: '9' }).exitCode).toBe(9);
  expect(readFileSync(join(home, '.zshrc'), 'utf8')).toBe('existing user configuration\n');
});

test.skipIf(!nativeMise)('native deployment creates explicit links without installing runtimes or linking repo internals', () => {
  rmSync(join(home, '.zshrc'));
  const result = deploy();
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(readlinkSync(join(home, '.zshrc'))).toBe(join(repo, '.zshrc'));
  expect(readlinkSync(join(home, '.config/mise/config.toml'))).toBe(join(repo, 'mise/config.toml'));
  expect(readlinkSync(join(home, '.config/mise/mise.lock'))).toBe(join(repo, 'mise/mise.lock'));
  for (const path of ['.gitignore', '.git', '.worktrees', '.agents', '.pi', '.claude']) {
    expect(existsSync(join(home, path))).toBe(false);
  }
  expect(existsSync(join(root, 'data/installs'))).toBe(false);
});

test.skipIf(!nativeMise)('native preview creates no destination links', () => {
  rmSync(join(home, '.zshrc'));
  const result = deploy(['--dry-run']);
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(existsSync(join(home, '.zshrc'))).toBe(false);
  expect(existsSync(join(home, '.Brewfile'))).toBe(false);
  expect(existsSync(join(home, '.config/mise/config.toml'))).toBe(false);
});

test.skipIf(!nativeMise)('native deployment refuses a real file conflict without losing user content', () => {
  const result = deploy();
  expect(result.exitCode).not.toBe(0);
  expect(lstatSync(join(home, '.zshrc')).isFile()).toBe(true);
  expect(readFileSync(join(home, '.zshrc'), 'utf8')).toBe('existing user configuration\n');
  expect(existsSync(join(home, '.config/mise/config.toml'))).toBe(false);
});

test.skipIf(!nativeMise)('native deployment refuses a directory conflict without removing its contents', () => {
  rmSync(join(home, '.zshrc'));
  mkdirSync(join(home, '.zshrc'));
  writeFileSync(join(home, '.zshrc/user-data'), 'keep me');
  expect(deploy().exitCode).not.toBe(0);
  expect(readFileSync(join(home, '.zshrc/user-data'), 'utf8')).toBe('keep me');
});

for (const dangling of [false, true]) {
  test.skipIf(!nativeMise)(`native deployment repoints an old symlink without deleting its target (dangling=${dangling})`, () => {
    rmSync(join(home, '.zshrc'));
    const original = join(root, 'old-zshrc');
    if (!dangling) writeFileSync(original, 'old configuration');
    symlinkSync(original, join(home, '.zshrc'));
    const result = deploy();
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    expect(readlinkSync(join(home, '.zshrc'))).toBe(join(repo, '.zshrc'));
    if (!dangling) expect(readFileSync(original, 'utf8')).toBe('old configuration');
  });
}

test.skipIf(!nativeMise)('native deployment rerun leaves correct links and unrelated user data alone', () => {
  rmSync(join(home, '.zshrc'));
  writeFileSync(join(home, '.personal-config'), 'untouched');
  expect(deploy().exitCode).toBe(0);
  const inode = lstatSync(join(home, '.zshrc')).ino;
  const result = deploy();
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(lstatSync(join(home, '.zshrc')).ino).toBe(inode);
  expect(readFileSync(join(home, '.personal-config'), 'utf8')).toBe('untouched');
});

function runtime(args: string[], cwd = repo, extra: Record<string, string> = {}) {
  return Bun.spawnSync([nativeMise!, '-C', cwd, ...args], {
    cwd: root,
    env: {
      HOME: home, PATH: `${dirname(nativeMise!)}:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
      MISE_CONFIG_DIR: join(home, '.config/mise'),
      MISE_DATA_DIR: process.env.MISE_DATA_DIR!, MISE_CACHE_DIR: process.env.MISE_CACHE_DIR!,
      MISE_STATE_DIR: join(root, 'state'), CI: '1', ...extra,
    },
    stdout: 'pipe', stderr: 'pipe', timeout: 120000,
  });
}

test.skipIf(!nativeMise)('managed runtime defaults ignore legacy asdf languages and select actual mise executables', () => {
  rmSync(join(home, '.zshrc'));
  expect(deploy().exitCode).toBe(0);
  writeFileSync(join(home, '.tool-versions'), 'java adoptopenjdk-21.0.4+7.0.LTS\nkotlin 1.9.25\npython 3.9.19\n');
  const install = runtime(['run', 'runtimes']);
  expect(install.exitCode, install.stderr.toString()).toBe(0);
  for (const tool of ['node', 'bun']) {
    const result = runtime(['exec', '--', tool, '-p', 'process.execPath'], home);
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    expect(result.stdout.toString().trim()).toStartWith(join(process.env.MISE_DATA_DIR!, 'installs', tool) + '/');
  }
}, 130000);

for (const major of ['16', '18']) {
  test.skipIf(!nativeMise)(`legacy .nvmrc ${major} selects a mise-owned Node without silently upgrading the project`, () => {
    rmSync(join(home, '.zshrc'));
    expect(deploy().exitCode).toBe(0);
    const project = join(home, 'projects', `node-${major}`);
    mkdirSync(project, { recursive: true });
    writeFileSync(join(project, '.nvmrc'), major + '\n');
    const install = runtime(['install'], project);
    expect(install.exitCode, install.stderr.toString()).toBe(0);
    const result = runtime(['exec', '--', 'node', '-p', 'JSON.stringify({version:process.version,path:process.execPath})'], project);
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    const actual = JSON.parse(result.stdout.toString());
    expect(actual.version).toStartWith(`v${major}.`);
    expect(actual.path).toStartWith(join(process.env.MISE_DATA_DIR!, 'installs/node') + '/');
    expect(readFileSync(join(project, '.nvmrc'), 'utf8')).toBe(major + '\n');
  }, 130000);
}

test.skipIf(!nativeMise)('legacy asdf Node/pnpm project keeps its exact versions under mise', () => {
  rmSync(join(home, '.zshrc'));
  expect(deploy().exitCode).toBe(0);
  const project = join(home, 'projects', 'legacy-asdf');
  mkdirSync(project, { recursive: true });
  const versions = 'nodejs 18.14.2\npnpm 7.27.1\n';
  writeFileSync(join(project, '.tool-versions'), versions);
  writeFileSync(join(project, '.nvmrc'), '18\n');
  const install = runtime(['install'], project);
  expect(install.exitCode, install.stderr.toString()).toBe(0);
  const node = runtime(['exec', '--', 'node', '-p', 'JSON.stringify({version:process.version,path:process.execPath})'], project);
  expect(node.exitCode, node.stderr.toString()).toBe(0);
  const actual = JSON.parse(node.stdout.toString());
  expect(actual.version).toBe('v18.14.2');
  expect(actual.path).toStartWith(join(process.env.MISE_DATA_DIR!, 'installs/node') + '/');
  const pnpm = runtime(['exec', '--', 'pnpm', '--version'], project);
  expect(pnpm.exitCode, pnpm.stderr.toString()).toBe(0);
  expect(pnpm.stdout.toString().trim()).toBe('7.27.1');
  const executable = runtime(['exec', '--', '/bin/sh', '-c', 'command -v pnpm'], project);
  expect(executable.exitCode).toBe(0);
  expect(executable.stdout.toString().trim()).toStartWith(join(process.env.MISE_DATA_DIR!, 'installs/pnpm') + '/');
  expect(readFileSync(join(project, '.tool-versions'), 'utf8')).toBe(versions);
  expect(readFileSync(join(project, '.nvmrc'), 'utf8')).toBe('18\n');
}, 130000);

test.skipIf(!nativeMise)('runtime setup fails rather than using existing PATH runtimes without our lockfile', () => {
  rmSync(join(home, '.zshrc'));
  expect(deploy().exitCode).toBe(0);
  rmSync(join(repo, 'mise/mise.lock'));
  const result = runtime(['run', 'runtimes']);
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain('script/setup first');
});

test.skipIf(!nativeMise)('an incomplete runtime lockfile fails strict preflight even with matching tools already installed', () => {
  rmSync(join(home, '.zshrc'));
  expect(deploy().exitCode).toBe(0);
  writeFileSync(join(repo, 'mise/mise.lock'), 'lockfile_version = 3\n');
  const result = runtime(['run', 'runtimes']);
  expect(result.exitCode).not.toBe(0);
});

test.skipIf(!nativeMise)('explicit cloud restore propagates failure rather than running in default setup', () => {
  rmSync(join(home, '.zshrc'));
  expect(deploy().exitCode).toBe(0);
  writeFileSync(join(root, 'bin/mackup'), '#!/bin/sh\n[ "$*" = restore ] || exit 90\necho "cloud restore refused by fixture" >&2\nexit 7\n', { mode: 0o755 });
  const result = runtime(['run', 'restore-settings'], repo, { PATH: `${root}/bin:${dirname(nativeMise!)}:/usr/bin:/bin` });
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain('cloud restore refused by fixture');
});

test.skipIf(!nativeMise)('an existing real mise config is preserved and blocks deployment before other links', () => {
  rmSync(join(home, '.zshrc'));
  const config = join(home, '.config/mise/config.toml');
  mkdirSync(dirname(config), { recursive: true });
  const content = '[env]\nPERSONAL_SETTING = "keep"\n';
  writeFileSync(config, content);
  expect(deploy().exitCode).not.toBe(0);
  expect(readFileSync(config, 'utf8')).toBe(content);
  expect(existsSync(join(home, '.zshrc'))).toBe(false);
});

test.skipIf(!nativeMise)('self-configuration reload does not apply retired declarations from an old global config link', () => {
  rmSync(join(home, '.zshrc'));
  const config = join(home, '.config/mise/config.toml');
  const oldConfig = join(root, 'old-mise.toml');
  const personal = join(home, 'personal-data');
  mkdirSync(dirname(config), { recursive: true });
  writeFileSync(personal, 'keep');
  writeFileSync(oldConfig, `[dotfiles."${personal}"]\nmode = "absent"\n`);
  symlinkSync(oldConfig, config);
  const result = deploy();
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(readFileSync(personal, 'utf8')).toBe('keep');
  expect(readlinkSync(config)).toBe(join(repo, 'mise/config.toml'));
  expect(readFileSync(oldConfig, 'utf8')).toContain('mode = "absent"');
});

test.skipIf(!nativeMise)('native deployment honours a custom mise config directory', () => {
  rmSync(join(home, '.zshrc'));
  const configDir = join(root, 'custom config');
  const result = deploy([], { MISE_CONFIG_DIR: configDir });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(readlinkSync(join(configDir, 'config.toml'))).toBe(join(repo, 'mise/config.toml'));
  expect(readlinkSync(join(configDir, 'mise.lock'))).toBe(join(repo, 'mise/mise.lock'));
});

test('deployment preview preserves existing user configuration and delegates a native dry run', () => {
  const result = run(['--dry-run']);
  expect(result.exitCode).toBe(0);
  expect(readFileSync(join(home, '.zshrc'), 'utf8')).toBe('existing user configuration\n');
  expect(readFileSync(join(root, 'trace'), 'utf8')).toContain('dot apply --dry-run');
});
