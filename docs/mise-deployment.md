# Safe deployment and runtime cutover

## Status and ownership

Implemented on the isolated `chore/mise-deployment` worktree, not applied to the host. The host's startup-file symlinks still point into the original checkout. Tests that use actual mise run only in the disposable ARM macOS guest, with a private HOME/config/cache/state and mise-owned runtime data.

| Resource | Owner after this cutover |
| --- | --- |
| Explicit home dotfiles and mise config/lock links | Root `mise.toml`, applied through `script/setup`. |
| Default Node 26.13.0 and Bun 1.4.4 | `mise/config.toml` and native `mise/mise.lock`. |
| npm | The pinned Node release's bundled npm **11.20.0**; no rolling `--latest-npm` mutation. The old NVM default had separately upgraded npm 12.2.1. |
| Project Node/pnpm | Existing `.nvmrc`, `.node-version` and `.tool-versions` requirements, interpreted by mise. No project files rewritten. |
| Legacy Java/Kotlin/Python | Existing asdf configuration and activation, deliberately retained. |
| Go, Rust, uv, CocoaPods and regular apps | Brewfiles, unchanged ownership. Supporting a language in mise is not itself a reason to remove its current toolchain/package manager. |
| Agent collection, instructions and five shared links | Existing `agents/setup.ts` and native skill lockfile; mise only supplies Bun/Bunx and task ordering. |
| Cloud restoration | Explicit `restore-settings` task; never part of default deployment or shell setup. |

Mise's native `enable_tools` setting limits this stage to Node/Nodejs, Bun and pnpm. It will not accidentally adopt the Java/Kotlin/Python versions in the existing global `.tool-versions`, or other installed language toolchains. Expand that allowlist only as their migrations are verified.

The Brewfile adds `mise` and removes `nvm`, direct Brew Bun, the now-unneeded Bun tap and `ruby-build`. There was no rbenv declaration. The Ruby audit found no `.ruby-version` files in the development tree or global config, and no installed rbenv versions. This is removal of unused **installation declarations**, not a claim of Ruby migration or an uninstall. Existing NVM/asdf/rbenv directories, global packages and runtime installations remain untouched.

## Deployment interface

Requires **mise >= 2026.11.0**. After refreshing Homebrew metadata, bootstrap ensures the mise provider with a targeted `brew install mise` before invoking deployment, including when a mise binary already exists. Homebrew can upgrade an outdated prerequisite; relying only on `command -v` would strand old engines before Bundle could upgrade them. An existing local checkout can be deployed when the GitHub availability probe is offline. Hook stderr remains visible, including native conflict diagnostics.

For an older existing mise, update the Homebrew metadata and **only** that prerequisite first: `brew update && brew upgrade mise`. The VM's deliberately stale cached metadata initially installed 2026.10.25; the metadata refresh and targeted upgrade delivered 2026.11.0. Do not work around the minimum version by disabling validation.

The public commands below **apply this checkout to the invoking user's HOME**. Do not run them on the host merely to test a branch:

```sh
script/setup --dry-run
script/setup
mise -C "$PWD" run runtimes
mise -C "$PWD" run agents
```

`script/setup` trusts only the checkout's reviewed root declaration, runs a native dry-run preflight, then delegates to native `mise dot apply`. The preflight catches ordinary file conflicts before native self-configuration can link a new global config; a failed-before-fix regression covers that otherwise-partial change. The preview does not write destination links, though mise can initialise its own trust/cache state. There is no hidden-file enumeration, file deletion, automatic adoption/history, `--force`, pruning or second inventory.

Native behaviour, verified in the guest:

- Absent targets become symlinks; correct links stay correct on repeat runs.
- An existing real file or directory is a conflict and survives unchanged. An existing real mise config blocks the self-configuration phase before the ordinary home links are applied.
- Wrong/broken symlinks are repointed. Their old targets are **not** deleted. This is native mise semantics, not a promise that existing symlink destinations remain active.
- Mise applies its own config first and reloads it. A regression verifies that unrelated retired dotfile rules in an old global-config symlink are not applied after that replacement.
- Native target variants honour `MISE_CONFIG_DIR`/XDG config placement. The global lockfile is linked alongside the global config, as required by mise's symlinked-global-config lockfile behaviour.
- Only the 12 listed dotfiles and two mise files are deployed. Repository metadata, worktrees and agent directories are not implicitly linked. `.macos` is linked, **not executed**.

If there is a conflict, review it and make an intentional backup/migration before retrying. Do not add `--force` to make setup pass. Deployment is not a transaction with universal rollback, especially across native self-configuration phases.

## Strict runtime stage

