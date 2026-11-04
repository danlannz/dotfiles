import { afterEach, beforeEach, expect, test } from 'bun:test';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

let directory: string;
const bootstrap = fileURLToPath(new URL('../bootstrap.sh', import.meta.url));

// Run the real public bootstrap command. Only OS/package/network boundaries are
// replaced; no sudo, package manager, installer, or Git mutation can reach the host.
const boundaries = String.raw`
function [() {
  if builtin [ "$1" = '-f' ] && builtin [ "$2" = '/Library/Developer/CommandLineTools/usr/bin/git' ]; then return 0; fi
  if builtin [ "$1" = '-x' ] && { builtin [ "$2" = '/opt/homebrew/bin/brew' ] || builtin [ "$2" = '/usr/local/bin/brew' ]; }; then
    builtin [ "$EXISTING_BREW" = "$2" ] || builtin [ -f "$BREW_MARKER" ]; return
  fi
  if builtin [ "$1" = '-d' ] && { builtin [ "$2" = '/opt/homebrew' ] || builtin [ "$2" = '/usr/local' ] || builtin [ "$2" = '/usr/local/Homebrew' ]; }; then return 0; fi
  builtin [ "$@"
}
function uname() { printf '%s\n' "$FAKE_ARCH"; }
function groups() { printf 'staff admin\n'; }
function sudo() { printf 'sudo %s\n' "$*" >> "$TRACE"; }
function defaults() { :; }
function caffeinate() { :; }
function fdesetup() { printf 'FileVault is On.\n'; }
function chown() { printf 'chown %s\n' "$*" >> "$TRACE"; }
function mkdir() { printf 'mkdir %s\n' "$*" >> "$TRACE"; }
function ln() { printf 'ln %s\n' "$*" >> "$TRACE"; }
function git() {
  printf 'git %s\n' "$*" >> "$TRACE"
  if builtin [ "$1" = ls-remote ]; then
    if builtin [ "$CONTINUE_TO_BUNDLE" = 1 ]; then return 1; fi
    printf 'checkpoint after Homebrew provisioning\n' >> "$TRACE"
    exit 78
  fi
}
function softwareupdate() { printf 'No new software available.\n'; }
function curl() {
  printf 'curl %s\n' "$*" >> "$TRACE"
  if builtin [ "$DOWNLOAD_STATUS" != 0 ]; then return "$DOWNLOAD_STATUS"; fi
  local output=''
  while builtin [ "$#" -gt 0 ]; do
    case "$1" in -o|--output) output="$2"; shift ;; esac
    shift
  done
  builtin [ -n "$output" ] || return 2
  printf '#!/bin/bash\nprintf "installer ran\\n" >> "$TRACE"\nif [[ "$INSTALL_STATUS" = 0 && -z "$INSTALL_NO_BINARY" ]]; then touch "$BREW_MARKER"; fi\nexit "$INSTALL_STATUS"\n' > "$output"
}
function brew() {
  printf 'brew %s (prefix=%s)\n' "$*" "$HOMEBREW_PREFIX" >> "$TRACE"
  case "$1" in
    --prefix) builtin [ -n "$EXISTING_BREW" ] && printf '%s\n' "$(dirname "$(dirname "$EXISTING_BREW")")" ;;
    --repository) return 1 ;;
    update)
      printf 'checkpoint prefix=%s path=%s\n' "$HOMEBREW_PREFIX" "$PATH" >> "$TRACE"
      if builtin [ "$STOP_AT_UPDATE" = 1 ]; then exit 77; fi ;;
    bundle)
      if builtin [ "$CONTINUE_TO_BUNDLE" = 1 ]; then
        if builtin [ "$3" = --file ]; then
          if builtin [ "$2" = check ]; then return "$APP_STORE_CHECK_STATUS"; fi
          return "$APP_STORE_INSTALL_STATUS"
        fi
        return 0
      fi
      printf 'unexpected inline tap bundle\n' >> "$TRACE"
      return 1 ;;
  esac
}
export -f '[' uname groups sudo defaults caffeinate fdesetup chown mkdir ln git curl brew softwareupdate
exec /bin/bash "$BOOTSTRAP_SCRIPT" "$@"
`;

