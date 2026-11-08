import { afterEach, beforeEach, expect, test } from 'bun:test';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

let directory: string;
const bootstrap = fileURLToPath(new URL('../bootstrap.sh', import.meta.url));
const documentedCommand = readFileSync(new URL('../README.md', import.meta.url), 'utf8').match(/```(?:bash|sh)?\n([\s\S]*?)\n```/)![1];

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
function sudo() { printf 'bootstrap interpreter=%s\nsudo %s\n' "$BASH" "$*" >> "$TRACE"; }
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
function command() {
  if builtin [ "$1" = -v ] && builtin [ "$2" = mise ]; then
    builtin [ "$HAVE_MISE" = 1 ] || builtin [ -f "$MISE_MARKER" ]; return
  fi
  builtin command "$@"
}
function mise() { printf 'mise %s\n' "$*" >> "$TRACE"; }
function softwareupdate() { printf 'No new software available.\n'; }
function curl() {
  printf 'curl %s\n' "$*" >> "$TRACE"
  if builtin [ "$DOWNLOAD_STATUS" != 0 ]; then return "$DOWNLOAD_STATUS"; fi
  if builtin [ "$ENTRYPOINT" = documented ]; then /bin/cat "$BOOTSTRAP_SCRIPT"; return; fi
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
    install)
      if builtin [ "$2" = mise ]; then
        builtin [ "$MISE_INSTALL_STATUS" = 0 ] || return "$MISE_INSTALL_STATUS"
        builtin [ "$MISE_NO_BINARY" = 1 ] || touch "$MISE_MARKER"
      fi ;;
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
export -f '[' uname groups sudo defaults caffeinate fdesetup chown mkdir ln git curl brew softwareupdate command mise
if builtin [ "$ENTRYPOINT" = documented ]; then eval "$DOCUMENTED_BOOTSTRAP"; exit; fi
if builtin [ "$ENTRYPOINT" = executable ]; then exec "$BOOTSTRAP_SCRIPT" "$@"; fi
exec /bin/bash "$BOOTSTRAP_SCRIPT" "$@"
`;

beforeEach(() => {
  directory = realpathSync(mkdtempSync(join(tmpdir(), 'dotfiles-bootstrap-test-')));
  mkdirSync(join(directory, 'home'));
  mkdirSync(join(directory, 'tmp'));
  mkdirSync(join(directory, 'bin'));
  // If a non-Bash interpreter drops exported functions, fail closed before
  // any real privileged command can reach the host.
  writeFileSync(join(directory, 'bin/sudo'), '#!/bin/sh\nexit 91\n', { mode: 0o755 });
  const fixtureRepo = join(directory, 'home/.dotfiles');
  mkdirSync(join(fixtureRepo, 'script'), { recursive: true });
  copyFileSync(fileURLToPath(new URL('../script/setup-app-store', import.meta.url)), join(fixtureRepo, 'script/setup-app-store'));
  copyFileSync(fileURLToPath(new URL('../Brewfile.app-store', import.meta.url)), join(fixtureRepo, 'Brewfile.app-store'));
  writeFileSync(join(fixtureRepo, 'script/setup'), '#!/bin/bash\ncommand -v mise >/dev/null || exit 91\nprintf "fixture setup\\n" >> "$TRACE"\nprintf "setup diagnostics\\n" >&2\nexit "${SETUP_STATUS:-0}"\n', { mode: 0o755 });
  writeFileSync(join(directory, 'home/.Brewfile'), '# Fixture: package operations are stubbed.\n');
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

function run(overrides: Record<string, string> = {}, args: string[] = [], entrypoint = 'bash') {
  const result = Bun.spawnSync(['/bin/bash', '-c', boundaries, 'fixture', ...args], {
    cwd: directory,
    // Deliberately do not inherit host credentials, Git configuration, or shell setup.
    env: {
      HOME: join(directory, 'home'), USER: 'fixture', PATH: `${directory}/bin:/usr/bin:/bin:/usr/sbin:/sbin`, ENTRYPOINT: entrypoint,
      CI: '1', TMPDIR: join(directory, 'tmp'), TRACE: join(directory, 'trace'),
      BOOTSTRAP_SCRIPT: bootstrap, DOCUMENTED_BOOTSTRAP: documentedCommand, FAKE_ARCH: 'arm64', EXISTING_BREW: '', HOMEBREW_PREFIX: '',
      HAVE_MISE: '1', MISE_INSTALL_STATUS: '0', MISE_NO_BINARY: '0', MISE_MARKER: join(directory, 'mise-installed'),
      DOWNLOAD_STATUS: '0', INSTALL_STATUS: '0', BREW_MARKER: join(directory, 'native-brew-installed'), STOP_AT_UPDATE: '1', CONTINUE_TO_BUNDLE: '0', APP_STORE_CHECK_STATUS: '0', APP_STORE_INSTALL_STATUS: '0', ...overrides,
    },
    stdout: 'pipe', stderr: 'pipe',
  });
  const trace = existsSync(join(directory, 'trace')) ? readFileSync(join(directory, 'trace'), 'utf8') : '';
  return { ...result, trace };
}

test('the executable entry point selects Bash without an explicit interpreter override', () => {
  const result = run({ EXISTING_BREW: '/opt/homebrew/bin/brew' }, [], 'executable');
  expect(result.exitCode, result.stderr.toString()).toBe(77);
  expect(result.trace).toContain('bootstrap interpreter=/bin/bash');
});

test('the documented download command propagates fetch failure without running an empty installer', () => {
  const result = run({ DOWNLOAD_STATUS: '22' }, [], 'documented');
  expect(result.exitCode, result.stderr.toString()).toBe(22);
  expect(result.trace).toContain('curl ');
  expect(result.trace).not.toContain('sudo ');
});

test('the documented command executes a successful download with Bash', () => {
  const result = run({ EXISTING_BREW: '/opt/homebrew/bin/brew' }, [], 'documented');
  expect(result.exitCode, result.stderr.toString()).toBe(77);
  expect(result.trace).toContain('bootstrap interpreter=/bin/bash');
});

test('flags appended to the documented command reach bootstrap before privileged work', () => {
  const result = run({ DOCUMENTED_BOOTSTRAP: `${documentedCommand} --unknown` }, [], 'documented');
  expect(result.exitCode, result.stderr.toString()).toBe(2);
  expect(result.stderr.toString()).toContain('Unknown option: --unknown');
  expect(result.trace).not.toContain('sudo ');
});

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

test('bootstrap installs missing mise before deploying an existing local checkout, even when GitHub lookup is unavailable', () => {
  const result = run({ ...completeProvisioning, HAVE_MISE: '0' });
  expect(result.exitCode).toBe(0);
  expect(result.trace).toContain('brew install mise');
  expect(result.trace).toContain('fixture setup');
  expect(result.trace.indexOf('brew install mise')).toBeLessThan(result.trace.indexOf('fixture setup'));
  expect(result.trace.indexOf('fixture setup')).toBeLessThan(result.trace.indexOf('brew bundle'));
  expect(result.stderr.toString()).toContain('setup diagnostics');
});

test('an existing mise still goes through the refreshed provider prerequisite before new config is linked', () => {
  const result = run(completeProvisioning);
  expect(result.exitCode).toBe(0);
  expect(result.trace).toContain('brew install mise');
  expect(result.trace.indexOf('brew install mise')).toBeLessThan(result.trace.indexOf('fixture setup'));
});

test('failed mise installation stops before deployment or package bundle', () => {
  const result = run({ ...completeProvisioning, HAVE_MISE: '0', MISE_INSTALL_STATUS: '17' });
  expect(result.exitCode).toBe(17);
  expect(result.trace).not.toContain('fixture setup');
  expect(result.trace).not.toContain('brew bundle');
});

test('a mise installer returning zero without a binary cannot continue', () => {
  const result = run({ ...completeProvisioning, HAVE_MISE: '0', MISE_NO_BINARY: '1' });
  expect(result.exitCode).toBe(1);
  expect(result.trace).not.toContain('fixture setup');
});

test('deployment conflicts remain visible and stop before package installation', () => {
  const result = run({ ...completeProvisioning, SETUP_STATUS: '9' });
  expect(result.exitCode).toBe(9);
  expect(result.stderr.toString()).toContain('setup diagnostics');
  expect(result.trace).not.toContain('brew bundle');
  expect(result.stdout.toString()).not.toContain("You're good to go");
});

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
