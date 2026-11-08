# iTerm profile and font setup

## Baseline

`terminal/iterm2.json` is an ordinary iTerm profile property list: **Dotfiles**, 12-point Meslo Nerd Font Mono, Agnoster-compatible glyphs, and the existing host's dark palette. Only appearance colours were extracted from the reference profile: no commands, hosts, working directories, environment variables or other machine-specific profile content were exported.

The maintained `font-meslo-lg-nerd-font` Homebrew cask supplies the font. With the tested Nerd Fonts **3.5.1**, its actual PostScript name is **`MesloLGMNFM-Regular`**, despite the font filename being `MesloLGMNerdFontMono-Regular.ttf`. The VM check caught and rejected the tempting filename-derived name before recording any default. The font was then resolved through AppKit and checked for the Powerline separator, Git branch and Nerd Font gear glyphs. The existing Hack font selection remains installed/declared; no old fonts are automatically removed.

The old unchecked Powerline-font downloads are removed from `script/after-setup`. Font installation failures now belong to Bundle, and an unavailable selected font causes preference setup to fail visibly.

## File delivery and editing

Native mise declarations seed:

```text
~/Library/Application Support/iTerm2/DynamicProfiles/danlannz-dotfiles.json
```

The entry is **`copy` + `create_if_missing = true`**, with initial mode `0600`, not a symlink or a whole-directory deployment. Existing files, neighbouring profiles and edits survive reruns. The source JSON stays in Git; iTerm never writes through a symlink into it. `Rewritable: true` permits supported iTerm versions to persist dynamic-profile UI edits into the copied file.

The stable `Guid` identifies this profile; its name can be changed locally. Command, working-directory, initial-text, trigger and automatic-host-switch fields are explicitly cleared so a dynamic profile does not inherit remote/automatic actions from a custom default. iTerm watches the directory and reloads changes. The copied dynamic file is the sole profile source; setup must not duplicate it in native `New Bookmarks`. Such a regular copy causes iTerm to reject the dynamic profile and display a GUID-conflict warning. Subsequent setup does not refresh user-owned profile values from Git.

## Default-selection policy

`mise run terminal` is called after agent/runtime setup. It behaves conservatively:

- **No existing profiles or default:** verify the actual installed font, then record only the dynamic profile's default GUID.
- **Existing profile/default, even one named Default:** preserve it. Names, colours or stock-looking settings are not evidence that a profile is unused.
- **Running iTerm:** make no preference changes; stored profile conflicts are not checked until it is quit.
- **External/custom preference folder:** do not write or replace it; choose the profile through iTerm Settings.
- **An existing copied file with another GUID:** preserve it and the default. An explicit selection refuses rather than adopting somebody else's profile.
- **Missing font or malformed profile:** return failure before writing a default. JSON, XML and binary native property-list inputs are supported so app rewrites do not break future validation.

iTerm **3.7.7** explicitly supports a dynamic default GUID before loading that profile: `ITAddressBookMgr.init` saves the original default, loads dynamic profiles, then restores the matching default. Setup therefore writes only `Default Bookmark Guid`, never a regular copy in `New Bookmarks`. An existing non-dynamic profile with the same GUID fails visibly without deleting or overwriting either copy; resolve it with a reviewed backup/migration, not automatic deletion.

To choose Dotfiles on an existing installation, use **Settings → Profiles → Dotfiles → Other Actions → Set as Default**. Alternatively, with iTerm **quit**, explicitly opt in from another terminal:

```sh
mise -C ~/.dotfiles run terminal-default
```

That operation retains other profiles and settings and updates only the default GUID. It refuses while iTerm is running or when preferences come from an external folder. It never quits/restarts iTerm automatically. Undo selection in iTerm Settings by selecting the previous profile; it has not been deleted.

These commands affect the invoking user's preferences. **Do not run them from the development worktree on the host to test a branch.** Host promotion remains a separately approved rollout, because merging shell files changes the content behind the host's live symlinks.

## Why a small native helper exists

Mise handles the profile file, cask inventory and named tasks. Its macOS defaults declarations continuously enforce desired values; they do not provide the conditional, preserve-existing default-selection policy above.

