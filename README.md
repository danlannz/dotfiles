## Dotfiles

---

My OSX dotfiles

Run the following command in a terminal to bootstrap a new machine

```sh
/bin/bash -c 'bootstrap="$(curl -fsSL https://raw.githubusercontent.com/danlannz/dotfiles/master/bootstrap.sh)" && /bin/bash -c "$bootstrap" bootstrap.sh "$@"' --
```

Bootstrap requires Bash (including macOS's system `/bin/bash`), not POSIX `sh`. The outer Bash command stops if the download fails; the inner Bash runs only a successful download. Optional `--debug` / `--app-store` flags go after the final `--`.

### App Store apps

Sign in to the **App Store** during new-device setup if you want to install these apps immediately. With this version checked out, opt in during bootstrap:

```sh
/bin/bash ~/.dotfiles/bootstrap.sh --app-store
# Add --debug if needed; option order does not matter.
```

Without `--app-store`, bootstrap installs the regular `.Brewfile` and defers App Store apps. After signing in, retry **only** those apps:

```sh
~/.dotfiles/script/setup-app-store
```

The retry uses the separate native `Brewfile.app-store`, checks for missing apps, and does not upgrade existing apps or rerun security settings, linking, or post-install hooks. Failed installs return a failure status; rerunning after sign-in retries missing apps, while a satisfied manifest is a no-op. Current `mas` cannot reliably report account status, so neither command attempts to detect login or handle credentials. Xcode remains conditional on the host macOS version.

The remote command above uses published `master`; these local changes are unavailable there until published.

### Deployment and runtime ownership

The migration branch replaces the destructive linker with explicit native mise declarations. It requires **mise >= 2026.11.2**; bootstrap installs that prerequisite before linking the Brewfile. Existing files/directories cause a visible conflict rather than being deleted. Native symlinks can be repointed without deleting their old targets.

See [safe deployment and runtime cutover](docs/mise-deployment.md) for preview/apply commands, rollback considerations and VM evidence. Those commands apply the invoking checkout to the user's HOME: do not run them on the host just to test a branch.

Mise owns pinned **Node/Bun/Java/Kotlin/Python** defaults and project Node/pnpm selection. Native shims supplement full interactive activation; early mise policy preserves but ignores retired global asdf selectors. The asdf provisioning/activation declarations are retired, without uninstalling existing tools. Legacy Node/Yarn compatibility is no longer a maintenance requirement. No installed runtimes or project files are deleted; Go/Rust/uv remain Brew-owned. See [language cutover](docs/language-runtime-cutover.md) for the migration/upgrade checkpoints and limits. npm stays bundled with the pinned Node.

### Shell setup

The Oh My Zsh installer runs with `--unattended --keep-zshrc`: it preserves existing `.zshrc` files/symlinks, does not change the login shell, and does not launch an interactive shell. Missing custom plugins are repaired on reruns; existing plugin directories are left alone. Oh My Zsh download/installer and plugin-clone failures stop the hook.

Shell/framework, Bun completion, Docker completion, and per-user tool paths use `$HOME`, not a machine-specific account directory. Open a new terminal tab (or run `exec zsh -l`) after updating shell configuration. The managed **Dotfiles** iTerm profile uses 12-point Meslo Nerd Font Mono and the existing dark palette. A new profile-less installation gets a usable default; existing profiles/default choices are preserved. See [terminal setup](docs/terminal-setup.md) for selection, editing and verification limits.

Managed paths and existing Docker completion directories are available before Oh My Zsh's single completion initialization. GPG agents start on demand, command correction initializes only when used, and optional `~/.zshrc.local` supplies user-owned overrides before final mise activation. SDK/library settings are no longer injected into every shell. See [shell startup and PATH ownership](docs/shell-setup.md) for scope, compatibility and measured guest startup results.

### iTerm profile

The maintained font cask is in `.Brewfile`; mise seeds native, editable iTerm JSON without replacing custom files or neighbouring profiles. There is no iCloud dependency or unchecked font download.

On an existing installation, select **Dotfiles** in iTerm Settings and set it as default if desired. Or, with iTerm quit, explicitly run `mise -C ~/.dotfiles run terminal-default` from another terminal. Normal setup never changes an existing default or restarts iTerm. These are deployment commands, not commands to run on the host merely to test the worktree.

### Coding agents

See [agents/README.md](agents/README.md) for the shared Pi/Claude Code configuration. Custom `local-*` skills are tracked in `agents/skills/`; upstream skills are ignored and restored from the native lockfile. Bootstrap's native mise tasks strictly install the locked runtime defaults before running the existing agent module through managed Bun. The module links both agents, restores missing skills, and validates the collection. Mise also supplies pinned standalone **Pi 1.5.0**; the agents task registers the [native Pi package](agents/pi/README.md) for shared extensions, prompts and themes, while preserving machine-local preferences, credentials and sessions. Add resources using Pi conventions and `/reload`; no second skill inventory or custom settings format is introduced.

### Optional desktop and Git tools

After regular bootstrap, explicitly select `mise -C ~/.dotfiles run desktop` for missing Yabai/skhd binaries or `mise -C ~/.dotfiles run git-fuzzy` for the pinned Git helper. Neither runs by default or changes desktop configuration, starts services, grants permissions or replaces existing checkouts. These are provisioning commands, not host-safe branch checks. See [optional tools](docs/optional-tools.md) for preservation rules and [fresh desktop acceptance](docs/desktop-fresh-acceptance.md) for native config/service setup, the required manual Accessibility step and tested Option–Shift–0/Option–T behavior. Use `skhd --reload` after changing its linked config; mise cannot silently grant macOS Accessibility consent.

### Cloud settings

Default setup defers Mackup restoration so an old backup cannot silently undo the deployed shell settings. After signing in and reviewing the backup, run `mise -C ~/.dotfiles run restore-settings` explicitly. Failures are reported; real account-dependent restoration is not tested in credential-free guests.

### Verification

With existing tooling, `mise run verify` runs host-safe tests and lint without provisioning or enabling VM/GUI tests. `mise run lint` runs only syntax/lint checks. `bun test` remains available without mise.

Native integrations use the separate `mise run verify:vm` task in a prepared disposable macOS guest; GUI launch acceptance is a further explicit opt-in. See [testing](docs/testing.md) for prerequisites and isolation. The original pilot task/config/lock are retired, not production setup dependencies.

### Modernisation

The [living backlog](docs/modernisation-backlog.md) tracks the original audit, completed fixes, remaining safety/UX work and the mise adoption sequence. Original VS Code, credential-management and macOS-defaults TODOs are retained there.

See the [original audit](docs/dotfiles-audit.md), [mise fit review](docs/mise-fit-review.md), and [VM results](docs/utm-bootstrap-results.md) for evidence and limits. The [remaining runtime/package ownership inventory](docs/runtime-package-ownership.md) records local requirements, global CLI gaps and proposed optional boundaries without changing installed tools.

The [original isolated pilot](mise/pilot/README.md) and its [results](docs/mise-pilot-results.md) record the first Node/Bun/task experiment. The subsequent [deployment implementation](docs/mise-deployment.md) adds native file deployment and runtime cutover on an isolated worktree. Neither has been applied to the host merely by editing/testing the branch.
