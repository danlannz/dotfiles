import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = fileURLToPath(new URL('..', import.meta.url));
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'desktop configuration ')); mkdirSync(join(root, 'bin'));
  // External CLI contract verified against Yabai 7.1.25, not a substitute for GUI acceptance.
  writeFileSync(join(root, 'bin/yabai'), `#!/bin/sh
printf '%s\\n' "$*" >> "$TRACE"
[ "$1" = -m ] || exit 98
case "$2:$3" in
  rule:--add) exit 0 ;;
  config:auto_balance|config:layout|config:top_padding|config:bottom_padding|config:left_padding|config:right_padding|config:window_gap)
    [ "$3" != "$FAIL_SETTING" ] || { echo "fixture command failure" >&2; exit 9; }; exit 0 ;;
  *) echo "unknown command '$3'" >&2; exit 1 ;;
esac
`, { mode: 0o755 });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
function configure(extra: Record<string, string> = {}) {
  return Bun.spawnSync(['/bin/sh', join(repo, '.yabairc')], { cwd: root,
    env: { HOME: root, PATH: `${root}/bin:/usr/bin:/bin`, TRACE: join(root, 'trace'), FAIL_SETTING: '', ...extra }, stdout: 'pipe', stderr: 'pipe' });
}

test('Yabai config uses supported settings and enables the intended automatic balancing', () => {
  const result = configure();
  expect(result.exitCode).toBe(0);
  expect(result.stderr.toString()).toBe('');
  expect(readFileSync(join(root, 'trace'), 'utf8')).toContain('-m config auto_balance on\n');
  expect(result.stdout.toString()).toContain('yabai configuration loaded');
});

test('Yabai config propagates command failures instead of announcing a successful load', () => {
  const result = configure({ FAIL_SETTING: 'window_gap' });
  expect(result.exitCode).toBe(9);
  expect(result.stdout.toString()).not.toContain('configuration loaded');
  expect(result.stderr.toString()).toContain('fixture command failure');
});

function bindings() {
  const entries = new Map<string, string[]>();
  for (const line of readFileSync(join(repo, '.skhdrc'), 'utf8').replace(/\\\r?\n/g, ' ').split('\n')) {
    const match = /^([a-z +]+)\s+-\s+([a-z0-9]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const chord = match[1].split('+').map(part => part.trim()).sort().join('+') + '-' + match[2];
    entries.set(chord, [...(entries.get(chord) || []), match[3]]);
  }
  return entries;
}

test('skhd active shortcuts are unambiguous and preserve the habitual rebalance and floating keys', () => {
  const active = bindings();
  expect([...active.entries()].filter(([, commands]) => commands.length !== 1)).toEqual([]);
  expect(active.get('alt+shift-0')).toEqual(['yabai -m space --balance']);
  expect(active.get('alt-t')).toHaveLength(1);
  expect(active.get('alt-t')![0]).toContain('window --toggle float');
  expect(active.get('alt-x')).toEqual(['yabai -m space --mirror x-axis']);
});

test('Option-T centers a newly floating window but never applies a grid after returning to tiling', () => {
  writeFileSync(join(root, 'state'), 'false');
  writeFileSync(join(root, 'bin/yabai'), `#!/bin/sh
printf '%s\\n' "$*" >> "$TRACE"
case "$2:$3" in
  window:--toggle) if [ "$(/bin/cat "$STATE")" = true ]; then printf false > "$STATE"; else printf true > "$STATE"; fi ;;
  query:--windows) printf '{"is-floating":%s}\\n' "$(/bin/cat "$STATE")" ;;
  window:--grid) [ "$(/bin/cat "$STATE")" = true ] || { echo 'cannot apply grid layout to a managed window.' >&2; exit 9; } ;;
  *) exit 98 ;;
esac
`, { mode: 0o755 });
  writeFileSync(join(root, 'bin/jq'), `#!/bin/sh
# Controlled external jq truth-filter boundary; real jq is exercised in the guest.
input="$(/bin/cat)"
case "$input" in *'"is-floating":true'*) exit 0 ;; *) exit 1 ;; esac
`, { mode: 0o755 });
  const command = bindings().get('alt-t')![0];
  const invoke = () => Bun.spawnSync(['/bin/sh', '-c', command], { cwd: root,
    env: { HOME: root, PATH: `${root}/bin:/usr/bin:/bin`, TRACE: join(root, 'trace'), STATE: join(root, 'state') }, stdout: 'pipe', stderr: 'pipe' });
  const floating = invoke();
  expect(floating.exitCode, floating.stderr.toString()).toBe(0);
  expect(readFileSync(join(root, 'state'), 'utf8')).toBe('true');
  const tiled = invoke();
  expect(tiled.exitCode, tiled.stderr.toString()).toBe(0);
  expect(readFileSync(join(root, 'state'), 'utf8')).toBe('false');
  expect(readFileSync(join(root, 'trace'), 'utf8').split('\n').filter(line => line.includes('--grid'))).toHaveLength(1);
});