`terminal/setup.js` runs under macOS's built-in **JXA/osascript**, not Node/Bun. It uses Foundation's native plist readers, AppKit font/application queries and `CFPreferencesSetMultiple` for only the default GUID. Existing arrays/dictionaries are retained as native objects: opaque preference data is not round-tripped through JSON. The application preference domain is fixed; the test-only override accepts only the dedicated synthetic namespace.

CFPreferences is tied to the OS user, **not an overridden HOME**. Actual preference integration tests therefore run only in the disposable guest and use unique synthetic domains, which are removed afterwards. Ordinary host tests skip those cases. No broad preference import, native-package replacement, custom profile schema, Apple credentials, blanket trust or automatic history is introduced.

## Verification and limits

Earlier completed terminal checkpoint: **120 guest tests pass**; the ordinary host suite passes **83 tests** and skips **37 guest-only integrations**. Shell/Brewfile syntax, error-level ShellCheck, whitespace, the real post-install hook twice and the native Bundle check also pass. This is not a full privileged/bootstrap or fresh-account GUI result.

- Real native preference tests cover fresh seeding, repeat runs, user edits, existing/default-less profiles, explicit selection, unrelated and opaque data, external folders, preview, malformed files, another owner's GUID, missing fonts and the test-domain boundary.
- Native mise tests cover copying rather than linking, initial permissions, neighbour/custom-file preservation, UI-style edits surviving redeployment, and the named terminal task reaching the preference helper.
- The guest installed the actual font cask and passed Bundle's regular-package check.
- Actual iTerm **3.7.7** loaded a Dotfiles window. Its foreground/background RGB values match the reference palette. Live JSON colour changes updated that window; a repeat mise apply preserved those edits, then restoring the test-owned copy restored the original colours. This was not a simulated iTerm parser.
- On the live guest, the running-app path preserved the profile/default digest and existing shell configuration. Explicit selection while running was refused without changing that digest.
- GUI restart is now verified. The initial quit AppleEvent timed out; with explicit user approval, only the known, UID/path-checked test iTerm process was terminated and the app relaunched. Its new default window still used **Default**; a new **Dotfiles** window retained the expected foreground/background colours. The complete stored profile/default digest was identical before and after. No permissions or preference safeguards were weakened. Full fresh-account first-launch GUI testing and exact whole-machine bootstrap remain rollout checks; synthetic-domain tests are not those checks.
- Host startup files/preferences were not deployed or modified. No legacy runtime/font uninstall, push, host promotion, App Store or cloud login was performed.

Private evidence is under `~/Library/Caches/dotfiles-vm/terminal-*`. The [living backlog](modernisation-backlog.md) retains the remaining rollout and GUI checks.

### Fresh-baseline acceptance in progress

A separate untouched-baseline clone, **dotfiles-sequoia-fresh-default**, started with no Homebrew, checkout, iTerm installation or preferences. Its real post-install hook installed the shell/framework/runtime/agent setup. The initial implementation incorrectly seeded a regular **Dotfiles** copy alongside the dynamic file, with GUID `23601ADB-F7B0-4B88-B822-22429BA015A3` and `MesloLGMNFM-Regular 12`. The user confirmed automatic default selection but reported iTerm's GUID-conflict warning. No manual profile selection or `terminal-default` command was used.

The ordinary `open -a /Applications/iTerm.app` acceptance attempt reached an AppleEvent timeout, initially behind a guest screen lock. The subsequent user screenshot exposed the real GUID collision, confirmed against native stored preferences and the dynamic file. Native regressions failed before the GUID-only fix and now pass **17/17**, including refusal to overwrite an existing colliding regular profile. The opt-in first-launch check now audits regular/dynamic GUID collisions as well as the unlocked-session prerequisite. **The affected guest is now repaired after the user quit iTerm.** A guest-only backup preserved the complete preferences and original dynamic file. Only the duplicate regular record was removed; its active settings were retained in the editable dynamic file as native XML, excluding iTerm's ownership/deprecated-default bookkeeping. All unrelated stored preferences and the default GUID were verified unchanged. On normal relaunch, iTerm's persisted model now marks Dotfiles dynamic and the regular/dynamic GUID intersection is empty. A process sample initially identified the ordinary Sparkle `SUUpdatePermissionPrompt`, not the dynamic-profile error modal. The user subsequently confirmed the repaired window looks good. Automated window/palette queries are not claimed as passing: later attempts hit the guest screen lock, and the opt-in check refuses that state. The launch guard now uses AppKit bundle identity rather than an unreliable executable-name `pgrep` match. Current host regression: **84 pass / 45 opt-in skips**; the new native deployment PTY regression also has a verified red/green result.

