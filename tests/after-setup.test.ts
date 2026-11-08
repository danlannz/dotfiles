import { afterEach, beforeEach, expect, test } from 'bun:test';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../script/after-setup', import.meta.url));
let directory: string;
let home: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'dotfiles shell setup '));
  home = join(directory, 'home');
  mkdirSync(home);
  mkdirSync(join(directory, 'bin'));
  mkdirSync(join(directory, 'nvm'));
  writeFileSync(join(directory, 'nvm/nvm.sh'), 'nvm() { printf "nvm %s\\n" "$*" >> "$TRACE"; }\n');
  writeFileSync(join(directory, 'installer'), `#!/bin/sh
keep=no
chsh=yes
runzsh=yes
for argument in "$@"; do
  case "$argument" in
    --keep-zshrc) keep=yes ;;
    --unattended) chsh=no; runzsh=no ;;
  esac
done
[ "$INSTALLER_STATUS" = 0 ] || exit "$INSTALLER_STATUS"
mkdir -p "\${ZSH:-$HOME/.oh-my-zsh}"
if [ "$keep" != yes ]; then
  printf 'PROMPT overwrite zshrc\\n' >> "$TRACE"
  printf 'replacement template\\n' > "$HOME/.zshrc"
fi
[ "$chsh" = no ] || printf 'changed login shell\\n' >> "$TRACE"
[ "$runzsh" = no ] || printf 'launched interactive shell\\n' >> "$TRACE"
exit 0
`);
  const commands: Record<string, string> = {
    curl: '[ "$DOWNLOAD_STATUS" = 0 ] || exit "$DOWNLOAD_STATUS"\ncat "$FIXTURE/installer"',
    git: `printf 'git %s\\n' "$*" >> "$TRACE"
[ "$GIT_STATUS" = 0 ] || exit "$GIT_STATUS"
for target in "$@"; do :; done
case "$target" in "$HOME"/*|"$CUSTOM_ROOT"/*) mkdir -p "$target" ;; *) exit 91 ;; esac`,
    wget: 'printf "wget\\n" >> "$TRACE"',
    mackup: 'printf "mackup\\n" >> "$TRACE"',
    brew: 'printf "%s/nvm\\n" "$FIXTURE"',
    bun: 'printf "agent setup\\n" >> "$TRACE"',
    mise: 'printf "mise %s\\n" "$*" >> "$TRACE"\n[ "${MISE_STATUS:-0}" = 0 ] || exit "$MISE_STATUS"\ncase "$*" in *"run terminal") exit "${TERMINAL_STATUS:-0}" ;; esac\nprintf "agent setup\\n" >> "$TRACE"',
  };
  for (const [name, body] of Object.entries(commands)) {
    writeFileSync(join(directory, 'bin', name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  }
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

function run(overrides: Record<string, string> = {}) {
  writeFileSync(join(directory, 'trace'), '');
  const result = Bun.spawnSync(['/bin/sh', script], {
    cwd: directory,
    env: {
      HOME: home, PATH: `${join(directory, 'bin')}:/usr/bin:/bin`,
      FIXTURE: directory, TRACE: join(directory, 'trace'), CUSTOM_ROOT: join(directory, 'custom plugins'),
      DOWNLOAD_STATUS: '0', INSTALLER_STATUS: '0', GIT_STATUS: '0', ...overrides,
    },
    stdout: 'pipe', stderr: 'pipe',
  });
  return { ...result, trace: readFileSync(join(directory, 'trace'), 'utf8') };
}

test.each([false, true])('shell installation preserves existing zshrc (symlink=%s) without prompts or changing shells', linked => {
  const content = 'my existing shell configuration\n';
  if (linked) {
    writeFileSync(join(directory, 'tracked-zshrc'), content);
    symlinkSync(join(directory, 'tracked-zshrc'), join(home, '.zshrc'));
  } else {
    writeFileSync(join(home, '.zshrc'), content);
  }
  const result = run();
  expect(result.exitCode).toBe(0);
  expect(readFileSync(join(home, '.zshrc'), 'utf8')).toBe(content);
  expect(lstatSync(join(home, '.zshrc')).isSymbolicLink()).toBe(linked);
  expect(result.trace).not.toContain('PROMPT');
  expect(result.trace).not.toContain('changed login shell');
  expect(result.trace).not.toContain('launched interactive shell');
  expect(result.trace).toContain('agent setup');
});

test('runtime and agent setup delegate to mise rather than installing NVM or fallback Brew Bun', () => {
  const result = run();
  expect(result.exitCode).toBe(0);
  expect(result.trace).toContain('run agents');
  expect(result.trace).not.toContain('nvm install');
  expect(result.trace).not.toContain('nvm use');
});

test('terminal configuration uses its named task and fonts come from Bundle rather than unchecked downloads', () => {
  const result = run();
  expect(result.exitCode).toBe(0);
  expect(result.trace).toContain('run terminal');
  expect(result.trace).not.toContain('wget');
});

test('terminal task failures are reported after agent setup rather than silently ignored', () => {
  const result = run({ TERMINAL_STATUS: '8' });
  expect(result.exitCode).toBe(8);
  expect(result.trace).toContain('agent setup');
  expect(result.trace).toContain('run terminal');
});

test('default setup defers account-dependent restoration so it cannot undo managed shell files', () => {
  const result = run();
  expect(result.exitCode).toBe(0);
  expect(result.trace).not.toContain('mackup');
  expect(result.stdout.toString()).toContain('run restore-settings');
});

test('a failed mise runtime/agent task stops the post-install hook', () => {
  const result = run({ MISE_STATUS: '8' });
  expect(result.exitCode).toBe(8);
  expect(result.trace).not.toContain('agent setup');
});

test('an existing Oh My Zsh install repairs missing plugins and reruns without recloning', () => {
  mkdirSync(join(home, '.oh-my-zsh'));
  const first = run();
  expect(first.exitCode).toBe(0);
  for (const plugin of ['zsh-dircolors-solarized', 'zsh-autosuggestions', 'zsh-syntax-highlighting']) {
    expect(existsSync(join(home, '.oh-my-zsh/custom/plugins', plugin))).toBe(true);
  }
  const second = run();
  expect(second.exitCode).toBe(0);
  expect(second.trace).not.toContain('git clone');
});

test('custom plugin directories with spaces are respected and logging works standalone', () => {
  const custom = join(directory, 'custom plugins');
  const result = run({ ZSH_CUSTOM: custom });
  expect(result.exitCode).toBe(0);
  expect(existsSync(join(custom, 'plugins/zsh-dircolors-solarized'))).toBe(true);
  expect(existsSync(join(custom, 'plugins/zsh-autosuggestions'))).toBe(true);
  expect(existsSync(join(custom, 'plugins/zsh-syntax-highlighting'))).toBe(true);
  expect(result.stderr.toString()).not.toContain('sudo_refresh');
});

test.each([{ DOWNLOAD_STATUS: '22' }, { INSTALLER_STATUS: '9' }, { GIT_STATUS: '7' }])('shell installation failures stop subsequent setup: %j', failure => {
  const result = run(failure);
  expect(result.exitCode).not.toBe(0);
  expect(result.trace).not.toContain('mackup');
  expect(result.trace).not.toContain('agent setup');
});