beforeEach(() => {
  directory = realpathSync(mkdtempSync(join(tmpdir(), 'dotfiles-bootstrap-test-')));
  mkdirSync(join(directory, 'home'));
  mkdirSync(join(directory, 'tmp'));
  const fixtureRepo = join(directory, 'home/.dotfiles');
  mkdirSync(join(fixtureRepo, 'script'), { recursive: true });
  copyFileSync(fileURLToPath(new URL('../script/setup-app-store', import.meta.url)), join(fixtureRepo, 'script/setup-app-store'));
  copyFileSync(fileURLToPath(new URL('../Brewfile.app-store', import.meta.url)), join(fixtureRepo, 'Brewfile.app-store'));
  writeFileSync(join(directory, 'home/.Brewfile'), '# Fixture: package operations are stubbed.\n');
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

function run(overrides: Record<string, string> = {}, args: string[] = []) {
  const result = Bun.spawnSync(['/bin/bash', '-c', boundaries, 'fixture', ...args], {
    cwd: directory,
    // Deliberately do not inherit host credentials, Git configuration, or shell setup.
    env: {
      HOME: join(directory, 'home'), USER: 'fixture', PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
      CI: '1', TMPDIR: join(directory, 'tmp'), TRACE: join(directory, 'trace'),
      BOOTSTRAP_SCRIPT: bootstrap, FAKE_ARCH: 'arm64', EXISTING_BREW: '', HOMEBREW_PREFIX: '',
      DOWNLOAD_STATUS: '0', INSTALL_STATUS: '0', BREW_MARKER: join(directory, 'native-brew-installed'), STOP_AT_UPDATE: '1', CONTINUE_TO_BUNDLE: '0', APP_STORE_CHECK_STATUS: '0', APP_STORE_INSTALL_STATUS: '0', ...overrides,
    },
    stdout: 'pipe', stderr: 'pipe',
  });
  const trace = existsSync(join(directory, 'trace')) ? readFileSync(join(directory, 'trace'), 'utf8') : '';
  return { ...result, trace };
}

test('fresh Apple Silicon setup installs native Homebrew before updating it', () => {
  const result = run();
  expect(result.exitCode).toBe(77); // The harmless update checkpoint was reached.
  expect(result.trace).toContain('checkpoint prefix=/opt/homebrew path=/opt/homebrew/bin:');
  expect(result.trace).toContain('https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh');
  expect(result.trace).toContain('installer ran');
});

test('an existing native ARM installation is updated without reinstalling or resetting it', () => {
  const result = run({ EXISTING_BREW: '/opt/homebrew/bin/brew' });
  expect(result.exitCode).toBe(77);
  expect(result.trace).toContain('checkpoint prefix=/opt/homebrew path=/opt/homebrew/bin:');
  expect(result.trace).not.toContain('installer ran');
  expect(result.trace).not.toContain('curl ');
  expect(result.trace).not.toContain('git init');
  expect(result.trace).not.toContain('git reset');
  expect(result.trace).not.toContain('chown ');
});

test('an Intel brew already in PATH cannot select the prefix on an ARM Mac', () => {
  const result = run({ EXISTING_BREW: '/usr/local/bin/brew' });
  expect(result.exitCode).toBe(77);
  expect(result.trace).toContain('checkpoint prefix=/opt/homebrew path=/opt/homebrew/bin:');
  expect(result.trace).toContain('installer ran');
});

test('an existing Intel installation retains its native prefix', () => {
  const result = run({ FAKE_ARCH: 'x86_64', EXISTING_BREW: '/usr/local/bin/brew' });
  expect(result.exitCode).toBe(77);
  expect(result.trace).toContain('checkpoint prefix=/usr/local path=/usr/local/bin:');
  expect(result.trace).not.toContain('installer ran');
});

test('failed installer download stops before executing an installer or updating brew', () => {
  const result = run({ DOWNLOAD_STATUS: '22' });
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain('Could not download the official Homebrew installer.');
  expect(result.trace).not.toContain('installer ran');
  expect(result.trace).not.toContain('checkpoint');
});

test('failed official installer stops bootstrap before brew update', () => {
  const result = run({ INSTALL_STATUS: '9' });
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain('The official Homebrew installer failed.');
  expect(result.trace).toContain('installer ran');
  expect(result.trace).not.toContain('checkpoint');
});

test('an installer that exits zero without a native brew binary is not treated as success', () => {
  const result = run({ INSTALL_NO_BINARY: '1' });
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain('Homebrew installer did not provide /opt/homebrew/bin/brew.');
  expect(result.trace).not.toContain('checkpoint');
});

test('an unrelated inherited installer variable is never passed to privileged cleanup', () => {
  const result = run({ EXISTING_BREW: '/opt/homebrew/bin/brew', HOMEBREW_INSTALLER: '/tmp/unrelated-installer' });
  expect(result.exitCode).toBe(77);
  expect(result.trace).not.toContain('/tmp/unrelated-installer');
});

test('Homebrew provisioning reaches the next stage without tapping built-in or retired repositories', () => {
  const result = run({ STOP_AT_UPDATE: '0', EXISTING_BREW: '/opt/homebrew/bin/brew' });
  expect(result.exitCode).toBe(78);
  expect(result.trace).toContain('checkpoint after Homebrew provisioning');
  expect(result.trace).not.toContain('unexpected inline tap bundle');
});

const completeProvisioning = { STOP_AT_UPDATE: '0', CONTINUE_TO_BUNDLE: '1', EXISTING_BREW: '/opt/homebrew/bin/brew' };

test('default bootstrap completes without an App Store login and explains how to resume', () => {
  const result = run(completeProvisioning);
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toContain('App Store apps deferred');
  expect(result.stdout.toString()).toContain('script/setup-app-store');
  expect(result.trace).not.toContain('Brewfile.app-store');
});

test('initial setup can explicitly include App Store apps alongside debug mode', () => {
  const result = run(completeProvisioning, ['--app-store', '--debug']);
  expect(result.exitCode).toBe(0);
  expect(result.trace).toContain('Brewfile.app-store --no-upgrade');
  expect(result.stdout.toString()).not.toContain('App Store apps deferred');
});

test('an explicitly requested App Store failure is reported rather than claiming success', () => {
  const result = run({ ...completeProvisioning, APP_STORE_CHECK_STATUS: '1', APP_STORE_INSTALL_STATUS: '9' }, ['--app-store']);
  expect(result.exitCode).toBe(9);
  expect(result.stdout.toString()).not.toContain("You're good to go");
});

test('unknown bootstrap options fail before privileged or package commands', () => {
  const result = run({}, ['--unknown']);
  expect(result.exitCode).toBe(2);
  expect(result.trace).toBe('');
});

test('unsupported architectures do not download or run a Homebrew installer', () => {
  const result = run({ FAKE_ARCH: 'riscv64' });
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain('Unsupported architecture for Homebrew: riscv64');
  expect(result.trace).not.toContain('curl ');
  expect(result.trace).not.toContain('checkpoint');
});