Homebrew **7.0.12** staged approximately **21 GiB** of apps plus **8 GiB** of downloads before installation, triggering the unchanged 6 GiB guest-space guard. Native cleanup freed 29.7 GB; guest-only preparation now uses the same native Brewfile inventory with bounded cask installs/cache cleanup. The initial bounded preparation was partial. After retrying the stalled Postgres download, resumed preparation and the real CI/bootstrap entry point completed successfully without upgrading existing packages. This is not an untouched, one-shot full bootstrap result; App Store/cloud stages and host promotion remain separate.

### Continued fresh-guest verification

Before verification-interface cleanup, the full isolated suite passed **125 tests**, with **one opt-in GUI-launch case skipped**, against Homebrew mise **2026.11.2**, Node **26.13.0** and Bun **1.4.4**. The first cold attempt timed out on three legacy-runtime downloads; the timed-out installers left incomplete private runtime metadata. A second run exposed mise's PATH fallback, rather than a version-selection configuration error. Only the damaged private Node 16/18 fixtures were reinstalled with the native version-scoped repair, then all tests passed. Two additional failed-before-fix regressions now require the production `runtimes` task to fail on incomplete Node/Bun executables using native `mise which`; no automatic force-repair was added.

A real PTY loaded the fresh guest's actual `.zshrc`, Oh My Zsh and Agnoster with isolated runtime data, proved mise executable ownership, and switched Node **26.13.0 → 16.20.2 → 26.13.0** on directory changes. This was not an iTerm GUI/font-rendering assertion.

Regular application preparation is now complete after the network retry. The gated continuation ran the real `/bin/bash bootstrap.sh --debug` entry point with `CI=1` and no-upgrade mode: SSH/bootstrap exit **0**, no timeout, real runtime executable checks and agent validation completed, App Store/cloud stages explicitly deferred, and the running iTerm preferences preserved. Native `HOMEBREW_BUNDLE_NO_UPGRADE=1 brew bundle check --global` passes. A default upgrade-sensitive check reports newer awscli/poppler/WhatsApp versions; those were not silently upgraded. This is a resumed local-bundle/overlay CI run after bounded package preparation, not an untouched one-shot or published-remote-command test.

The retired pilot's permanent replacement is documented in [testing](testing.md): actual ordinary `verify` passes **84 tests / 45 intentional skips** even with bogus inherited VM/GUI opt-ins; actual `verify:vm` passes **128 tests / one GUI skip**, both including syntax/lint checks. Three native task-boundary regressions cover opt-in clearing, failure propagation and refusal of an unprepared VM environment. The production config/lock are now the only active runtime declarations. The exact published remote command, untouched one-shot provisioning, signed-in stages, Intel execution and host rollout remain separate gates.

Private evidence/context: `~/Library/Caches/dotfiles-vm/fresh-default-context.path`.

## Primary references

- [iTerm dynamic profiles: format, inheritance, rewriting and GUID collisions](https://iterm2.com/documentation-dynamic-profiles.html).
- [iTerm 3.7.7 dynamic-default initialization](https://github.com/gnachman/iTerm2/blob/v3.7.7/sources/Settings/Profiles/ITAddressBookMgr.m#L307-L376).
- [iTerm 3.7.7 regular/dynamic GUID collision check](https://github.com/gnachman/iTerm2/blob/v3.7.7/sources/Settings/Profiles/iTermDynamicProfileManager.m#L455-L460).
- [iTerm native profile API keys](https://github.com/gnachman/iTerm2/blob/master/api/library/python/iterm2/iterm2/profile.py).
- [Maintained Meslo Nerd Font cask](https://formulae.brew.sh/cask/font-meslo-lg-nerd-font).
- [Mise managed-file seed semantics](https://github.com/jdx/mise/blob/v2026.11.0/docs/dotfiles/managed.md#create-a-file-only-if-it-is-missing-create-if-missing).
