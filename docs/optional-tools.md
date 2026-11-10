# Optional desktop tools and Git helper

These are **explicit provisioning commands**, never dependencies of bootstrap, `agents`, ordinary `verify` or `verify:vm`. They apply to the invoking account/machine; do not run them on the host merely to test this isolated branch.

After regular bootstrap:

```sh
mise -C ~/.dotfiles run desktop
mise -C ~/.dotfiles run git-fuzzy
```

They are independent: selecting git-fuzzy does not install desktop software, and selecting desktop software does not clone a Git helper. EAS, Cline, MCP servers and doctl are not selected by either task.

## Desktop: install binaries, not a desktop session

[`Brewfile.desktop`](../Brewfile.desktop) is the only package inventory for this stage. It declares upstream's `asmvik/formulae/yabai` and `asmvik/formulae/skhd`, with trust scoped to those **two formulae**, not the whole tap. There is no separate tap declaration: Homebrew automatically obtains the upstream tap when a missing formula needs installation.

The task checks native Bundle satisfaction, installs only when needed with **`--no-upgrade`**, then checks again. Homebrew auto-update and install cleanup are disabled for the invocation; inherited formula skips cannot falsely satisfy this explicit selection. Native Bundle identifies installed fully-qualified formulae by their Cellar rack name, so an existing legacy-tap installation is not a request to retap, reinstall or upgrade it. No migration of the host's `koekeishiya/formulae` installations is performed.

Service start/restart options are explicitly false. The script never invokes either daemon, `brew services`, launchctl, sudo, Accessibility automation, scripting-addition loading or SIP/sudoers changes. Formula installation includes upstream build/signing behavior, not permission grants. It never runs dotfile deployment or edits `.yabairc`, `.skhdrc` or LaunchAgent files.

**Installation is not activation acceptance.** Before manually starting anything:

- Review existing service labels/binary paths, active configuration and the upstream permission requirements.
- Use the reviewed config fixes and preserved shortcuts in [fresh desktop acceptance](desktop-fresh-acceptance.md). A version check alone does not establish layout/hotkey behavior; less-used bindings and multi-display/space operations remain separate.
- Keep Accessibility approval, Secure Keyboard Entry decisions and any security-sensitive scripting-addition setup explicit. This stage does not require or change SIP or passwordless sudo policy.
- skhd upstream is in maintenance mode and recommends a separate Zig port for additional development; this task deliberately keeps the selected upstream implementation rather than silently switching providers.

Homebrew remains the version owner; this manifest is **not an exact package-version lock**. The tested guest installed Yabai **7.1.25** and skhd **0.3.9**. Future missing installations may resolve newer upstream formula versions. Updating an existing desktop installation and its services is separate reviewed work, not an effect of rerunning this task.

## Git-fuzzy: preserve existing checkout ownership

The `git-fuzzy` task in [`mise.toml`](../mise.toml) is the single exact revision declaration. It passes the reviewed commit to the dedicated installer; the upstream URL is `https://github.com/bigH/git-fuzzy.git`. This checkpoint retains the existing revision rather than upgrading the helper.

The default checkout remains `~/.oh-my-zsh/custom/plugins/git-fuzzy`, matching the existing managed PATH. It is a Git helper stored there for compatibility, **not an enabled Oh My Zsh plugin**. The default requires Oh My Zsh's directory to exist, so invoking this optional task early cannot create a partial framework installation. Git and fzf must already be supplied by regular bootstrap.

An explicit **absolute `GIT_FUZZY_BIN=/path/to/checkout/bin`** selects another checkout location; use the same variable in your shell configuration so `.path` exposes it. The installer does not rewrite startup files or export settings into an existing parent shell. Open a new shell after installation.

- An absent target is cloned without checkout, then checked out at the full detached commit and checked for executable/core-file readiness.
- An existing ready checkout is left alone, even if dirty, on another revision or using a fork. The pin applies **only to new installations**; no fetch/reset/pull/clean runs against existing checkouts.
- Files, incomplete/non-repository directories, ancestor repositories and dangling links fail visibly without replacement. A ready checkout reached through a symlink is also preserved.
- Clone/checkout failures propagate. A partial checkout may remain for inspection; setup does not delete it or silently repair it. Inspect/save any work and deliberately resolve the conflict before retrying. Do not run concurrent installers at the same destination.

This is not a generic repository manager or a second package manifest. No authentication, global Git-config modification or user-project command is part of provisioning. Git-fuzzy itself can perform Git mutations and source project configuration when you subsequently use it; run it only in trusted repositories.

## User-activated runtime follow-up

The [initial live runtime check](yabai-runtime-acceptance.md) found unsupported Yabai commands and unresolved key collisions. The subsequent [fresh desktop-stage check](desktop-fresh-acceptance.md) fixes those issues and verifies real native deployment, explicit service setup, manual Accessibility approval, tiling/focus/swap, **Option–Shift–0 rebalance** and **Option–T floating/tiling**, including clean teardown and no new daemon errors. Run `skhd --reload` after editing its repository-backed config; do not restart a working daemon merely to load changes. Mise can orchestrate activation commands, but cannot silently grant normal macOS Accessibility consent. The current default desktop task still does not activate services.

## Verification and limits

Host-safe tests exercise the public installer commands with controlled Homebrew/network boundaries and real local Git fixtures: repeat runs, preserved dirty/different-revision checkouts, filesystem conflicts, interrupted checkout, custom bin paths, native declarations, installation failures and opt-in separation. No host package installation or service integration is part of these tests.

Separately, the disposable Sequoia ARM64 guest ran the **actual mise tasks**: fresh/repeated desktop installation, exact upstream Git checkout and repeat, managed PATH discovery, a real fzf-filtered menu, and a real PTY menu followed by Escape cancellation. Normal-account config/LaunchAgent hashes and daemon-process snapshots remained unchanged. Native Homebrew installation uses the guest's prefix; the Git helper and Homebrew user state were isolated in a temporary guest HOME. These explicit provisioning checks are not silently added to `verify:vm`.

Checkpoint suite: **119 host passes /58 opt-in skips**, **176 VM passes /one iTerm GUI skip**, 177 tests in 17 files, plus Bash 3.2/syntax/ShellCheck/Brewfile/actionlint/whitespace checks. Raw evidence is private under the path referenced by `~/Library/Caches/dotfiles-vm/last-optional-tools.path`.

At the binary-provisioning checkpoint, no host rollout, running legacy-service migration, real hotkey/window-management acceptance, permission grants, Intel execution, published bootstrap or hosted-CI success was claimed. The subsequent live check above establishes only its named Yabai operations; the fresh follow-up accepts only its named common keyboard/window operations after manual consent, not every binding or unattended activation.

Primary references: [Yabai installation](https://github.com/asmvik/yabai/wiki/Installing-yabai-(latest-release)), [upstream formulas](https://github.com/asmvik/homebrew-formulae), [skhd installation/configuration](https://github.com/asmvik/skhd), [git-fuzzy at the selected revision](https://github.com/bigH/git-fuzzy/tree/36fc08f084a0cabf3e381dbbbce8e3a1a22fbaa4). The reviewed Homebrew Bundle implementation's `formula_installed?`/`no_upgrade` handling supplies the legacy-rack behavior; fresh and repeated current-tap installation were executed, not a host legacy migration.
