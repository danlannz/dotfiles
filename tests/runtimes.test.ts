import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Opt-in integration against the production config, never a second runtime pin.
const mise = process.env.DOTFILES_TEST_MISE_BIN;
const source = fileURLToPath(new URL('..', import.meta.url));
const defaults = Bun.TOML.parse(readFileSync(join(source, 'mise/config.toml'), 'utf8')).tools as Record<string, string>;
function run(tool: 'node' | 'bun', expression: string) {
  const root = process.env.DOTFILES_TEST_ROOT;
  expect(root).toBeTruthy();
  expect(mise).toBe(join(root!, 'bin/mise'));
  expect(process.env.HOME).toBe(join(root!, 'home'));
  for (const [key, directory] of Object.entries({
    MISE_CONFIG_DIR: 'config', MISE_DATA_DIR: 'data', MISE_CACHE_DIR: 'cache', MISE_STATE_DIR: 'state',
  })) expect(process.env[key]).toBe(join(root!, directory));
  expect(realpathSync(join(root!, 'config/config.toml'))).toBe(realpathSync(join(source, 'mise/config.toml')));
  expect(realpathSync(join(root!, 'config/mise.lock'))).toBe(realpathSync(join(source, 'mise/mise.lock')));
  expect(realpathSync(join(root!, 'config/miserc.toml'))).toBe(realpathSync(join(source, 'mise/miserc.toml')));
  const which = Bun.spawnSync([mise!, '-C', process.env.HOME!, 'which', tool], { env: process.env, stdout: 'pipe', stderr: 'pipe' });
  expect(which.exitCode, which.stderr.toString()).toBe(0);
  const result = Bun.spawnSync([mise!, '-C', process.env.HOME!, 'exec', '--', tool, '-e', expression], {
    env: process.env, stdout: 'pipe', stderr: 'pipe', timeout: 60_000,
  });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  return JSON.parse(result.stdout.toString()) as { version: string; executable: string };
}

test.skipIf(!mise)('production defaults select Node from isolated mise data, not an existing manager', () => {
  const node = run('node', 'console.log(JSON.stringify({version:process.version,executable:process.execPath}))');
  expect(node.version).toBe(`v${defaults.node}`);
  expect(node.executable.startsWith(join(process.env.MISE_DATA_DIR!, 'installs/node') + '/')).toBe(true);
}, 65_000);

test.skipIf(!mise)('production defaults provide mise-owned Java and Kotlin executables', () => {
  for (const tool of ['java', 'javac', 'kotlin', 'kotlinc']) {
    const result = Bun.spawnSync([mise!, '-C', process.env.HOME!, 'which', tool], {
      env: process.env, stdout: 'pipe', stderr: 'pipe', timeout: 10000,
    });
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    expect(result.stdout.toString().trim()).toStartWith(join(process.env.MISE_DATA_DIR!, 'installs') + '/');
  }
});

test.skipIf(!mise)('managed Java environment compiles and runs Java and Kotlin programs without asdf', () => {
  run('node', 'console.log(JSON.stringify({version:process.version,executable:process.execPath}))');
  const project = mkdtempSync(join(tmpdir(), 'mise language smoke '));
  function exec(args: string[]) {
    const result = Bun.spawnSync([mise!, '-C', project, 'exec', '--', ...args], {
      env: { ...process.env, JAVA_HOME: '/retired-asdf-jdk-must-not-be-used' }, stdout: 'pipe', stderr: 'pipe', timeout: 60000,
    });
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    return result.stdout.toString().trim();
  }
  try {
    const javaHome = exec(['/bin/sh', '-c', 'printf "%s" "$JAVA_HOME"']);
    expect(javaHome).toStartWith(join(process.env.MISE_DATA_DIR!, 'installs/java') + '/');
    writeFileSync(join(project, 'Hello.java'), 'class Hello { public static void main(String[] args) { System.out.print("JAVA_OK"); } }\n');
    exec(['javac', '-d', project, join(project, 'Hello.java')]);
    expect(exec(['java', '-cp', project, 'Hello'])).toBe('JAVA_OK');
    writeFileSync(join(project, 'Hello.kt'), 'fun main() { print("KOTLIN_OK") }\n');
    exec(['kotlinc', join(project, 'Hello.kt'), '-include-runtime', '-d', join(project, 'hello.jar')]);
    expect(exec(['java', '-jar', join(project, 'hello.jar')])).toBe('KOTLIN_OK');
    expect(exec(['kotlin', '-classpath', join(project, 'hello.jar'), 'HelloKt'])).toBe('KOTLIN_OK');
  } finally { rmSync(project, { recursive: true, force: true }); }
}, 130000);

test.skipIf(!mise)('native shims resolve managed executables in a non-activated shell', () => {
  const result = Bun.spawnSync(['/bin/sh', '-c', 'command -v java; javac -version; kotlinc -version; node --version; bun --version'], {
    cwd: process.env.HOME, env: { ...process.env, PATH: `${process.env.MISE_DATA_DIR}/shims:/usr/bin:/bin`, JAVA_HOME: '/retired-asdf-jdk-must-not-be-used' },
    stdout: 'pipe', stderr: 'pipe', timeout: 60000,
  });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(result.stdout.toString()).toContain(join(process.env.MISE_DATA_DIR!, 'shims/java'));
  expect(result.stdout.toString()).toContain(`javac ${defaults.java.replace(/^temurin-/, '').split('+')[0]}`);
  expect(result.stderr.toString()).toContain(`kotlinc-jvm ${defaults.kotlin}`);
  expect(result.stdout.toString()).toContain(`v${defaults.node}`);
  expect(result.stdout.toString()).toContain(defaults.bun);
}, 65000);

test.skipIf(!mise)('production defaults select Bun from isolated mise data, not the Brewfile runtime', () => {
  const bun = run('bun', 'console.log(JSON.stringify({version:Bun.version,executable:process.execPath}))');
  expect(bun.version).toBe(defaults.bun);
  expect(bun.executable.startsWith(join(process.env.MISE_DATA_DIR!, 'installs/bun') + '/')).toBe(true);
}, 65_000);
