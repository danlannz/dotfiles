import { afterEach, beforeEach, expect, test } from 'bun:test';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('..', import.meta.url));
let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'dotfiles shell home '));
  mkdirSync(join(home, 'bin'));
  for (const name of ['.zshrc', '.path', '.functions', '.alias']) copyFileSync(join(source, name), join(home, name));
  // Optional external tools never resolve to the developer's installation.
  command('gpgconf', 'printf "gpgconf\\n" >> "$TRACE"');
  command('thefuck', 'printf "thefuck\\n" >> "$TRACE"\nprintf "fuck() { :; }\\n"');
  command('brew', 'printf "brew\\n" >> "$TRACE"\nexit 99');
  command('mise', '[ "$*" = "activate zsh" ] || exit 99');
});
afterEach(() => rmSync(home, { recursive: true, force: true }));
function command(name: string, body: string) {
  writeFileSync(join(home, 'bin', name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
}
function environment(extra: Record<string, string> = {}) {
  return { HOME: home, USER: 'fixture', LOGNAME: 'fixture', PATH: `${home}/bin:/usr/bin:/bin`, TERM: 'dumb',
    HOMEBREW_PREFIX: join(home, 'homebrew'), TRACE: join(home, 'trace'), ...extra };
}
function zsh(script: string, extra: Record<string, string> = {}) {
  return Bun.spawnSync(['/bin/zsh', '-dfi', '-c', script], {
    cwd: home, env: environment(extra), stdout: 'pipe', stderr: 'pipe', timeout: 10000,
  });
}
function framework(body = '') {
  mkdirSync(join(home, '.oh-my-zsh'));
  writeFileSync(join(home, '.oh-my-zsh/oh-my-zsh.sh'), `compinit() { (( COMPLETION_COUNT += 1 )); }\ncompinit\n${body}\n`);
}

test('optional command helpers do no eager work and initialize thefuck only on first use', () => {
  command('thefuck', 'printf "thefuck\\n" >> "$TRACE"\nprintf \'%s\\n\' \'fuck() { print -r -- "CORRECT:$*"; }\'');
  const result = zsh(`source "$HOME/.functions"
if [[ -e "$TRACE" ]]; then print BEFORE=commands; else print BEFORE=clean; fi
fuck 'two words'
fuck next`);
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(result.stdout.toString()).toContain('BEFORE=clean');
  expect(result.stdout.toString()).toContain('CORRECT:two words');
  expect(result.stdout.toString()).toContain('CORRECT:next');
  expect(readFileSync(join(home, 'trace'), 'utf8')).toBe('thefuck\n');
});

test('optional helpers are quiet when tools are missing and failed lazy initialization remains retryable', () => {
  rmSync(join(home, 'bin/gpgconf'));
  rmSync(join(home, 'bin/thefuck'));
  const absent = zsh('source "$HOME/.functions"; print READY');
  expect(absent.exitCode).toBe(0);
  expect(absent.stderr.toString()).toBe('');
  command('thefuck', 'printf "attempt\\n" >> "$TRACE"\nexit 9');
  const failed = zsh('source "$HOME/.functions"; fuck first; first_result=$?; fuck second; second_result=$?; print -r -- "FIRST=$first_result SECOND=$second_result"');
  expect(failed.stdout.toString()).toContain('FIRST=9 SECOND=9');
  expect(readFileSync(join(home, 'trace'), 'utf8')).toBe('attempt\nattempt\n');
});

test('managed PATH is absolute, directory-guarded and repeatable without global Vulkan, GPG or project bins', () => {
  mkdirSync(join(home, 'go/bin'), { recursive: true });
  const result = zsh(`export DYLD_LIBRARY_PATH=/explicit/user/libraries
source "$HOME/.path"
source "$HOME/.path"
print -rl -- "$PATH" "DYLD=$DYLD_LIBRARY_PATH" "VK=\${VK_ICD_FILENAMES-unset}" "GPG=\${GPG_TTY-unset}"`);
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  const [path, ...settings] = result.stdout.toString().trim().split('\n');
  const entries = path.split(':');
  expect(entries.every(entry => entry.startsWith('/'))).toBe(true);
  expect(entries.filter(entry => entry === join(home, 'go/bin'))).toHaveLength(1);
  expect(entries).not.toContain(join(home, 'go'));
  expect(entries).not.toContain(join(home, 'vulkan_sdk/macOS/bin'));
  expect(entries).not.toContain(join(home, 'Library/Android/sdk/emulator'));
  expect(settings).toEqual(['DYLD=/explicit/user/libraries', 'VK=unset', 'GPG=unset']);
});

test('explicit inherited paths and Vulkan settings are preserved rather than silently sanitized or expanded', () => {
  const original = `${home}/bin:/usr/bin:relative-user-choice:/bin`;
  const sdk = join(home, 'custom Vulkan SDK');
  mkdirSync(join(sdk, 'bin'), { recursive: true });
  const result = zsh(`export DYLD_LIBRARY_PATH=/explicit/libraries
source "$HOME/.path"
print -rl -- "$PATH" "$VULKAN_SDK" "$DYLD_LIBRARY_PATH" "$VK_ICD_FILENAMES"`, {
    PATH: original, VULKAN_SDK: sdk, VK_ICD_FILENAMES: '/explicit/icd.json',
  });
  const [path, vulkan, dyld, icd] = result.stdout.toString().trim().split('\n');
  expect(path.startsWith(original)).toBe(true);
  expect(path.split(':')).not.toContain(join(sdk, 'bin'));
  expect([vulkan, dyld, icd]).toEqual([sdk, '/explicit/libraries', '/explicit/icd.json']);
});

test('an explicit GOBIN wins without rewriting GOPATH or adding nonexistent tool directories', () => {
  const bin = join(home, 'go tools/bin');
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(home, 'workspace/bin'), { recursive: true });
  const result = zsh('source "$HOME/.path"; source "$HOME/.path"; print -rl -- "$PATH" "$GOPATH"', {
    GOBIN: bin, GOPATH: join(home, 'workspace'),
  });
  const [path, gopath] = result.stdout.toString().trim().split('\n');
  expect(path.split(':').filter(entry => entry === bin)).toHaveLength(1);
  expect(path.split(':')).not.toContain(join(home, 'workspace/bin'));
  expect(gopath).toBe(join(home, 'workspace'));
});

test('multiple GOPATH roots and an explicit Android SDK keep spaces and append only installed binaries', () => {
  const a = join(home, 'go workspace a'); const b = join(home, 'go workspace b');
  const sdk = join(home, 'Android SDK');
  for (const path of [join(a, 'bin'), join(b, 'bin'), join(sdk, 'emulator'), join(sdk, 'platform-tools')]) mkdirSync(path, { recursive: true });
  const result = zsh('source "$HOME/.path"; print -rl -- "$PATH" "$GOPATH" "$ANDROID_SDK_ROOT" "$ANDROID_HOME" "$ANDROID_TOOLS"', {
    GOPATH: `${a}:${b}`, ANDROID_SDK_ROOT: sdk,
  });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  const [path, gopath, root, androidHome, tools] = result.stdout.toString().trim().split('\n');
  for (const entry of [join(a, 'bin'), join(b, 'bin'), join(sdk, 'emulator'), join(sdk, 'platform-tools')]) expect(path.split(':')).toContain(entry);
  expect(path.split(':')).not.toContain(join(sdk, 'cmdline-tools/latest/bin'));
  expect([gopath, root, androidHome, tools]).toEqual([`${a}:${b}`, sdk, sdk, `${sdk}/emulator:${sdk}/platform-tools`]);
});

test('existing native mise shims precede inherited fallback tools without duplicating PATH entries', () => {
  const data = join(home, 'mise data');
  mkdirSync(join(data, 'shims'), { recursive: true });
  writeFileSync(join(data, 'shims/java'), '#!/bin/sh\nprintf "managed-shim\\n"\n', { mode: 0o755 });
  command('java', 'printf "fallback\\n"');
  const result = zsh('source "$HOME/.path"; source "$HOME/.path"; command -v java; java; print -r -- "$PATH"', { MISE_DATA_DIR: data });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  const [selected, output, path] = result.stdout.toString().trim().split('\n');
  expect(selected).toBe(join(data, 'shims/java'));
  expect(output).toBe('managed-shim');
  expect(path.split(':').filter(entry => entry === join(data, 'shims'))).toHaveLength(1);
});

test('an explicit Homebrew prefix supplies its tools and libpq without invoking brew', () => {
  const prefix = join(home, 'homebrew');
  for (const path of ['bin', 'sbin', 'opt/libpq/bin']) mkdirSync(join(prefix, path), { recursive: true });
  const result = zsh('source "$HOME/.path"; print -rl -- "$PATH" "$LIB_PQ"');
  expect(result.exitCode).toBe(0);
  const [path, libpq] = result.stdout.toString().trim().split('\n');
  expect(path.split(':')[0]).toBe(join(prefix, 'bin'));
  expect(path.split(':')).toContain(join(prefix, 'sbin'));
  expect(path.split(':')).toContain(join(prefix, 'opt/libpq/bin'));
  expect(libpq).toBe(join(prefix, 'opt/libpq/bin'));
  expect(existsSync(join(home, 'trace'))).toBe(false);
});

test('the PATH fragment remains sourceable in POSIX sh without adding current-directory search entries', () => {
  mkdirSync(join(home, 'go/bin'), { recursive: true });
  const result = Bun.spawnSync(['/bin/sh', '-c', '. "$HOME/.path"; . "$HOME/.path"; printf "%s\\n" "$PATH"'], {
    cwd: home, env: environment(), stdout: 'pipe', stderr: 'pipe',
  });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  const entries = result.stdout.toString().trim().split(':');
  expect(entries.filter(entry => entry === join(home, 'go/bin'))).toHaveLength(1);
  expect(entries.every(entry => entry.startsWith('/'))).toBe(true);
});

test('GPG receives the actual interactive tty without launching an agent or inventing a non-tty value', async () => {
  framework();
  command('gpg', 'printf "gpg\\n" >> "$TRACE"');
  const script = 'autoload() { :; }; source "$HOME/.zshrc"; print -r -- "__GPG__${GPG_TTY-unset}__TTY__${TTY-unset}"';
  const nonTty = zsh(script);
  expect(nonTty.stdout.toString()).toContain('__GPG__unset');
  let output = '';
  const child = Bun.spawn(['/bin/zsh', '-dfi', '-c', script], {
    cwd: home, env: environment(),
    terminal: { cols: 100, rows: 30, data(_terminal, bytes) { output += Buffer.from(bytes).toString(); } },
  });
  const deadline = setTimeout(() => child.kill(), 5000);
  try { expect(await child.exited, output).toBe(0); }
  finally { clearTimeout(deadline); child.terminal!.close(); }
  const match = output.match(/__GPG__(\/dev\/[^\r\n]+)__TTY__(\/dev\/[^\r\n]+)/);
  expect(match, output).not.toBeNull();
  expect(match![1]).toBe(match![2]);
  expect(existsSync(join(home, 'trace'))).toBe(false);
});

test('an ignored home-local override keeps user aliases and paths and loads before mise activation', () => {
  framework();
  const contents = 'export LOCAL_TEST=present\nexport PATH="$HOME/device bin:$PATH"\nalias ls=personal_ls\n';
  writeFileSync(join(home, '.zshrc.local'), contents);
  command('mise', '[ "$*" = "activate zsh" ] || exit 9\nprintf "export MISE_SAW_LOCAL=%s\\n" "$LOCAL_TEST"');
  const result = zsh('autoload() { :; }; source "$HOME/.zshrc"; print -rl -- "LOCAL=$MISE_SAW_LOCAL" "ALIAS=$aliases[ls]" "$PATH"');
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(result.stdout.toString()).toContain('LOCAL=present');
  expect(result.stdout.toString()).toContain('ALIAS=personal_ls');
  expect(result.stdout.toString()).toContain(join(home, 'device bin'));
  expect(readFileSync(join(home, '.zshrc.local'), 'utf8')).toBe(contents);
  const ignored = Bun.spawnSync(['/usr/bin/git', '-C', source, 'check-ignore', '--no-index', '.zshrc.local'], {
    env: { HOME: home, PATH: '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }, stdout: 'pipe', stderr: 'pipe',
  });
  expect(ignored.exitCode).toBe(0);
});

test('framework completion initialization sees managed paths and Docker/asdf completions and runs only once', () => {
  for (const path of ['.docker/completions', '.asdf/completions', '.local/bin']) mkdirSync(join(home, path), { recursive: true });
  writeFileSync(join(home, '.local/bin/gdircolors'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  framework('FRAMEWORK_FPATH="${(j.:.)fpath}"\nFRAMEWORK_TOOL="$(command -v gdircolors)"');
  const result = zsh('autoload() { :; }; source "$HOME/.zshrc"; print -rl -- "INIT=$COMPLETION_COUNT" "FPATH=$FRAMEWORK_FPATH" "TOOL=$FRAMEWORK_TOOL"');
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(result.stdout.toString()).toContain('INIT=1\n');
  expect(result.stdout.toString()).toContain(join(home, '.docker/completions'));
  expect(result.stdout.toString()).toContain(join(home, '.asdf/completions'));
  expect(result.stdout.toString()).toContain(`TOOL=${home}/.local/bin/gdircolors`);
});
