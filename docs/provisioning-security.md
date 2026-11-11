# Provisioning security and authorization

M11 replaces the old installer's implicit security actions and plaintext-secret handling. Changes stay on the isolated branch; **do not run provisioning on the host merely to test it**.

## One native sudo authorization

Normal terminal bootstrap asks **sudo itself** to authorize once with `sudo --validate`. Bootstrap never reads the password, embeds it in a shell script or writes a password/askpass file. No password manager, sudoers edit, passwordless-sudo rule or SIP change is needed.

While bootstrap has a terminal, a run-scoped worker refreshes that terminal's cached authorization every **60 seconds** with `sudo --non-interactive --validate`. Foreground checkpoints also validate non-interactively. Privileged commands use `sudo --non-interactive`: expired/revoked authorization fails clearly instead of asking again. The worker stops on exit/interruption and is bounded by the parent process's lifetime. Cleanup calls native **`sudo --reset-timestamp` (`sudo -k`)** for the current session, not `-K` for every session. Invalidation failure is reported and cannot return overall success. Invalidation stops future cached authorization; it does not revoke privileges from an already-running native operation or provide universal rollback.

This relies on the machine's existing sudo policy permitting cached credentials; the installer does not weaken that policy. A non-cacheable or revoked authorization cannot safely be made unattended by this script.

**Headless execution is different:** there is no terminal in which to ask once, and sudo may scope its ticket by parent PID. Callers must supply an appropriate existing authorization or their own external askpass provider. Bootstrap does not create or own that provider, never deletes it, and does not run a background refresher in a different headless parent context. Foreground checks still fail closed. The native one-prompt integration below tests the normal terminal workflow, not every CI credential-provider/timestamp policy.

The maintained Homebrew installer is invoked non-interactively, avoiding its own Return-key confirmation. This is a single **sudo** authentication contract, not a guarantee that Apple/device-owner authorization, Xcode licensing, application installers, account logins or Accessibility consent can all be bypassed. Account/cloud stages remain separate opt-ins; real macOS consent remains manual.

## Checks are not actions

Default bootstrap:

- Reads FileVault and Application Firewall status; disabled/in-progress states are reported as requiring manual review, not “secure”. Development provisioning can continue with that explicit notice.
- Lists available software updates without installing them. Query errors/empty responses fail instead of being interpreted as a reason to install updates.
- Never enables FileVault, captures/displays a recovery key, changes screen-lock/Safari preferences or lost-device banners, or loads/restarts the old firewall launchd job.
- Still installs genuinely missing CLT prerequisites when needed, but only a discovered compatible **specific CLT label**. Failed discovery or an empty label stops before installation; it is not permission for a blanket OS update.

It reports **development setup completion**, not whole-machine security acceptance. A CI skip, a VM being unencrypted, or an unsupported status is never evidence of interactive security validation.

## Explicit public commands

These are mutually exclusive standalone action modes; they do not install Brewfile packages or run dotfile hooks. `--debug` can accompany a mode, but `--app-store` cannot. Changing actions are rejected when `CI` is set.

| Command | Behavior |
| --- | --- |
| `mise run security-check` | Read-only FileVault/firewall report, legacy recovery-file existence warning and native Settings guidance. No sudo/auth-cache changes. |
| `mise run security-apply` | Explicitly enables **only the native Application Firewall**, using `socketfilterfw --setglobalstate on`, then rechecks status. No service restart, unrelated preference writes, FileVault enablement or automatic permission changes. |
| `mise run macos-updates` | Explicitly lists then requests `softwareupdate --install --all`. Bootstrap supplies neither `--restart` nor `--force`; review native owner-authorization/restart requirements. This is not the unattended development-install path. |

Before mise exists, use the same standalone CLI:

```sh
/bin/bash bootstrap.sh --security-check
# Explicit changing stages, only when wanted:
/bin/bash bootstrap.sh --security-apply
/bin/bash bootstrap.sh --macos-updates
```

Check/recheck statuses are **0** for understood enabled states, **2** for manual attention (disabled/in-progress state or a legacy recovery file), and **1** for an unknown/failed query. Explicit changing commands propagate native failures. `security-apply` can still return 2 after successfully enabling the firewall because FileVault or legacy recovery material needs manual attention. A zero check result covers only the named checks, not a comprehensive security audit or screen-lock/recovery-escrow certification.

## FileVault and recovery material

Enable FileVault and choose/manage its recovery method in **System Settings → Privacy & Security → FileVault**. Store any recovery key in suitable secure storage outside this repo; do not copy it into logs, chat or synced Desktop files. The script no longer needs a recovery-key destination or file-permission workaround because it no longer creates the artifact at all.

If an older bootstrap created `~/Desktop/FileVault Recovery Key.txt`, the checker warns about its existence **without reading, printing, chmodding, moving or deleting it**. Review it privately, place recovery material in appropriate secure storage and deal with plaintext/synced copies deliberately. Restrictive permissions alone would not prevent Desktop cloud synchronisation. Key rotation, escrow and recovery validation remain manual/native workflows, not actions to test against real credentials.

## Temporary resources and debug output

Cleanup handles only its own installer file and any CLT placeholder it actually created. It does not recursively remove inherited `SUDO_ASKPASS`, `SUDO_ASKPASS_DIR`, arbitrary inherited installer paths or unrelated marker files. CLT marker creation refuses existing links/unsafe entries and uses native noclobber semantics rather than a privileged symlink-following touch. Owned marker cleanup cannot prompt again if authorization has expired.

Optional caller-provided GitHub-token handling has tracing disabled around both the condition and credential pipe. Synthetic-secret tests cover debug output. This does not promise that arbitrary external helpers, custom commands or third-party installers will redact their own output; inspect logs privately before sharing them.

## Evidence and limits

Public-CLI fixtures exercise authentication loss, refresh during work, interrupt cleanup, cache invalidation failure, inherited-helper preservation, read-only status distinctions, absence of key disclosure, debug redaction, failed/empty CLT and OS-update queries, explicit mode/CI guards and native action failures. Only OS/credential/package/network seams are replaced; no real sudo or security writes can reach the host.

In the disposable Sequoia ARM64 guest, the **real bootstrap** ran through a real sudo prompt and **75 seconds of controlled work**, with an observed native refresh during that interval and successful native cache invalidation afterward. Package/Git writes were replaced and the intentional work checkpoint returned 77; this was not whole bootstrap success. A first native run caught that macOS sudo rejects `-n` combined with standalone `-k`; the corrected call and failure handling have regressions. Native noclobber behavior was also checked against owned regular/dangling-link fixtures without privileges.

The real read-only security check returned **2**, correctly reporting FileVault off and firewall disabled in the test guest. Their status was unchanged by this work. No live firewall enabling, encryption/recovery, OS update installation, reboot, sudo-policy edit, SIP change or host security integration was performed. These changing paths are validated with controlled commands, not represented as real action acceptance.

Latest ordinary suite: **152 host passes /58 skips**, and the same host-safe verification is run in the guest. Full older `verify:vm`/desktop GUI results remain their own historical checkpoints, not a native FileVault/update test. Private evidence is referenced by `~/Library/Caches/dotfiles-vm/last-m11.path`.

Primary platform references: the shipped `sudo(8)` (per-terminal cache/validate/reset behavior), `fdesetup(8)` (status versus enable/recovery), `softwareupdate(8)` (listing versus install/restart/owner authorization) and `socketfilterfw(8)` (native firewall getter/setter). Registry/task support is not a substitute for exercising the native commands.
