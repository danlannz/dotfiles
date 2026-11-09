import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const text = readFileSync(new URL('../.Brewfile', import.meta.url), 'utf8');
const storeText = readFileSync(new URL('../Brewfile.app-store', import.meta.url), 'utf8');
const declarations = [text, storeText].flatMap(source => source.split('\n')).flatMap(line => {
  const match = line.match(/^\s*(#\s*)?(tap|brew|cask|mas)\s+"([^"]+)"/);
  return match ? [{ line, commented: Boolean(match[1]), kind: match[2], name: match[3] }] : [];
});
const active = declarations.filter(item => !item.commented);

test('the default bundle defers App Store apps to their own native manifest', () => {
  expect(text).not.toMatch(/^\s*mas\s+/m);
  expect(storeText).toMatch(/^\s*mas\s+/m);
  expect(storeText).not.toMatch(/^\s*(brew|cask|tap)\s+/m);
});

test('the Brewfile does not explicitly tap built-in or retired Homebrew sources', () => {
  const names = active.filter(item => item.kind === 'tap').map(item => item.name);
  for (const name of ['homebrew/bundle', 'homebrew/cask', 'homebrew/core', 'homebrew/services', 'homebrew/cask-versions']) {
    expect(names).not.toContain(name);
  }
});

test('mise owns the migrated Node/Bun setup without duplicate bootstrap managers', () => {
  const formulas = active.filter(item => item.kind === 'brew').map(item => item.name);
  expect(formulas).toContain('mise');
  for (const name of ['nvm', 'oven-sh/bun/bun', 'rbenv', 'ruby-build']) expect(formulas).not.toContain(name);
  expect(active.some(item => item.kind === 'tap' && item.name === 'oven-sh/bun')).toBe(false);
  // Python still needs an attested current release before the final asdf cutover.
  expect(formulas).toContain('asdf');
});

test('every tool, including optional declarations, has an inline description', () => {
  for (const item of declarations) {
    // Exclude only the optional leading comment marker, not the actual description.
    expect(item.line.replace(/^\s*#\s*/, '')).toMatch(/\s+#\s+\S/);
  }
});

test('reviewed obsolete packages may be removed or annotated, but cannot be active', () => {
  const retired = [
    ['brew', 'container-diff'], ['brew', 'exa'], ['brew', 'hyperscan'],
    ['brew', 'openssl@1.1'], ['brew', 'tldr'],
    ['cask', 'adoptopenjdk8'], ['cask', 'barrier'], ['cask', 'hyperdock'], ['cask', 'skype'],
  ];
  for (const [kind, name] of retired) {
    expect(active.some(item => item.kind === kind && item.name === name)).toBe(false);
    for (const item of declarations.filter(item => item.kind === kind && item.name === name)) {
      expect(item.line).toContain('NOTE:');
    }
  }
});

test('rolling aliases retain their warnings whether enabled or optional', () => {
  // Package selection is personal: neither alias has to remain declared or enabled.
  for (const item of declarations.filter(item => item.kind === 'brew' && ['postgres', 'openssl'].includes(item.name))) {
    expect(text).toContain(`# NOTE: ${item.name} is a valid rolling alias,`);
  }
});
