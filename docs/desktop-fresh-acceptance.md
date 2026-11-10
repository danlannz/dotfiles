# Fresh desktop-stage setup and acceptance

This supersedes the unresolved common-config findings in [the initial runtime check](yabai-runtime-acceptance.md). It tests a **new clone of the clean macOS baseline**, not the previously provisioned/user-activated guest. It is a focused desktop-stage test, **not full bootstrap or an untouched Setup Assistant run**.

## Freshness and isolation

The fresh Sequoia 15.6.1 ARM64 account initially had **no Homebrew, Command Line Tools, dotfiles, Yabai/skhd binaries, desktop configs or services**. The baseline already supplied the disposable account and Remote Login. The new clone received a unique MAC before boot, no host directory shares, and a UUID/MAC/DHCP-guarded SSH transport with separate strict known-hosts state. Only a sanitised Git bundle and selected source overlays were transferred, not host configuration or credentials.

The user authorised deletion of only the obsolete stopped `dotfiles-bootstrap-test` VM. The baseline, previous user guest and other diagnostic guest were retained. APFS-efficient cloning left space for this focused run; space was monitored. The previous user guest was observed stopped and was not started, stopped or modified by these tests. The new guest is named **`dotfiles-desktop-fresh`**.

## Configuration fixes

- `.yabairc` now uses supported **`auto_balance on`** and removes the active obsolete `window_border` call. No border provider is added. Command failures stop the script instead of printing a misleading successful-load message.
- **Option–Shift–0 remains rebalance.** The conflicting desktop-10 action is disabled.
- **Option–T remains per-window floating/tiling.** Centering runs only when the result is floating; returning to tiling no longer produces `cannot apply grid layout to a managed window`.
- **Option–X remains mirror-x.** Its duplicate whole-desktop floating-layout action is disabled. No replacement shortcuts are introduced.

## Tested installation/configuration path

The official Homebrew installer supplied CLT 16.4 and Homebrew 7.0.13. Homebrew supplied mise 2026.11.5, jq, and later ShellCheck for validation. The actual source entry points then ran:

```sh
export PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
cd ~/.dotfiles
/bin/bash script/setup --dry-run
/bin/bash script/setup
mise run desktop
```

Native deployment created the real config links. The separate Brewfile installed **Yabai 7.1.25** and **skhd 0.3.9** without starting them. This was not a regular-Brewfile application install or a privileged full-bootstrap/security run.

Mise 2026.11.5 emitted source-trust warnings for lock/early-policy dotfile declarations during deployment; links and tasks succeeded, and no trust/checksum policy was bypassed. A later `mise exec -- bun` installed the remaining production runtime defaults as well as Bun. The explicit locked `runtimes` task subsequently passed all three deployed-file identity checks and native executable readiness. No system-JDK registration was executed. This observation is recorded rather than describing the guest as desktop-binaries-only after validation.

## Explicit service activation and macOS consent

For this **fresh installation only**, native activation was explicitly requested:

```sh
yabai --install-service
skhd --install-service
yabai --start-service
skhd --start-service
```

Both initially exited at the Accessibility gate. The user manually enabled both binaries in **System Settings → Privacy & Security → Accessibility**. Only services still stopped were then started. No direct TCC edits, permission automation, Secure Keyboard Entry changes, SIP changes or sudoers changes were performed.

**Mise can run installation/configuration/service commands; it cannot silently grant normal personal-Mac Accessibility consent.** The current `desktop` task intentionally remains binary-only. Its activation stage is the explicit native workflow above, not a hidden new default or automatic service migration. Updates may require renewed macOS consent.

Native service identities were observed, not inferred from the repository owner:

| Binary | Generated launchd label |
| --- | --- |
| Yabai 7.1.25 | `com.asmvik.yabai` |
| skhd 0.3.9 | `com.koekeishiya.skhd` |

When editing the repository-backed skhd config, run **`skhd --reload`**. This check found that changing the symlink target did not automatically load the new command; native reload did, with the same daemon PID. Do not reinstall or restart a working service merely to load config changes.

## Live GUI and keyboard-path results

A temporary AppKit application created two disposable standard windows. The test verified native frames/state, not merely command exit codes. One-shot GUI-domain test jobs used skhd's native key synthesis to feed its actual running event tap; raw SSH synthesis was not treated as successful input. The VM must be unlocked: an earlier run encountered the lock screen and was explicitly inconclusive. The final harness checks lock state and uses a bounded temporary `caffeinate` assertion without changing sleep/lock preferences.

The final run passed **all twelve checks**:

- `auto_balance` actually on; automatic tiling; direct focus and swap/restore.
- Deliberately uneven fixture splits restored by **Option–Shift–0** through running skhd.
- **Option–T** floated/centered the selected fixture, then returned it to tiling.
- No new Yabai/skhd stderr output, including no managed-window grid error.
- Fixture windows/process and temporary key jobs removed; prior foreground app/window frames restored; both service PIDs unchanged.

Native deployment and desktop installation were also repeated with unchanged config/LaunchAgent hashes and unchanged service PIDs. Earlier failed probe artifacts are retained: the first balance probe changed the Settings window height by four pixels; later final baselines were restored exactly. These are not retroactively presented as all-green runs.

## Verification and remaining limits

New configuration regressions went red before each fix: unsupported Yabai settings, false successful-load reporting, duplicate bindings and centering after re-tiling. **123 host passes /58 integration skips**, and the fresh guest's ordinary `verify` also passed **123/58** across 181 tests/18 files, including neutralisation of bogus inherited VM/GUI opt-ins. Syntax, ShellCheck, Brewfile checks, actionlint and whitespace are validated. The older full `verify:vm` result remains historical; it was not rerun or relabelled as this fresh-stage run.

This accepts the named common desktop behavior after **manual OS consent**. It does not establish every less-used binding, monocle query compatibility, multiple displays/spaces, scripting-addition operations, physical keyboard/UTM modifier forwarding, login/reboot persistence, Intel execution, signed-in restores, hosted CI or published remote bootstrap. The previous VM and host have not received these config fixes.

Private evidence and temporary probe source live under `~/Library/Caches/dotfiles-vm/last-desktop-fresh.path`; notably `preflight.log`, `deploy-desktop.log`, `permission-boundary.log`, `after-permission-start.log`, `repeat-deployment.log`, `hotkey-test-unlocked.log` (grid-error red), `hotkey-test-reloaded.log` (all checks green), and host/fresh ordinary verification logs. No fixture code or machine credentials are added to provisioning.