The `runtimes` task disables task auto-install, checks that this checkout's global config **and** lockfile are deployed, and explicitly invokes native `mise install --locked` before the dependent `agents` task can execute Bun. A missing or incomplete lockfile fails even when matching tools already exist elsewhere on PATH. This avoids the raw-exec fallback found in the original pilot; executable provenance is also tested.

A fresh bootstrap installs the default tools, **not every old project's versions or global npm packages**. Existing NVM/asdf installations are not shared with mise. On first use of each project, run `mise install` there, then verify its selected versions; do not treat an already-installed legacy runtime as a completed project cutover.

Only this global configuration root is locked with `tool_config.locked`. Existing projects keep their own policy; they do not suddenly need a new project lockfile just to use an old `.nvmrc`. The native lock includes ARM64, Intel and Intel-baseline Bun download metadata/checksums. **Actual execution is verified on ARM64 only**; Intel metadata is not an Intel machine test.

The original `mise/pilot/` is a separate historical experiment, not the production defaults' second authority. Update the production defaults and regenerate their native global lock with `mise lock --global`; do not hand-edit checksums.

## Cloud restoration

Default `script/after-setup` explicitly defers Mackup so a cloud backup cannot silently undo newly deployed shell files. After signing in and reviewing what the backup owns, invoke separately:

```sh
mise -C ~/.dotfiles run restore-settings
```

That task runs the actual `mackup restore` with native `raw` terminal I/O for interactive prompts, and reports failure. Restoring can overwrite repo-owned shell/app settings; review the results rather than force-applying dotfiles afterwards. A mocked failure checks propagation/diagnostics, **not** actual signed-in restoration. App Store opt-in/retry remains independent.

## Promotion gate

Do not deploy the host from a temporary worktree. **Merging into the original checkout already changes the files behind the live startup symlinks**; it is part of host rollout, not harmless Git housekeeping. With explicit approval, stage the mise prerequisite and runtime/config introduction in the durable checkout before switching shell activation, then verify the transition and a new login shell. Review/commit and plan that promotion separately rather than blindly merging and opening a new terminal. Do not automatically remove old manager data or global packages; they remain rollback material.

## Verification and limits

Final branch verification: **99 tests pass in the guest** with the real mise CLI. Ordinary host runs pass **80 tests**, with **19 opt-in CLI integration cases skipped**. Individual shell/Brewfile syntax, error-level ShellCheck (including the new linker wrapper) and whitespace checks pass. These counts are not a whole-machine bootstrap result.

- The ordinary host suite runs only isolated fixtures; actual mise cases are opt-in. No host provisioning/runtime activation was performed.
- Guest integration covers real native file deployment, reruns, preview, file/directory conflicts, wrong/broken links, config-directory overrides, self-configuration reload, strict missing/incomplete-lock failures and executable ownership.
- Legacy Node 16 and 18 were actually installed/run through mise. A project with **both** `.nvmrc = 18` and `.tool-versions` selecting **Node 18.14.2 / pnpm 7.27.1** kept the exact versions and unchanged files. These old Node majors are EOL: upgrading the projects is separate work, not something to hide inside this migration.
- The actual native `agents` task restored a deliberately missing skill through Bunx and validated all five private links; repeat runs found zero missing skills. This is structural validation, not upstream-content hash verification or a fresh fetch of all thirty skills.
- Actual fresh Oh My Zsh/plugin installation and a repeated post-install hook succeeded in the private guest HOME, preserving the managed rc and deferring cloud restoration.
- A real PTY login shell loaded the actual rc, Oh My Zsh and Agnoster, selected mise Node/Bun/Bunx, switched Node **26.13.0 → 16.20.2 → 26.13.0** on directory changes, and retained the asdf plugin without the NVM plugin.
- The guest installed/upgraded the Homebrew mise prerequisite and passed the new regular native Bundle check. No legacy runtimes were uninstalled. Its normal user configuration was not cut over.
- Whole privileged bootstrap, the exact published remote command, real account-dependent installs/restoration and Intel execution are still **not** end-to-end verified. iTerm profile/default-font delivery remains the next stage.

Primary native-feature references are pinned to [managed files](https://github.com/jdx/mise/blob/v2026.11.0/docs/dotfiles/managed.md), [lockfiles](https://github.com/jdx/mise/blob/v2026.11.0/docs/dev-tools/mise-lock.md), [settings](https://github.com/jdx/mise/blob/v2026.11.0/settings.toml) and [task configuration](https://github.com/jdx/mise/blob/v2026.11.0/docs/tasks/task-configuration.md). The [Homebrew formula](https://formulae.brew.sh/formula/mise) supplies the CLI, not our runtime inventory.

Raw evidence remains private under `~/Library/Caches/dotfiles-vm/mise-deployment-*`; the guest source is a separate sanitised bundle clone with explicit overlays, not a host mount. See the [living backlog](modernisation-backlog.md) for remaining work and rollout gates.
