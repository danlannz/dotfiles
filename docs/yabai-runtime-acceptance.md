# Yabai runtime acceptance — initial partial checkpoint

**Follow-up:** [Fresh desktop acceptance](desktop-fresh-acceptance.md) fixes the common config failures and validates Yabai/skhd setup plus the preferred live shortcuts in a new guest after manual Accessibility approval. This page preserves the earlier observations, not current unresolved status.

Follow-up to [optional provisioning](optional-tools.md), on the disposable Sequoia 15.6.1 ARM64 guest. The user manually installed/started the `com.asmvik.yabai` service before this check; the required access was available when the live window operations were tested. Those manual steps are **not** an automated fresh-device activation result.

## Observed service and GUI behavior

Yabai 7.1.25 was running under launchd and answering display/space/window queries. The current space used BSP with one pre-existing iTerm window. skhd had no running process or installed service definition at the time of the check.

A temporary, locally compiled AppKit application opened two standard disposable windows. Commands targeted only the known fixture window IDs; no user windows were closed. The fixture had automatic timeout/teardown and a saved foreground-application identity.

| Check | Result |
| --- | --- |
| Both fixture windows discovered and automatically tiled without overlap | Pass |
| Direct Yabai focus command selects a fixture window | Pass |
| Direct swap command exchanges the two fixture frames | Pass |
| Swapping back restores those frames | Pass |
| Fixture app exits and leaves no fixture windows/process | Pass |
| Pre-existing iTerm window returns to its original frame | Pass |
| Previous foreground app restored | Pass |
| Yabai PID, service definition, config hashes and final window snapshot unchanged | Pass |

This establishes basic live tiling/focus/swap behavior, not every layout operation, keyboard binding or login/reboot persistence. No service restart, config application, permission grant, scripting-addition loading, SIP change or sudoers change was performed by the test. The host and protected VM baseline were untouched.

## Configuration findings — unresolved

The service startup log contains errors from the current tracked `.yabairc`. Read-only native queries independently reproduce both unknown command names:

- **`.yabairc:70`: `autobalance on`** is unrecognized. The supported setting name is `auto_balance`; querying that setting returns **`off`**, not the intended `on`.
- **`.yabairc:73`: `window_border off`** is unrecognized by this Yabai version. No replacement border tool or behavior is selected here.
- The script still prints “yabai configuration loaded” after those errors. That message is not proof that every command succeeded.

The log also contains an earlier Accessibility abort. That historical entry is not evidence of a current denial: the subsequent running service successfully managed the actual fixture windows.

The existing **`.skhdrc:195` /`:216`** duplicate `alt - x` maps both mirror-x and floating-layout actions. This was already tracked in M14; the desired binding decision remains open. No skhd parser/hotkey or event-injection acceptance is claimed because skhd was not activated. Do not start it or change Secure Keyboard Entry/Accessibility settings implicitly to make a test pass.

Next: approve focused Yabai configuration fixes and verify them against the running guest, then separately select the conflicting keybinding and explicitly arrange skhd activation/permissions for a live hotkey check. Keep any service/permission transition user-controlled.

Private evidence is referenced by `~/Library/Caches/dotfiles-vm/last-yabai-acceptance.path`: sanitized before/after state, native config-query failures, fixture frame assertions and integrity comparison. The temporary probe/fixture code stays outside Git; it is not a new provisioning dependency or an ordinary test-suite GUI opt-in.
