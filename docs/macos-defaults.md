# Reviewed macOS defaults

Normal, non-CI bootstrap now seeds **missing** reviewed preferences through `script/after-setup` → `mise run macos-defaults-apply`. This was explicitly selected by the user after the [read-only preference review](macos-defaults-review.md). Existing values are never intentionally overwritten, including false/zero and OS-created values that differ from the baseline.

## Interface and ownership

```sh
mise -C ~/.dotfiles run macos-defaults        # read-only preview
mise -C ~/.dotfiles run macos-defaults-apply  # seed missing keys only
```

The same CLI is available before mise: `bash ~/.dotfiles/.macos --preview` or `--apply`. No arguments means preview. `--help` describes the interface; unknown/combined arguments exit 2. Preview exits successfully when it can report every setting, even if settings are missing; it does not claim the baseline is already effective.

**Do not run the apply task on the host just to test this development branch.** Host promotion remains separate. Run as the intended user, never via sudo/root. No admin authorization, dependency installation, account restoration or platform permission is needed by this stage.

`.macos` contains the single authoritative inventory and delegates targeted reads/writes to native `defaults`. There is no domain import, exported preference snapshot or custom configuration manifest. Mise's continuously enforced macOS-default declarations do not supply this preserve-existing/seed-only policy, so a small Bash 3.2-compatible entry point owns that condition.

## Selected inventory

| Setting | Domain / key | Typed baseline |
| --- | --- | --- |
| Simulator touch indicators | `com.apple.iphonesimulator / ShowSingleTouches` | Boolean true |
| Dock auto-hide | `com.apple.dock / autohide` | Boolean true |
| Mouse scaling | `NSGlobalDomain / com.apple.mouse.scaling` | Float `2` |
| Key repeat | `NSGlobalDomain / KeyRepeat` | Integer `1` |
| Initial repeat delay | `NSGlobalDomain / InitialKeyRepeat` | Integer `25` |
| Stable Spaces ordering | `com.apple.dock / mru-spaces` | Boolean false |
| Show filename extensions | `NSGlobalDomain / AppleShowAllExtensions` | Boolean true |
| Finder path bar | `com.apple.finder / ShowPathbar` | Boolean true |
| Prefer Finder list view | `com.apple.finder / FXPreferredViewStyle` | String `Nlsv` |
| Show desktop hard disks | `com.apple.finder / ShowHardDrivesOnDesktop` | Boolean true |
| Show desktop connected servers | `com.apple.finder / ShowMountedServersOnDesktop` | Boolean true |

The mouse/repeat numbers were confirmed from the user's targeted read-only host inspection, not guessed from common tuning recipes. They are stored preference representations, not measurements of device speed or timing. Trackpad speed, scrolling direction, press-and-hold/accent behavior, Dock size/animation, and other discovered preferences are **not** selected. Existing installations/project files and unrelated preference keys remain untouched.

## Preservation, failures and lifecycle

- Every read is preflighted before any writes. A specific native missing-key diagnostic is required; an unknown/query error is not treated as absence. Unexpected/localized diagnostics fail closed.
- Each key is reread immediately before its possible write. If present, its value and type are left alone. This is not an atomic compare-and-set: avoid concurrent settings editing during provisioning.
- Only absent keys receive explicit boolean/integer/float/string writes. The stored value **and type** are checked afterwards; a successful command exit alone is insufficient.
- Read/verification errors are nonzero; write failures preserve their native nonzero status and stop the hook. Earlier successful seeds can remain after a later failure; there is no blind rollback. Retry fills remaining absent keys without replacing previous settings.
- A pre-existing false value is preserved even on a new account if macOS already stored it. Seed-only provisioning cannot infer whether an OS-generated value was an intentional choice. Use System Settings/Finder settings to deliberately change an existing value.
- Normal bootstrap invokes the apply task after agents/terminal setup. With nonempty `CI`, the hook reports that preference writes are skipped; direct `--apply` also refuses CI. Ordinary `verify` never provisions preferences.
- No application termination, Finder/Dock restart, service activation, sudo, Accessibility/TCC, security-policy, device-registration or permission changes occur. Running apps/devices may require manual reopening or logout; immediate visible effect is not promised.
- The existing `showHiddenFiles` / `hideHiddenFiles` helpers remain explicit user actions and change only Finder's hidden-file boolean. They no longer terminate Finder; failed writes do not print a success message.

