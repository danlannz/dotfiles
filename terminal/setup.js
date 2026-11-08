// Run with macOS's osascript -l JavaScript, not Node/Bun. Native CFPreferences
// updates only the default GUID; the dynamic file remains the profile's sole owner.
function run(args) {
  ObjC.import('Foundation');
  ObjC.import('AppKit');
  const path = args.shift();
  const referencePath = args.shift();
  let domain = 'com.googlecode.iterm2';
  let explicit = false;
  let preview = false;
  let testing = false;
  while (args.length) {
    const flag = args.shift();
    if (flag === '--make-default') explicit = true;
    else if (flag === '--dry-run') preview = true;
    else if (flag === '--test-domain') {
      domain = args.shift() || '';
      if (domain.indexOf('nz.danlannz.dotfiles.tests.iterm.') !== 0) throw Error('Invalid isolated test domain');
      testing = true;
    } else throw Error('Unknown option: ' + flag);
  }
  if (!path || !referencePath) throw Error('Usage: osascript -l JavaScript terminal/setup.js DEPLOYED_PROFILE SOURCE_PROFILE [--make-default] [--dry-run]');
  function profileAt(file) {
    const data = $.NSData.dataWithContentsOfFile(file);
    if (data.isNil()) throw Error('Deploy the terminal profile with script/setup first.');
    let document = $.NSJSONSerialization.JSONObjectWithDataOptionsError(data, 0, null);
    if (document.isNil()) document = $.NSPropertyListSerialization.propertyListWithDataOptionsFormatError(data, 0, null, null);
    if (document.isNil()) throw Error('Invalid iTerm profile property list; left unchanged.');
    const profiles = document.objectForKey('Profiles');
    if (profiles.isNil() || Number(profiles.count) !== 1) throw Error('Expected exactly one terminal profile.');
    return profiles.objectAtIndex(0);
  }
  const source = profileAt(path);
  const guid = ObjC.unwrap(source.objectForKey('Guid'));
  if (typeof guid !== 'string' || !guid || !ObjC.unwrap(source.objectForKey('Name'))) throw Error('Missing profile Guid/Name.');
  if (guid !== ObjC.unwrap(profileAt(referencePath).objectForKey('Guid'))) {
    if (explicit) throw Error('Existing profile file has a different identity; left unchanged.');
    return 'Existing custom profile file preserved; default unchanged.';
  }

  if (!testing && $.NSRunningApplication.runningApplicationsWithBundleIdentifier(domain).count > 0) {
    if (explicit) throw Error('Quit iTerm before changing its stored default, or choose the profile in iTerm Settings.');
    return 'iTerm is running; stored profiles/default were not checked or changed.';
  }
  const existing = $.NSUserDefaults.standardUserDefaults.persistentDomainForName(domain);
  const value = key => existing.isNil() ? existing : existing.objectForKey(key);
  const custom = value('LoadPrefsFromCustomFolder');
  if (!custom.isNil() && custom.boolValue) {
    if (explicit) throw Error('iTerm uses an external preferences folder; select the profile in iTerm Settings instead.');
    return 'External iTerm preferences preserved; select Dotfiles in iTerm Settings.';
  }
  const original = value('New Bookmarks');
  if (!original.isNil() && !original.isKindOfClass($.NSArray)) throw Error('Invalid existing profile list; preferences left unchanged.');
  for (let i = 0; !original.isNil() && i < Number(original.count); i++) {
    const candidate = original.objectAtIndex(i);
    if (!candidate.isKindOfClass($.NSDictionary)) throw Error('Invalid existing profile; preferences left unchanged.');
    const dynamic = candidate.objectForKey('Is Dynamic Profile');
    if (ObjC.unwrap(candidate.objectForKey('Guid')) === guid && (dynamic.isNil() || !dynamic.boolValue)) {
      throw Error('Stored non-dynamic profile conflicts with the Dotfiles dynamic GUID. Back up and resolve the duplicate first; files and preferences left unchanged.');
    }
  }
  if (!explicit && (!value('Default Bookmark Guid').isNil() || (!original.isNil() && Number(original.count) > 0))) {
    return 'Existing iTerm profiles/default preserved; select Dotfiles in iTerm Settings.';
  }
  const normalFont = ObjC.unwrap(source.objectForKey('Normal Font'));
  const match = typeof normalFont === 'string' && normalFont.match(/^(.+) (\d+(?:\.\d+)?)$/);
  if (!match || $.NSFont.fontWithNameSize(match[1], Number(match[2])).isNil()) {
    throw Error('Profile font is unavailable: ' + normalFont + '. Install the declared font cask first.');
  }
  if (preview) return 'Would select Dotfiles; no preferences changed.';
  // A font lookup can take time. Do not overwrite an app that started meanwhile.
  if (!testing && $.NSRunningApplication.runningApplicationsWithBundleIdentifier(domain).count > 0) {
    throw Error('iTerm started during setup; preferences left unchanged. Retry with it quit.');
  }
  // iTerm remembers the original default GUID, loads dynamic profiles, then
  // restores that choice (ITAddressBookMgr init). A regular copy would collide.
  const updates = $.NSMutableDictionary.alloc.init;
  updates.setObjectForKey(guid, 'Default Bookmark Guid');
  $.CFPreferencesSetMultiple(updates, null, $(domain), $.kCFPreferencesCurrentUser, $.kCFPreferencesAnyHost);
  if (!$.CFPreferencesAppSynchronize($(domain))) throw Error('Could not synchronize iTerm preferences.');
  return 'Dotfiles selected; existing profiles retained.';
}
