import { expect, test } from 'bun:test';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mise = process.env.DOTFILES_TEST_MISE_BIN;
const repo = fileURLToPath(new URL('..', import.meta.url));
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pi native resources ')));
  for (const dir of ['home', 'agent', 'config', 'state', 'project', 'bin']) mkdirSync(join(root, dir));
  for (const name of ['config.toml', 'mise.lock', 'miserc.toml']) symlinkSync(join(repo, 'mise', name), join(root, 'config', name));
  const env = { HOME: join(root, 'home'), PATH: `${process.env.MISE_DATA_DIR}/shims:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin`, MISE_CONFIG_DIR: join(root, 'config'), MISE_DATA_DIR: process.env.MISE_DATA_DIR!, MISE_CACHE_DIR: process.env.MISE_CACHE_DIR!, MISE_STATE_DIR: join(root, 'state'), PI_CODING_AGENT_DIR: join(root, 'agent'), PI_OFFLINE: '1', PI_SKIP_VERSION_CHECK: '1', PI_TELEMETRY: '0', CI: '1' };
  const selected = Bun.spawnSync([mise!, '-C', env.HOME, 'which', 'pi'], { env, stdout: 'pipe', stderr: 'pipe' });
  expect(selected.exitCode, selected.stderr.toString()).toBe(0);
  const pi = selected.stdout.toString().trim();
  expect(pi).toStartWith(join(process.env.MISE_DATA_DIR!, 'installs/pi') + '/');
  return { root, env, pi, project: join(root, 'project') };
}

