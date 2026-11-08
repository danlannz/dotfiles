import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

// One-shot acceptance check for a newly provisioned Apple-virtualized guest.
// Never launches an application in the ordinary host/regression suite.
const enabled = process.env.DOTFILES_ITERM_FIRST_LAUNCH === '1';
function command(argv: string[]) {
  return Bun.spawnSync(argv, { stdout: 'pipe', stderr: 'pipe', timeout: 10000 });
}

test.skipIf(!enabled)('a normal iTerm launch automatically opens the provisioned default profile', async () => {
  const model = command(['/usr/sbin/sysctl', '-n', 'hw.model']);
  expect(model.exitCode).toBe(0);
  expect(model.stdout.toString().trim()).toStartWith('VirtualMac');
  expect(process.getuid!()).not.toBe(0);
  const session = command(['/usr/sbin/ioreg', '-n', 'Root', '-d1', '-a']);
  expect(session.exitCode).toBe(0);
  const locked = /<key>CGSSessionScreenIsLocked<\/key>\s*<true\s*\/>/.test(session.stdout.toString());
  expect(locked, 'Unlock the disposable guest before testing its first GUI launch.').toBe(false);
  const running = command(['/usr/bin/osascript', '-l', 'JavaScript', '-e', `function run() {
    ObjC.import('AppKit');
    return String(Number($.NSRunningApplication.runningApplicationsWithBundleIdentifier('com.googlecode.iterm2').count));
  }`]);
  expect(running.exitCode, running.stderr.toString()).toBe(0);
  expect(Number(running.stdout.toString().trim()), 'Quit iTerm before the launch acceptance check.').toBe(0);
  const profile = JSON.parse(readFileSync(new URL('../terminal/iterm2.json', import.meta.url), 'utf8')).Profiles[0];
  const selected = command(['/usr/bin/defaults', 'read', 'com.googlecode.iterm2', 'Default Bookmark Guid']);
  expect(selected.exitCode, 'Provisioning must seed a default before first launch.').toBe(0);
  expect(selected.stdout.toString().trim()).toBe(profile.Guid);

  const regular = command(['/usr/bin/osascript', '-l', 'JavaScript', '-e', `function run() {
    ObjC.import('Foundation');
    const prefs = $.NSUserDefaults.standardUserDefaults.persistentDomainForName('com.googlecode.iterm2');
    const profiles = prefs.objectForKey('New Bookmarks');
    const guids = [];
    for (let i = 0; !profiles.isNil() && i < Number(profiles.count); i++) {
      const p = profiles.objectAtIndex(i);
      const dynamic = p.objectForKey('Is Dynamic Profile');
      if (dynamic.isNil() || !dynamic.boolValue) guids.push(ObjC.unwrap(p.objectForKey('Guid')));
    }
    return JSON.stringify(guids);
  }`]);
  expect(regular.exitCode, regular.stderr.toString()).toBe(0);
  expect(JSON.parse(regular.stdout.toString()), 'Dynamic GUID must not collide with a regular profile.').not.toContain(profile.Guid);

  // Do not use create-window-with-profile or manually select Dotfiles: this
  // must exercise the window the app opens on its ordinary first launch.
  const launch = command(['/usr/bin/open', '-a', '/Applications/iTerm.app']);
  expect(launch.exitCode, launch.stderr.toString()).toBe(0);
  let actual = '';
  let lastError = '';
  for (let attempt = 0; attempt < 20; attempt++) {
    await Bun.sleep(1000);
    const query = command(['/usr/bin/osascript', '-e', 'with timeout of 2 seconds',
      '-e', 'tell application id "com.googlecode.iterm2" to get profile name of current session of current window',
      '-e', 'end timeout']);
    lastError = query.stderr.toString();
    if (query.exitCode === 0) { actual = query.stdout.toString().trim(); break; }
  }
  expect(actual, lastError || 'No automatic first window appeared; check first-run OS/app consent UI.').toBe(profile.Name);
  const persisted = command(['/usr/bin/defaults', 'read', 'com.googlecode.iterm2', 'Default Bookmark Guid']);
  expect(persisted.exitCode).toBe(0);
  expect(persisted.stdout.toString().trim()).toBe(profile.Guid);
}, 90000);