To undo a seeded value, review the logged domain/key and its current value before making an intentional native UI/key-specific change. Do not restore or delete a whole domain, or blindly delete keys that the user may have since edited.

## Option–Arrow is separate

Option–Left/Right is normal word navigation in supported macOS text fields, not a pointer/repeat-rate preference. At a terminal prompt iTerm sends a sequence and the shell editor interprets it.

Newly seeded iTerm profiles now include only the two arrow mappings from iTerm **3.7.7**'s bundled `Resources/PresetKeyMappings.plist` → **Natural Text Editing**: `f702-0x280000` sends Escape-`b`, and `f703-0x280000` sends Escape-`f` (action `10`). Other Option-key behavior is not changed. Existing editable profile copies are preserved, not refreshed from Git; configure those two mappings manually if wanted. See [terminal setup](terminal-setup.md).

Zsh's Emacs keymap interprets these as backward-word / forward-word. Word boundaries and forward destinations need not exactly match macOS text fields. `.inputrc` belongs to Bash/Readline, not Zsh; existing Control–Arrow bindings are not removed.

## Verification and limits

- Red/green public CLI tests cover preview, eleven typed seeds, repeat no-op, false/zero/alternate/type/unrelated preservation, preflight errors, partial failure/retry, false-success writes, CI/platform/root/argument guards and non-terminating Finder helpers.
- Hook tests cover normal bootstrap task delegation, CI skipping and nonzero preference-task failure propagation. No real privileged bootstrap was run for this checkpoint.
- In the disposable guest, actual native `defaults` verified all eleven typed values, repeat/preservation, CI refusal and false-success detection through the real mise tasks. A boundary wrapper mapped only the four known domains to unique **synthetic test domains**, then cleared them with native `defaults delete`. Subsequent reads report the domains absent; macOS can retain empty plist/index entries, which are not manually pruned. No live application preferences were written.
- The real guest's production-domain preview succeeded. The 94-key real preference allowlist was identical before/after, and Yabai/skhd PIDs remained unchanged. No config/service redeployment or app restart was needed.
- A native Zsh PTY accepted Escape-b / Escape-f and produced the expected edited buffer. Template mapping values also match the first-party bundled preset. This is not actual iTerm GUI key dispatch, physical keyboard forwarding or end-to-end fresh-account acceptance.
- Native storage does not prove effective Dock/Finder/device/Simulator behavior. Full bootstrap, login/reboot persistence, physical input and host rollout remain separate gates.

Private evidence: `~/Library/Caches/dotfiles-vm/defaults-review-20261112/`. Latest ordinary suites: **173 pass /58 intentional skips**, 231 tests across 19 files on host/guest. The earlier full `verify:vm` result remains historical, not rerun for this checkpoint.

## Primary references

- [Apple: Desktop & Dock settings](https://support.apple.com/guide/mac-help/change-desktop-dock-settings-mchlp1119/mac).
- [Apple: Finder settings](https://support.apple.com/guide/mac-help/change-finder-settings-on-mac-mchlp2803/mac).
- [Apple: key repeat rate and delay](https://support.apple.com/en-asia/guide/mac-help/mchl0311bdb4/mac).
- [Apple: mouse/trackpad tracking speed](https://support.apple.com/guide/mac-help/change-mouse-or-trackpad-tracking-double-click-and-scrolling-speed-mchlp1138/mac).
- [Apple: keyboard shortcuts](https://support.apple.com/en-us/102650).
- [iTerm: profile key mappings and Send Escape Sequence](https://iterm2.com/documentation-preferences-profiles-keys.html).
- [Zsh line editor](https://zsh.sourceforge.io/Doc/Release/Zsh-Line-Editor.html).

These guides describe user-facing behavior, not a stable contract for undocumented preference-key numeric defaults.
