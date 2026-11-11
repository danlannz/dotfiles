import { afterEach, beforeEach, expect, test } from 'bun:test';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
  if builtin [ "$1" = '-f' ] && builtin [ "$2" = '/Library/Developer/CommandLineTools/usr/bin/git' ]; then builtin [ "$CLT_PRESENT" = 1 ] || builtin [ -f "$CLT_MARKER" ]; return; fi
  if builtin [ "$1" = '-x' ] && { builtin [ "$2" = '/opt/homebrew/bin/brew' ] || builtin [ "$2" = '/usr/local/bin/brew' ]; }; then
    builtin [ "$EXISTING_BREW" = "$2" ] || builtin [ -f "$BREW_MARKER" ]; return
  fi
  if builtin [ "$1" = '-d' ] && { builtin [ "$2" = '/opt/homebrew' ] || builtin [ "$2" = '/usr/local' ] || builtin [ "$2" = '/usr/local/Homebrew' ]; }; then return 0; fi
  builtin [ "$@"
}
function uname() { printf '%s\n' "$FAKE_ARCH"; }
function groups() { printf 'staff admin\n'; }
function sudo() {
  printf 'bootstrap interpreter=%s\nsudo %s\n' "$BASH" "$*" >> "$TRACE"
  # Native macOS sudo rejects -n combined with standalone -k; -k itself never prompts.
  if builtin [ "$*" = '--non-interactive --reset-timestamp' ]; then return 2; fi
  case " $* " in
    *' --reset-timestamp '*) builtin [ "$SUDO_RESET_STATUS" = 0 ] || return "$SUDO_RESET_STATUS"; /bin/rm -f "$AUTH_MARKER" ;;
    *' /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on '*) return "$FIREWALL_APPLY_STATUS" ;;
    *' softwareupdate --install --all '*) return "$UPDATE_INSTALL_STATUS" ;;
    *' softwareupdate -i '*) touch "$CLT_MARKER" ;;
    *' --validate '*)
      if builtin [ "$AUTH_MODEL" = 1 ]; then
        case " $* " in
          *' --non-interactive '*)
            builtin [ -f "$AUTH_MARKER" ] || return 9
            if builtin [ -f "$HOLD_MARKER" ]; then
              builtin [ "$AUTH_FAIL_DURING_HOLD" != 1 ] || return 9
              printf 'refreshed during work\n' >> "$TRACE"; touch "$REFRESH_MARKER"
            fi ;;
          *)
            stty -echo
            printf 'NATIVE_SUDO_PROMPT\n'
            read -r password
            stty echo
            builtin [ "$password" = fixture-password ] || return 9
            unset password; touch "$AUTH_MARKER" ;;
        esac
      fi
      return "$SUDO_VALIDATE_STATUS" ;;
  esac
}
function sleep() { if builtin [ "$FAST_CLOCK" = 1 ]; then /bin/sleep 0.05; else /bin/sleep "$@"; fi; }
function defaults() { printf 'defaults %s\n' "$*" >> "$TRACE"; }
function caffeinate() { :; }
function fdesetup() { printf 'fdesetup %s\n' "$*" >> "$TRACE"; printf '%s\n' "$FILEVAULT_STATUS"; return "$FILEVAULT_EXIT"; }
function socketfilterfw() { printf 'firewall %s\n' "$*" >> "$TRACE"; printf '%s\n' "$FIREWALL_STATUS"; return "$FIREWALL_EXIT"; }
function chown() { printf 'chown %s\n' "$*" >> "$TRACE"; }
function mkdir() { printf 'mkdir %s\n' "$*" >> "$TRACE"; }
function ln() { printf 'ln %s\n' "$*" >> "$TRACE"; }
function git() {
  printf 'git %s\n' "$*" >> "$TRACE"
  if builtin [ "$1" = credential-osxkeychain ] && builtin [ "$GIT_CREDENTIAL_MODEL" = 1 ]; then
    if builtin [ "$#" = 1 ]; then printf 'git credential-osxkeychain usage\n'; else /bin/cat >/dev/null; fi
    return 0
  fi
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
function softwareupdate() { printf 'softwareupdate %s\n' "$*" >> "$TRACE"; printf '%s\n' "$UPDATE_STATUS"; return "$UPDATE_EXIT"; }
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
      if builtin [ "$HOLD_UPDATE" = 1 ]; then
        touch "$HOLD_MARKER"
        while ! builtin [ -f "$RELEASE_MARKER" ]; do /bin/sleep 0.05; done
      fi
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
export -f '[' uname groups sudo sleep defaults caffeinate fdesetup socketfilterfw chown mkdir ln git curl brew softwareupdate command mise
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

// Deliberately do not inherit host credentials, Git configuration, or shell setup.
function environment(overrides: Record<string, string> = {}, entrypoint = 'bash') {
  return {
      HOME: join(directory, 'home'), USER: 'fixture', PATH: `${directory}/bin:/usr/bin:/bin:/usr/sbin:/sbin`, ENTRYPOINT: entrypoint,
      CI: '1', CLT_PRESENT: '1', CLT_MARKER: join(directory, 'clt-installed'), GIT_CREDENTIAL_MODEL: '0', FILEVAULT_STATUS: 'FileVault is On.', FILEVAULT_EXIT: '0', FIREWALL_STATUS: 'Firewall is enabled. (State = 1)', FIREWALL_EXIT: '0', FIREWALL_APPLY_STATUS: '0', UPDATE_INSTALL_STATUS: '0', UPDATE_STATUS: 'No new software available.', UPDATE_EXIT: '0', SUDO_VALIDATE_STATUS: '0', SUDO_RESET_STATUS: '0', AUTH_MODEL: '0', FAST_CLOCK: '0', HOLD_UPDATE: '0', AUTH_FAIL_DURING_HOLD: '0',
      AUTH_MARKER: join(directory, 'authorized'), HOLD_MARKER: join(directory, 'held'), RELEASE_MARKER: join(directory, 'release'), REFRESH_MARKER: join(directory, 'refreshed'), TMPDIR: join(directory, 'tmp'), TRACE: join(directory, 'trace'),
      BOOTSTRAP_SCRIPT: bootstrap, DOCUMENTED_BOOTSTRAP: documentedCommand, FAKE_ARCH: 'arm64', EXISTING_BREW: '', HOMEBREW_PREFIX: '',
      HAVE_MISE: '1', MISE_INSTALL_STATUS: '0', MISE_NO_BINARY: '0', MISE_MARKER: join(directory, 'mise-installed'),
      DOWNLOAD_STATUS: '0', INSTALL_STATUS: '0', BREW_MARKER: join(directory, 'native-brew-installed'), STOP_AT_UPDATE: '1', CONTINUE_TO_BUNDLE: '0', APP_STORE_CHECK_STATUS: '0', APP_STORE_INSTALL_STATUS: '0', ...overrides,
  };
}
function run(overrides: Record<string, string> = {}, args: string[] = [], entrypoint = 'bash') {
  const result = Bun.spawnSync(['/bin/bash', '-c', boundaries, 'fixture', ...args], {
    cwd: directory, env: environment(overrides, entrypoint), stdout: 'pipe', stderr: 'pipe',
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

test('lost initial sudo authorization fails before privileged work or package installation', () => {
  const result = run({ EXISTING_BREW: '/opt/homebrew/bin/brew', SUDO_VALIDATE_STATUS: '9' });
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain('sudo authorization');
  expect(result.trace).not.toContain('sudo defaults');
  expect(result.trace).not.toContain('brew ');
  expect(result.stdout.toString()).not.toContain("You're good to go");
});

for (const expire of [false, true, 'interrupt']) {
  test(`one native sudo prompt sustains work and cleanup revokes authorization (expire=${expire})`, async () => {
    let output = '';
    let prompts = 0;
    const child = Bun.spawn(['/bin/bash', '-c', boundaries, 'fixture'], {
      cwd: directory, env: environment({ EXISTING_BREW: '/opt/homebrew/bin/brew', AUTH_MODEL: '1', FAST_CLOCK: '1', HOLD_UPDATE: '1', AUTH_FAIL_DURING_HOLD: expire === true ? '1' : '0' }),
      terminal: { cols: 100, rows: 25, data(terminal, bytes) {
        output += Buffer.from(bytes).toString();
        if (prompts === 0 && output.includes('NATIVE_SUDO_PROMPT')) { prompts++; terminal.write('fixture-password\n'); }
      } },
    });
    const deadline = setTimeout(() => child.kill(), 8000);
    try {
      if (expire !== true) {
        const until = Date.now() + 5000;
        while (!existsSync(join(directory, 'refreshed')) && Date.now() < until) await Bun.sleep(20);
        expect(existsSync(join(directory, 'refreshed')), output).toBe(true);
        if (expire === 'interrupt') child.kill();
        else writeFileSync(join(directory, 'release'), 'continue\n');
      }
      const status = await child.exited;
      expect(prompts).toBe(1);
      expect(output).not.toContain('fixture-password');
      expect(existsSync(join(directory, 'authorized'))).toBe(false);
      if (expire === true) {
        expect(status).not.toBe(0);
        expect(output).toContain('Lost sudo authorization');
        expect(output).not.toContain("You're good to go");
      } else expect(status, output).toBe(expire === 'interrupt' ? 143 : 77);
      expect(readFileSync(join(directory, 'trace'), 'utf8')).not.toContain('--stdin');
    } finally { clearTimeout(deadline); child.kill(); await child.exited; child.terminal!.close(); }
  }, 10000);
}

test('an external askpass helper and directory are never removed or rewritten', () => {
  const helper = join(directory, 'external-helper'); const ownedElsewhere = join(directory, 'external-directory');
  writeFileSync(helper, 'user-owned helper\n'); mkdirSync(ownedElsewhere); writeFileSync(join(ownedElsewhere, 'keep'), 'keep\n');
  const result = run({ EXISTING_BREW: '/opt/homebrew/bin/brew', SUDO_ASKPASS: helper, SUDO_ASKPASS_DIR: ownedElsewhere, CLT_PLACEHOLDER: helper });
  expect(result.exitCode).toBe(77);
  expect(readFileSync(helper, 'utf8')).toBe('user-owned helper\n');
  expect(readFileSync(join(ownedElsewhere, 'keep'), 'utf8')).toBe('keep\n');
  expect(result.trace).not.toContain('rm -rf');
});

test('security-check reports disabled FileVault without authorization, writes, recovery output or package work', () => {
  const result = run({ FILEVAULT_STATUS: 'FileVault is Off.' }, ['--security-check']);
  expect(result.exitCode).toBe(2);
  expect(result.stdout.toString()).toContain('FileVault is Off.');
  expect(result.stdout.toString()).toContain('System Settings');
  expect(result.stderr.toString()).not.toContain('Unknown option');
  expect(result.trace).toContain('fdesetup status');
  expect(result.trace).not.toMatch(/sudo |defaults write|brew |fdesetup enable/);
});

for (const scenario of [
  { label: 'healthy', env: {}, status: 0 },
  { label: 'firewall off', env: { FIREWALL_STATUS: 'Firewall is disabled. (State = 0)' }, status: 2 },
  { label: 'encryption pending restart', env: { FILEVAULT_STATUS: 'FileVault is Off, but will be enabled after the next restart.' }, status: 2 },
  { label: 'encryption in progress', env: { FILEVAULT_STATUS: 'Encryption in progress: Percent completed = 50' }, status: 2 },
  { label: 'vault query failure despite healthy-looking stdout', env: { FILEVAULT_EXIT: '9' }, status: 1 },
  { label: 'unknown vault response', env: { FILEVAULT_STATUS: 'Unexpected format' }, status: 1 },
  { label: 'firewall query failure', env: { FIREWALL_EXIT: '9' }, status: 1 },
  { label: 'unknown firewall response', env: { FIREWALL_STATUS: 'Unexpected format' }, status: 1 },
]) {
  test(`read-only security result distinguishes ${scenario.label}`, () => {
    const result = run(scenario.env as Record<string, string>, ['--security-check']);
    expect(result.exitCode, result.stderr.toString()).toBe(scenario.status);
    expect(result.trace).not.toMatch(/sudo |defaults write|brew |fdesetup enable/);
  });
}

test('a legacy recovery-key file is reported without disclosure, replacement or permission changes', () => {
  mkdirSync(join(directory, 'home/Desktop'));
  const path = join(directory, 'home/Desktop/FileVault Recovery Key.txt');
  const content = 'SYNTHETIC_RECOVERY_MATERIAL_NEVER_LOG';
  writeFileSync(path, content, { mode: 0o644 });
  const result = run({}, ['--security-check', '--debug']);
  expect(result.exitCode).toBe(2);
  expect(result.stdout.toString()).toContain('Legacy recovery-key file exists');
  expect(result.stdout.toString() + result.stderr.toString() + result.trace).not.toContain(content);
  expect(readFileSync(path, 'utf8')).toBe(content);
  expect(statSync(path).mode & 0o777).toBe(0o644);
});

for (const args of [['--security-apply'], ['--macos-updates'], ['--security-check', '--app-store'], ['--security-check', '--security-apply']]) {
  test(`unsafe action combination/CI request ${args.join(' ')} is rejected before authorization`, () => {
    const result = run({}, args);
    expect(result.exitCode).toBe(2);
    expect(result.trace).toBe('');
  });
}

test('security changes require their standalone explicit mode and propagate setter failure', () => {
  const result = run({ CI: '' }, ['--security-apply']);
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(result.trace).toContain('sudo --non-interactive /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on');
  expect(result.trace).not.toMatch(/brew |fdesetup enable|defaults write|launchctl load/);
  const failed = run({ CI: '', FIREWALL_APPLY_STATUS: '9' }, ['--security-apply']);
  expect(failed.exitCode).toBe(9);
  expect(failed.stdout.toString()).not.toContain('Development setup complete');
});

test('macOS update installation is explicit, does not request restart, and reports installation failure', () => {
  const result = run({ CI: '', UPDATE_STATUS: '* Label: Fixture-OS-Update' }, ['--macos-updates']);
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(result.trace).toContain('sudo --non-interactive softwareupdate --install --all');
  expect(result.trace).not.toMatch(/--restart|--force|brew |fdesetup enable/);
  expect(run({ CI: '', UPDATE_INSTALL_STATUS: '9' }, ['--macos-updates']).exitCode).toBe(9);
});

test('failed CLT discovery cannot issue an empty or broad software-update install', () => {
  const result = run({ CLT_PRESENT: '0', UPDATE_EXIT: '9' });
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain('Command Line Tools discovery failed');
  expect(result.trace).not.toContain('softwareupdate -i');
  expect(result.trace).not.toContain('softwareupdate --install');
});

test('CLT install is limited to a discovered compatible label, never an empty update selection', () => {
  const none = run({ CLT_PRESENT: '0', UPDATE_STATUS: 'No new software available.' });
  expect(none.exitCode).toBe(1);
  expect(none.trace).not.toContain('softwareupdate -i');
  const available = run({ CLT_PRESENT: '0', UPDATE_STATUS: '* Label: Command Line Tools for Xcode-16.4\n  Title: Command Line Tools for Xcode, Version: 16.4' });
  expect(available.exitCode, available.stderr.toString()).toBe(77);
  expect(available.trace).toContain('sudo --non-interactive softwareupdate -i Command Line Tools for Xcode-16.4');
  expect(available.trace).not.toContain('softwareupdate --install --all');
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

test('default provisioning reports manual security attention without changing preferences or enabling encryption', () => {
  const result = run({ ...completeProvisioning, CI: '', FILEVAULT_STATUS: 'FileVault is Off.' });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(result.trace).not.toMatch(/defaults write|fdesetup enable|launchctl load/);
  expect(result.stdout.toString()).toContain('manual security');
  expect(result.stdout.toString()).toContain('Development setup complete');
  expect(existsSync(join(directory, 'home/Desktop/FileVault Recovery Key.txt'))).toBe(false);
});

test('failure to invalidate sudo authorization is visible and cannot exit successfully', () => {
  const result = run({ ...completeProvisioning, SUDO_RESET_STATUS: '9' });
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain('Could not invalidate sudo authorization');
});

test('native task declarations preserve standalone checks and interactive explicit actions', () => {
  const config = Bun.TOML.parse(readFileSync(new URL('../mise.toml', import.meta.url), 'utf8')) as any;
  expect(config.tasks['security-check'].run).toContain('--security-check');
  expect(config.tasks['security-check'].depends).toBeUndefined();
  for (const [task, flag] of [['security-apply', '--security-apply'], ['macos-updates', '--macos-updates']]) {
    expect(config.tasks[task].raw).toBe(true);
    expect(config.tasks[task].run).toContain(flag);
  }
  expect(JSON.stringify(config.tasks.verify)).not.toMatch(/security-apply|macos-updates/);
});

test('debug mode does not print an optional caller-provided GitHub credential', () => {
  const secret = 'SYNTHETIC_GITHUB_TOKEN_NEVER_LOG';
  const result = run({ ...completeProvisioning, GIT_CREDENTIAL_MODEL: '1', GITHUB_TOKEN: secret }, ['--debug']);
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString() + result.stderr.toString() + result.trace).not.toContain(secret);
});

test('default bootstrap lists macOS updates but never installs them implicitly', () => {
  const result = run({ ...completeProvisioning, CI: '', UPDATE_STATUS: 'Software Update found updates:\n* Label: Fixture-OS-Update' });
  expect(result.exitCode).toBe(0);
  expect(result.trace).toContain('softwareupdate --list');
  expect(result.trace).not.toContain('softwareupdate --install');
  expect(result.stdout.toString()).toContain('macOS updates deferred');
});

test('failed status queries never become installation or overall-success decisions', () => {
  for (const extra of [{ FILEVAULT_EXIT: '9' }, { UPDATE_EXIT: '9' }, { UPDATE_STATUS: '' }]) {
    const result = run({ ...completeProvisioning, ...extra });
    expect(result.exitCode).toBe(1);
    expect(result.trace).not.toContain('softwareupdate --install');
    expect(result.stdout.toString()).not.toContain('Development setup complete');
  }
  expect(run({ CI: '', FIREWALL_STATUS: 'Firewall is disabled. (State = 0)' }, ['--security-apply']).exitCode).toBe(2);
});

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
