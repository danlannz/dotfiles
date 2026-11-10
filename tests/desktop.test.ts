import { afterEach, beforeEach, expect, test } from 'bun:test';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('..', import.meta.url));
let root: string;
let repo: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'optional desktop ')); repo = join(root, 'repo with spaces');
  mkdirSync(join(repo, 'script'), { recursive: true }); mkdirSync(join(root, 'bin')); mkdirSync(join(root, 'home'));
  for (const path of ['script/setup-desktop', 'Brewfile.desktop']) if (existsSync(join(source, path))) copyFileSync(join(source, path), join(repo, path));
  writeFileSync(join(root, 'bin/uname'), '#!/bin/sh\nprintf "%s\\n" "${FAKE_OS:-Darwin}"\n', { mode: 0o755 });
  writeFileSync(join(root, 'bin/brew'), `#!/bin/bash
printf '%s\\n' "$*" >> "$TRACE"
[ "$HOMEBREW_NO_AUTO_UPDATE:$HOMEBREW_NO_INSTALL_CLEANUP:\${HOMEBREW_BUNDLE_BREW_SKIP-}" = '1:1:' ] || exit 98
case "$1 $2" in
  'bundle check') test -f "$RECEIPT" ;;
  'bundle install') test "$INSTALL_STATUS" = 0 || exit "$INSTALL_STATUS"; [ "\${NO_RECEIPT:-0}" = 1 ] || touch "$RECEIPT" ;;
  *) exit 99 ;;
esac
`, { mode: 0o755 });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
function run(extra: Record<string, string> = {}, args: string[] = []) {
  const result = Bun.spawnSync(['/bin/bash', join(repo, 'script/setup-desktop'), ...args], { cwd: root,
    env: { HOME: join(root, 'home'), PATH: `${root}/bin:/usr/bin:/bin`, TRACE: join(root, 'trace'), RECEIPT: join(root, 'receipt'), INSTALL_STATUS: '0', ...extra }, stdout: 'pipe', stderr: 'pipe' });
  return { ...result, trace: existsSync(join(root, 'trace')) ? readFileSync(join(root, 'trace'), 'utf8') : '' };
}

test('desktop installs only its optional manifest without upgrades, then becomes a no-op', () => {
  const first = run();
  expect(first.exitCode, first.stderr.toString()).toBe(0);
  expect(first.trace).toContain(`bundle install --file ${repo}/Brewfile.desktop --no-upgrade`);
  rmSync(join(root, 'trace'));
  const repeat = run();
  expect(repeat.exitCode, repeat.stderr.toString()).toBe(0);
  expect(repeat.trace).not.toContain('bundle install');
  expect(repeat.stdout.toString()).toContain('already installed');
});

test('desktop propagates installation failures and rejects false-success/skipped installation', () => {
  expect(run({ INSTALL_STATUS: '9' }).exitCode).toBe(9);
  expect(run({ NO_RECEIPT: '1' }).exitCode).not.toBe(0);
  expect(run({ HOMEBREW_BUNDLE_BREW_SKIP: 'asmvik/formulae/yabai asmvik/formulae/skhd' }).exitCode).toBe(0);
});

test('desktop preserves existing configuration and service files and never calls activation commands', () => {
  const files = ['.yabairc', '.skhdrc', 'Library/LaunchAgents/custom.desktop.plist'];
  mkdirSync(join(root, 'home/Library/LaunchAgents'), { recursive: true });
  for (const file of files) writeFileSync(join(root, 'home', file), `user ${file}\n`);
  const result = run();
  expect(result.exitCode).toBe(0);
  for (const file of files) expect(readFileSync(join(root, 'home', file), 'utf8')).toBe(`user ${file}\n`);
  expect(result.trace.split('\n').filter(Boolean).every(line => line.startsWith('bundle check ') || line.startsWith('bundle install '))).toBe(true);
});

test('desktop rejects unsupported systems, missing Homebrew and unexpected arguments before package work', () => {
  expect(run({ FAKE_OS: 'Linux' }).exitCode).toBe(1);
  expect(run({ PATH: '/usr/bin:/bin' }).stderr.toString()).toContain('Homebrew is required');
  expect(run({}, ['--unexpected']).exitCode).toBe(2);
  expect(existsSync(join(root, 'trace'))).toBe(false);
});

test('native task/manifest expose only opt-in desktop packages with scoped trust and service actions disabled', () => {
  const config = Bun.TOML.parse(readFileSync(join(source, 'mise.toml'), 'utf8')) as any;
  expect(config.tasks.desktop.run).toContain('script/setup-desktop');
  const declarations = Bun.spawnSync(['/usr/bin/ruby', '-rjson', '-e', `
    def brew(name, options = {}); puts JSON.generate([name, options]); end
    load ARGV.fetch(0)
  `, join(source, 'Brewfile.desktop')], { stdout: 'pipe', stderr: 'pipe' });
  expect(declarations.exitCode, declarations.stderr.toString()).toBe(0);
  expect(declarations.stdout.toString().trim().split('\n').map(line => JSON.parse(line))).toEqual([
    ['asmvik/formulae/yabai', { trusted: true, start_service: false, restart_service: false }],
    ['asmvik/formulae/skhd', { trusted: true, start_service: false, restart_service: false }],
  ]);
  for (const path of ['bootstrap.sh', 'script/after-setup', '.Brewfile']) expect(readFileSync(join(source, path), 'utf8')).not.toMatch(/setup-desktop|Brewfile\.desktop|run desktop/);
});
