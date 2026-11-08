# Verification

## Ordinary checks — safe on an existing machine

With Bun, mise, Bash, Zsh, Ruby, ShellCheck and Git already available:

```sh
mise run verify
```

This runs the regression suite and `lint` from the checkout, independent of the caller's working directory. It does **not** deploy files, restore agents/settings, install runtimes/apps, open iTerm or change preferences. Task auto-install is disabled. The task clears `DOTFILES_TEST_ROOT`, `DOTFILES_TEST_MISE_BIN` and `DOTFILES_ITERM_FIRST_LAUNCH`, so inherited opt-ins cannot turn an ordinary check into a VM/GUI test. Missing prerequisites or a failed test/lint command fail verification; checks are not silently skipped to make the task pass.

`mise run lint` checks each shell file separately in its correct dialect, both Brewfiles with Ruby, error-level ShellCheck and Git whitespace. `script/setup` is checked with Bash, not the obsolete pilot's sh check. Bootstrap's historical `/bin/sh` shebang/Bash-syntax mismatch remains a separate audit item; syntax checking it as Bash is not proof the published shell command is portable.

Without mise, `bun test` remains the ordinary regression command. It does not download mise or runtimes. Do not install or activate mise on the host solely to test this worktree; host promotion needs separate approval.

## Native integration — prepared disposable macOS VM only

```sh
mise run verify:vm
```

This separate task requires Apple-virtualized macOS hardware, explicit `DOTFILES_TEST_ROOT`/`DOTFILES_TEST_MISE_BIN`, a private HOME and matching private mise directories. The private global config/lock must point to this checkout's production `mise/config.toml` and `mise/mise.lock`. Native executable resolution must succeed before tests run. There is no fixed VM UUID, IP, username or cache path in the task.

Prepare the fixture explicitly **inside the disposable guest**, from its reviewed checkout. This example creates only a new private test directory; it is not a replacement bootstrap:

```bash
(
  repo="$(pwd -P)"
  mise_bin="$(command -v mise)"
  root="$(mktemp -d "$HOME/Library/Caches/dotfiles-tests.XXXXXX")"
  mkdir -p "$root"/{bin,home,config,data,cache,state}
  ln -s "$mise_bin" "$root/bin/mise"
  ln -s "$repo/mise/config.toml" "$root/config/config.toml"
  ln -s "$repo/mise/mise.lock" "$root/config/mise.lock"
  export DOTFILES_TEST_ROOT="$root" DOTFILES_TEST_MISE_BIN="$root/bin/mise"
  export HOME="$root/home" MISE_CONFIG_DIR="$root/config" MISE_DATA_DIR="$root/data"
  export MISE_CACHE_DIR="$root/cache" MISE_STATE_DIR="$root/state"
  export PATH="$root/bin:$PATH" CI=1
  unset XDG_CONFIG_HOME XDG_DATA_HOME XDG_CACHE_HOME XDG_STATE_HOME PI_CODING_AGENT_DIR

  "$root/bin/mise" trust "$repo/mise.toml"
  "$root/bin/mise" -C "$HOME" install --locked
  # Prepare project versions outside the individual tests' bounded deadlines.
  "$root/bin/mise" -C "$HOME" install node@16 node@18 node@18.14.2 pnpm@7.27.1
  "$root/bin/mise" -C "$repo" run verify:vm
)
```

The VM must already have the font/system prerequisites supplied by the regular Brewfile. Integration tests intentionally exercise native deployment/runtime installers in temporary fixtures; cold fixture caches can require downloads. Preference tests use dedicated synthetic domains, because CFPreferences is tied to the OS user, **not** an overridden HOME. These tests must not run on the host. Existing/default user preferences, account login, cloud restore and whole-machine provisioning are not part of this task.

After an interrupted download, inspect native `mise which` diagnostics. Repair only the known damaged version in the private test data if necessary; do not erase runtime directories or add deployment `--force` to make tests pass. Tests check actual executable ownership, not just matching versions.

## GUI acceptance is separate

In the normally provisioned guest account, with an unlocked GUI and iTerm quit:

```sh
DOTFILES_ITERM_FIRST_LAUNCH=1 bun test tests/terminal-first-launch.test.ts
```

This explicitly opens iTerm normally and checks automatic default selection and GUID collisions without choosing a profile. OS/app consent dialogs may need a human response. Both normal verification tasks clear this GUI opt-in. A relaunch check is not an untouched first-account provisioning result; record that distinction. See [terminal evidence and limits](terminal-setup.md).

## Historical pilot

The duplicate pilot TOML/lock and pilot-specific environment names were retired. Its [archived README](../mise/pilot/README.md) and [original results](mise-pilot-results.md) retain the experiment's evidence; Git commit `1831bdf` retains the exact original files. The current tests use the production configuration as the only runtime declaration.