// JSONL is split on LF, not Unicode line separators. No model prompts are sent.
function rpc(executable: string, cwd: string, env: Record<string, string>, approve = false) {
  const child = Bun.spawn([executable, '--mode', 'rpc', '--no-session', '--offline', '--no-mcp', approve ? '--approve' : '--no-approve'], { cwd, env, stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
  const records: any[] = [];
  const pending = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  const stderr = new Response(child.stderr).text();
  const read = (async () => {
    let buffer = ''; const decoder = new TextDecoder();
    for await (const chunk of child.stdout) {
      buffer += decoder.decode(chunk, { stream: true });
      let lf: number;
      while ((lf = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, lf).replace(/\r$/, ''); buffer = buffer.slice(lf + 1);
        if (!line) continue;
        const record = JSON.parse(line); records.push(record);
        if (record.type === 'response' && pending.has(record.id)) {
          pending.get(record.id)!.resolve(record); pending.delete(record.id);
        }
      }
    }
  })();
  return {
    records,
    async request(command: Record<string, unknown>) {
      const id = crypto.randomUUID();
      const response = new Promise<any>((resolve, reject) => pending.set(id, { resolve, reject }));
      const deadline = setTimeout(() => { pending.get(id)?.reject(new Error(`Pi RPC timeout: ${command.type}`)); pending.delete(id); child.kill(); }, 15000);
      child.stdin.write(JSON.stringify({ ...command, id }) + '\n');
      try { const result = await response; expect(result.success, JSON.stringify(result)).toBe(true); return result; }
      finally { clearTimeout(deadline); }
    },
    async close() {
      child.stdin.end();
      const deadline = setTimeout(() => child.kill(), 5000);
      try { await child.exited; await read; return await stderr; }
      finally { clearTimeout(deadline); }
    },
  };
}

function resources(f: ReturnType<typeof fixture>) {
  const pkg = join(f.root, 'package');
  cpSync(join(repo, 'agents/pi'), pkg, { recursive: true });
  writeFileSync(join(pkg, 'extensions/fixture.ts'), `import { CONFIG_DIR_NAME, type ExtensionAPI } from '@earendil-works/pi-coding-agent';
export default function (pi: ExtensionAPI) {
  pi.registerCommand('fixture-info', { handler: async (_args, ctx) => {
    ctx.ui.notify('FIXTURE:' + JSON.stringify({ cwd: ctx.cwd, schema: CONFIG_DIR_NAME, runtime: process.versions.bun, executable: process.execPath, theme: pi.getSettings().theme }));
  }});
  pi.registerCommand('fixture-reload', { handler: async (_args, ctx) => { await ctx.reload(); return; }});
}\n`);
  writeFileSync(join(pkg, 'prompts/fixture-prompt.md'), '---\ndescription: Fixture prompt, not a model request\n---\nTest-only prompt.\n');
  const theme = JSON.parse(readFileSync(join(dirname(f.pi), 'theme/dark.json'), 'utf8'));
  theme.name = 'fixture-theme';
  writeFileSync(join(pkg, 'themes/fixture-theme.json'), JSON.stringify(theme));
  writeFileSync(join(f.root, 'agent/settings.json'), JSON.stringify({ theme: 'light', defaultProjectTrust: 'ask' }));
  const install = Bun.spawnSync([f.pi, 'install', pkg, '--no-approve'], { cwd: f.project, env: f.env, stdout: 'pipe', stderr: 'pipe', timeout: 15000 });
  expect(install.exitCode, install.stderr.toString()).toBe(0);
  return pkg;
}

test.skipIf(!mise)('native package additions load SDK extensions and prompts, reload, and honor project settings', async () => {
  const f = fixture(); let client: ReturnType<typeof rpc> | undefined;
  try {
    const pkg = resources(f);
    mkdirSync(join(f.project, '.pi'));
    writeFileSync(join(f.project, '.pi/settings.json'), '{"theme":"dark"}');
    writeFileSync(join(f.root, 'bin/node'), '#!/bin/sh\nprintf called > "$TRACE"\nexit 91\n', { mode: 0o755 });
    const trace = join(f.root, 'node-used');
    client = rpc(f.pi, f.project, { ...f.env, PATH: `${f.root}/bin:/usr/bin:/bin`, TRACE: trace }, true);
    await client.request({ type: 'get_state' });
    const commands = (await client.request({ type: 'get_commands' })).data.commands;
    for (const name of ['fixture-info', 'fixture-prompt']) {
      const command = commands.find((entry: any) => entry.name === name);
      expect(command.sourceInfo.origin).toBe('package');
      expect(command.sourceInfo.scope).toBe('user');
    }
    expect((await client.request({ type: 'prompt', message: '/fixture-info' })).data.disposition).toBe('handled');
    const notification = client.records.find(record => record.type === 'extension_ui_request' && record.message?.startsWith('FIXTURE:'));
    const info = JSON.parse(notification.message.slice('FIXTURE:'.length));
    expect(info.cwd).toBe(f.project);
    expect(info.schema).toBe('.pi');
    expect(info.runtime).toBeTruthy();
    expect(info.executable).toStartWith(join(process.env.MISE_DATA_DIR!, 'installs/pi') + '/');
    expect(info.theme).toBe('dark');
    expect(existsSync(trace)).toBe(false);
    writeFileSync(join(pkg, 'prompts/fixture-added.md'), '---\ndescription: Added after startup\n---\nTest only.\n');
    expect((await client.request({ type: 'prompt', message: '/fixture-reload' })).data.disposition).toBe('handled');
    expect((await client.request({ type: 'get_commands' })).data.commands.some((entry: any) => entry.name === 'fixture-added')).toBe(true);
    expect(JSON.parse(readFileSync(join(f.root, 'agent/settings.json'), 'utf8')).theme).toBe('light');
  } finally {
    if (client) await client.close();
    rmSync(f.root, { recursive: true, force: true });
  }
}, 60000);

test.skipIf(!mise)('native config lists conventional extension, prompt and theme resources without changing selection', async () => {
  const f = fixture();
  try {
    resources(f);
    const before = readFileSync(join(f.root, 'agent/settings.json'), 'utf8');
    let output = ''; let closing = false;
    const child = Bun.spawn([f.pi, 'config', '--no-approve'], {
      cwd: f.project, env: { ...f.env, TERM: 'xterm-256color' },
      terminal: { cols: 130, rows: 45, data(terminal, bytes) {
        output += Buffer.from(bytes).toString();
        if (!closing && output.includes('fixture-theme.json')) { closing = true; setTimeout(() => terminal.write('\x1b'), 100); }
      } },
    });
    const deadline = setTimeout(() => child.kill(), 15000);
    try { expect(await child.exited, output).toBe(0); }
    finally { clearTimeout(deadline); child.terminal!.close(); }
    for (const name of ['fixture.ts', 'fixture-prompt.md', 'fixture-theme.json']) expect(output).toContain(name);
    expect(readFileSync(join(f.root, 'agent/settings.json'), 'utf8')).toBe(before);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
}, 20000);

test.skipIf(!mise)('Pi shim preserves a modern project Node selection in real shell commands', async () => {
  const f = fixture(); let client: ReturnType<typeof rpc> | undefined;
  try {
    writeFileSync(join(f.project, 'mise.toml'), '[tools]\nnode = "24"\n[tool_config]\nlocked = true\n');
    for (const args of [['trust', join(f.project, 'mise.toml')], ['-C', f.project, 'lock'], ['-C', f.project, 'install', '--locked', 'node']]) {
      const result = Bun.spawnSync([mise!, ...args], { env: f.env, stdout: 'pipe', stderr: 'pipe', timeout: 120000 });
      expect(result.exitCode, result.stderr.toString()).toBe(0);
    }
    client = rpc(join(process.env.MISE_DATA_DIR!, 'shims/pi'), f.project, f.env);
    await client.request({ type: 'get_state' });
    const result = await client.request({ type: 'bash', command: `node -p 'JSON.stringify({version:process.version,executable:process.execPath,cwd:process.cwd()})'` });
    expect(result.data.exitCode).toBe(0);
    const actual = JSON.parse(result.data.output.trim());
    expect(actual.version).toStartWith('v24.');
    expect(actual.executable).toStartWith(join(process.env.MISE_DATA_DIR!, 'installs/node/24.'));
    expect(actual.cwd).toBe(f.project);
  } finally {
    if (client) await client.close();
    rmSync(f.root, { recursive: true, force: true });
  }
}, 150000);
