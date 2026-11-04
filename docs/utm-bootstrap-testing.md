# Bootstrap testing with UTM

## Isolation and target

- Host: Apple Silicon, macOS 15.7.9; UTM 5.0.8.
- Guest target: Sequoia 15.6.1 (24G90), using Apple's available Sequoia restore IPSW. This is not the host's exact patch level or the latest macOS release.
- Baseline name: `dotfiles-sequoia-baseline`.
- Apple Virtualization backend, 4 vCPUs, 8 GiB RAM, 64 GiB sparse virtual disk, NAT networking.
- No shared host directories or credentials. Disable clipboard sharing and unnecessary microphone/audio devices before the first guest boot.
- VM files and installers stay outside this repository. The restore download is cached under `~/Library/Caches/dotfiles-vm/`.

The 64 GiB guest is for bootstrap/provisioning smoke tests. It is not a promise that every historical application in the current Brewfile, notably Xcode and specialised SDKs, will fit. Review package scope or provision a larger test disk before attempting the entire application collection.

## Current test status

On 2026-11-02, the Sequoia IPSW was downloaded and matched the recorded size and SHA-1. UTM created `dotfiles-sequoia-baseline` (UUID `D951A492-967F-4FB6-A6DA-0C831D2B4759`), completed installation (`query install`: `installing=false`, `progress=1.0`), and started the guest. Its configuration has no host directory shares; clipboard, microphone, and audio sharing are disabled.

Setup Assistant and Remote Login are complete with the disposable local administrator `bootstrap`. The baseline was shut down cleanly and cloned as `dotfiles-bootstrap-test` (`8071F59D-5684-41C0-8504-D912B27DDA82`). Initial CI-mode testing exposed the incorrect Intel Homebrew prefix on ARM.

That bug is now fixed. A new clean clone, `dotfiles-bootstrap-arm64-fix` (`4065E9DB-3A6F-4625-8D8D-199238CC1C59`), successfully installed native Homebrew at `/opt/homebrew`, ran `brew update`, and reused the installation on subsequent runs. The obsolete tap declarations exposed by that test are also removed. A follow-up guarded smoke test reached the main Brewfile dependency check and deliberately stopped before bulk application installation.

On 2026-11-03, the first package-enabled run exposed missing Bun tap trust, a Tailscale post-install launch failure without a desktop login, and stalled App Store operations. A follow-up added scoped Bun trust and split App Store apps into an opt-in, independently resumable stage. The regular manifest now passes native dependency checks twice in the reused guest, registering 192 formulas/dependencies and all 33 casks; Bun runs, and Tailscale is registered with a desktop user logged in. All 60 tests pass on host and guest.

That follow-up reached `script/after-setup` without any App Store install attempt and exposed the legacy Oh My Zsh `.zshrc` overwrite prompt. The hook now uses `--unattended --keep-zshrc`, repairs missing plugins, and preserves existing configuration. A focused fresh native installation plus a rerun verified the fix and completed Node/agent setup; all 69 tests now pass on host and guest, including later interactive-startup coverage.

The user's iTerm check exposed a separate hardcoded framework path in `.zshrc`. Home-relative rc/tool paths now load the real Agnoster prompt in a guest interactive login shell with a PTY. Installer preservation alone is not a shell-startup test. The user's running test VM was left open after that investigation; no baseline changes or iTerm preference writes were made.

Full end-to-end bootstrap has **not** passed: separate full reruns encountered Homebrew update/connectivity trouble before reaching the hook, and the focused hook still reports an ignored Mackup restore failure because the guest has no iCloud Drive. Actual signed-in App Store installation remains unverified by choice. See [captured results, source hashes, and regression coverage](utm-bootstrap-results.md). Test credentials are deliberately not recorded in this repository.

## Storage and cleanup

These test instances are VM clones, not lightweight Git branches. Their sparse disks grow as data is written; a 64 GiB virtual capacity is not an immediate 64 GiB allocation. APFS may share unchanged clone extents, so `du` totals can count shared data repeatedly and are not a guarantee of space reclaimed by deletion. Actual behaviour also depends on the clone/copy mechanism.

On 2026-11-03, before the full package attempt, `du` reported approximately 22 GiB for the baseline and 24 GiB for each diagnostic clone, plus 16 GiB for the cached macOS restore image. After the attempt, the active test clone reported 53 GiB and host free space was about 59 GiB. The guest had only 6.3 GiB free. Monitor both filesystems independently: deleting another VM frees host space, but does not enlarge this guest's virtual disk.

The owner subsequently authorised removing unused earlier test VMs if more host space is needed; the baseline and current test clone remain protected. No VM deletion was needed: cleaning only the disposable guest's Homebrew download caches reclaimed about 8 GB before the opt-in-stage retest. Afterward, the guest had about 12 GiB free and host about 63 GiB free. The cached restore image was retained; ask separately before deleting it, because a future OS reinstall would require downloading it again. Always shut VMs down and verify UUIDs before any authorised deletion.

## Installation

UTM's CLI can control existing VMs; its AppleScript API can also create an Apple-backend macOS VM and install from an IPSW. The scripting dictionary shipped with the installed app is the authoritative API for this version (`sdef /Applications/UTM.app`).

1. Download the Sequoia IPSW from Apple's CDN and check its size/checksum. The restore image is also validated by Apple's Virtualization framework when creating/installing the guest.
2. Create a **new** VM; never call `install` on an existing VM with useful data. UTM's install command erases the VM's primary drive without another confirmation.
3. Verify the new VM's identity, resource allocation, and lack of directory/clipboard sharing; disable microphone/audio devices before boot.
4. Install macOS, following `query install` progress.
5. Start the VM and complete macOS Setup Assistant manually. Use a disposable local administrator account, e.g. `bootstrap`. Skip Apple ID, iCloud, Migration Assistant, and importing host data; don't reuse your normal account password.

