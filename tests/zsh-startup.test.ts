import { expect, test } from 'bun:test';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Exercise the actual rc in a real shell. Substitute the external framework and
// completion initialization; refuse sources outside the fixture home so the old
// /Users/Daniel path cannot accidentally load the developer's host configuration.
test('interactive startup loads the configured prompt from the current HOME', () => {
  const home = mkdtempSync(join(tmpdir(), 'dotfiles zsh home '));
  try {
    mkdirSync(join(home, '.oh-my-zsh'));
    copyFileSync(new URL('../.zshrc', import.meta.url), join(home, '.zshrc'));
    writeFileSync(join(home, '.oh-my-zsh/oh-my-zsh.sh'), `
OMZ_TEST_LOADED=yes
build_prompt() { print -r -- test-prompt; }
PROMPT='$(build_prompt)'
`);
    const result = Bun.spawnSync(['/bin/zsh', '-dfi', '-c', `
source() {
  if [[ "$1" == "$HOME/"* ]]; then
    builtin source "$@"
  else
    print -u2 -- 'Refusing source outside fixture HOME'
    return 1
  fi
}
autoload() { :; }
compinit() { :; }
builtin source "$HOME/.zshrc"
print -r -- "FRAMEWORK=$OMZ_TEST_LOADED" "THEME=$ZSH_THEME" "PROMPT=$PROMPT"
`], {
      cwd: home,
      env: { HOME: home, USER: 'fixture', LOGNAME: 'fixture', PATH: '/usr/bin:/bin', TERM: 'dumb' },
      stdout: 'pipe', stderr: 'pipe',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('FRAMEWORK=yes');
    expect(result.stdout.toString()).toContain('THEME=agnoster');
    expect(result.stdout.toString()).toContain('PROMPT=$(build_prompt)');
    expect(result.stderr.toString()).not.toContain('Refusing source outside fixture HOME');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('user-specific tool paths follow the current HOME instead of another account', () => {
  const home = mkdtempSync(join(tmpdir(), 'dotfiles path home '));
  try {
    const result = Bun.spawnSync(['/bin/zsh', '-df', '-c', `
builtin source "$PATH_CONFIG"
print -r -- "LOCAL=$DOT_LOCAL" "PNPM=$PNPM_HOME" "BUN=$BUN_BIN"
`], {
      cwd: home,
      env: {
        HOME: home, PATH: '/usr/bin:/bin',
        PATH_CONFIG: fileURLToPath(new URL('../.path', import.meta.url)),
      },
      stdout: 'pipe', stderr: 'pipe',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain(`LOCAL=${home}/.local/bin`);
    expect(result.stdout.toString()).toContain(`PNPM=${home}/Library/pnpm`);
    expect(result.stdout.toString()).toContain(`BUN=${home}/.bun/bin`);
    expect(result.stdout.toString()).not.toContain('/Users/daniel');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