UTM's unattended macOS account-provisioning flags require macOS 27+ on both host and guest. They cannot replace Setup Assistant on this Sequoia host/guest. A full bootstrap test is **not complete** until the guest is installed, configured, and the script has actually run inside it.

## Baseline and test clone

After guest setup, enable Remote Login if remote execution is wanted. On Sequoia this may require using the guest's System Settings, not only a terminal command. Keep this test account isolated from real credentials.

Shut down the guest normally, then clone the baseline:

```sh
utmctl list
utmctl clone dotfiles-sequoia-baseline --name dotfiles-bootstrap-test
utmctl start dotfiles-bootstrap-test
```

Run all experiments on `dotfiles-bootstrap-test`, not the baseline. A stopped clean clone is a straightforward reset point; do not assume snapshots restore every host-side or network-side effect. Confirm snapshot functionality on this UTM/backend before relying on it. This UTM clone retained the baseline's MAC address: do not run both simultaneously without changing one VM's network address.

## Test the exact local branch

The published `master` currently predates the agent changes. Do not use the README's remote bootstrap command and assume it tests the cleanup branch.

A Git bundle transfers local commits without pushing or exposing host credentials:

```sh
git -C ~/.dotfiles bundle create /tmp/dotfiles-test.bundle chore/dotfiles-cleanup
```

Transfer the bundle through a deliberate file transfer (e.g. SSH after guest setup), not a broad host-home mount, and clone it inside the guest:

```sh
git clone --branch chore/dotfiles-cleanup /path/to/dotfiles-test.bundle ~/.dotfiles
git -C ~/.dotfiles rev-parse HEAD
```

Use an explicit branch: a bundle containing only the cleanup branch may not supply the default `master` HEAD, leaving a plain clone without a checkout. Verify the expected commit and setup hooks before provisioning.

The bundle includes committed history only. Copy explicitly selected uncommitted changes separately if they are part of the experiment, and record the commit and changed files in test results. Don't copy the host's `.git` directory wholesale, SSH keys, cloud backups, Homebrew state, or downloaded host skills.

For a truly fresh guest without Command Line Tools, even `/usr/bin/git` may trigger an installer. The first test used a new, sanitised clone made from the bundle on the host, overlaid the selected working Brewfile, then transferred that clone through SSH. Its Git configuration was generated without host global/system settings and its origin was set to the bundle's guest-local path. This transfers usable repository metadata without copying host credentials or requiring Git before bootstrap installs the tools.

## Test sequence

1. Record guest version, disk space, username, shell, and source commit. Capture a clean stopped baseline/clone before making changes.
2. Test file linking against a fixture home first. Verify conflicts preserve original content and a second run is idempotent. The audit already demonstrates a data-loss bug in the legacy linker; don't put valuable data in its target home.
3. Run the unmodified bootstrap only inside a disposable test guest and capture its first actual failure. System updates, encryption, app restores, and package installs are real operations even in a VM; review those stages before enabling them.
4. For unattended runs use a real Bash invocation and preserve the script exit status, e.g. `bash -o pipefail -c 'bash ~/.dotfiles/bootstrap.sh --debug 2>&1 | tee ~/bootstrap.log'`. Review logs before sharing them: existing debug/authentication code can include sensitive information.
5. Fix one reproducible failure at a time, restore a clean test clone when required, and test two consecutive runs. Installers that prompt or request sudo must not be mistaken for a hung agent.
6. The regular `.Brewfile` deliberately contains no App Store apps. Keep the default bootstrap invocation for unattended VM testing. For real initial device setup, sign in through App Store and explicitly add `--app-store`; later `script/setup-app-store` retries only that stage from `Brewfile.app-store`. Native manifest parsing/checks and command-boundary tests can validate the split without supplying Apple ID credentials; actual signed-in installation is a separate manual validation.
7. For focused shell-hook testing, preserve `.zshrc` and record its checksum/symlink target. Rename any existing disposable Oh My Zsh framework to a backup rather than deleting it to exercise the fresh installer. Test a second invocation for plugin repair/no recloning. Installer flags must preserve config and disable shell changes/interactive launches even with a PTY; failed downloads/clones must stop later steps.
8. Test a real interactive login shell under the disposable account, not only the installer. Verify that the framework and configured prompt load from that account's home. Use a PTY for terminal/ZLE behaviour; keep update checks disabled for deterministic startup probes. Check terminal profile font separately rather than assuming font installation selects it.
9. After provisioning succeeds, separately validate optional app/config restoration. Don't introduce real Apple ID/cloud credentials just to make an automated test pass.

Success means the intended guest setup completes, a second run is safe, required-stage failures propagate, and existing configuration survives conflicts. Passing the Bun agent tests or installing UTM alone is not a successful full-bootstrap test.

## Sources

- [UTM macOS guests](https://docs.getutm.app/guest-support/macos/)
- [UTM scripting examples](https://docs.getutm.app/scripting/cheat-sheet/)
- [Installed-version VM creation implementation](https://github.com/utmapp/UTM/blob/v5.0.8/Scripting/UTMScriptingCreateCommand.swift)
- [Apple Sequoia restore image](https://updates.cdn-apple.com/2025SummerFCS/fullrestores/093-10809/CFD6DD38-DAF0-40DA-854F-31AAD1294C6F/UniversalMac_15.6.1_24G90_Restore.ipsw)

IPSW metadata used for download verification: 16,814,137,790 bytes; SHA-1 `a19ba56bb931769580060647a466c5b2d09da761` (from the IPSW catalog). The download itself is from Apple's CDN; checksum matching is an integrity check, not independent authentication.
