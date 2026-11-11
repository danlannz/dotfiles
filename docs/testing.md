# Verification

## Ordinary checks — safe on an existing machine

With Bun, mise, Bash, Zsh, Ruby, ShellCheck and Git already available:

```sh
mise run verify
```

This runs the regression suite and `lint` from the checkout, independent of the caller's working directory. It does **not** deploy files, restore agents/settings, install runtimes/apps, open iTerm or change preferences. Task auto-install is disabled. The task clears `DOTFILES_TEST_ROOT`, `DOTFILES_TEST_MISE_BIN` and `DOTFILES_ITERM_FIRST_LAUNCH`, so inherited opt-ins cannot turn an ordinary check into a VM/GUI test. Missing prerequisites or a failed test/lint command fail verification; checks are not silently skipped to make the task pass.

`mise run lint` checks each shell file separately in its correct dialect, both Brewfiles with Ruby, error-level ShellCheck and Git whitespace. Bootstrap and `script/setup` declare and are checked with Bash, including macOS's system Bash 3.2; they are not POSIX-sh scripts. The PATH fragment additionally gets a POSIX `sh -n` check, and ShellCheck covers both `.path` and `.functions`.

Without mise, `bun test` remains the ordinary regression command. It does not download mise or runtimes. Do not install or activate mise on the host solely to test this worktree; host promotion needs separate approval.

## Bootstrap entry-point checks

Bootstrap now declares `/bin/bash`, and the README's download command explicitly invokes Bash. A failed `curl` must fail the outer command rather than executing an empty installer; optional arguments after the final `--` reach bootstrap unchanged.

Tests execute the actual file without an interpreter override and execute the exact README command with a controlled download. Only OS/package/network boundaries are replaced, with a fail-closed sudo executable if a shell drops the exported mocks. They cover interpreter selection, successful download execution, download failure and argument forwarding. A bare executable invocation with `--unknown` also exits **2** in the disposable macOS guest before privileged work. These checks do **not** validate the unpublished branch through the remote `master` URL, or rerun privileged provisioning on the host.

## Continuous integration

[`.github/workflows/verify.yml`](../.github/workflows/verify.yml) defines push, pull-request and manual checks with read-only repository permissions, SHA-pinned checkout/mise actions, no persisted checkout credentials and a 25-minute deadline. It uses the ARM64 `macos-15` image, with an explicit architecture assertion; Intel execution remains separate.

The mise action installs the tested **2026.11.2** engine and checks its executable against the published release SHA-256. This is a binary integrity check, not independent signature verification. Runtime versions are **not duplicated in workflow inputs**: temporary mise config/lock/early-policy links point to the production declarations, and dependencies are installed with `mise install --locked` plus native executable checks. ShellCheck is installed on the ephemeral runner only if missing. No normal-home dotfile deployment, Brewfile bundle, privileged bootstrap, account/cloud restore or VM/GUI task runs in CI. The last step is the same host-safe `mise run verify` command used locally.

The workflow was validated with **actionlint 1.7.12** and a Bun policy test. The public entry-point tests and full VM suite pass on Sequoia ARM64. A real GitHub-hosted workflow run remains pending publishing this branch; a workflow file and local lint are not evidence of a green remote CI run.

Primary references: [mise action inputs/source](https://github.com/jdx/mise-action/tree/5228313ee0372e111a38da051671ca30fc5a96db), [mise 2026.11.2 assets](https://github.com/jdx/mise/releases/tag/v2026.11.2), [runner image/architecture labels](https://github.com/actions/runner-images#available-images).

## Native integration — prepared disposable macOS VM only

```sh
mise run verify:vm
```

This separate task requires Apple-virtualized macOS hardware, explicit `DOTFILES_TEST_ROOT`/`DOTFILES_TEST_MISE_BIN`, a private HOME and matching private mise directories. The private global config/lock/early-policy files must point to this checkout's production `mise/config.toml`, `mise/mise.lock` and `mise/miserc.toml`. Native executable resolution must succeed before tests run. There is no fixed VM UUID, IP, username or cache path in the task.

Prepare the fixture explicitly **inside the disposable guest**, from its reviewed checkout. This example creates only a new private test directory; it is not a replacement bootstrap:

```bash
(
  repo="$(pwd -P)"
  mise_bin="$(command -v mise)"
  root="$(mktemp -d "${TMPDIR:-/tmp}/dotfiles-tests.XXXXXX")"
  mkdir -p "$root"/{bin,home,config,data,cache,state}
  ln -s "$mise_bin" "$root/bin/mise"
  ln -s "$repo/mise/config.toml" "$root/config/config.toml"
  ln -s "$repo/mise/mise.lock" "$root/config/mise.lock"
  ln -s "$repo/mise/miserc.toml" "$root/config/miserc.toml"
  export DOTFILES_TEST_ROOT="$root" DOTFILES_TEST_MISE_BIN="$root/bin/mise"
  export HOME="$root/home" MISE_CONFIG_DIR="$root/config" MISE_DATA_DIR="$root/data"
  export MISE_CACHE_DIR="$root/cache" MISE_STATE_DIR="$root/state"
  export PATH="$root/bin:$PATH" CI=1
  unset XDG_CONFIG_HOME XDG_DATA_HOME XDG_CACHE_HOME XDG_STATE_HOME PI_CODING_AGENT_DIR

  "$root/bin/mise" trust "$repo/mise.toml"
  "$root/bin/mise" -C "$HOME" install --locked
  "$root/bin/mise" -C "$HOME" reshim
  "$root/bin/mise" -C "$repo" run verify:vm
)
```

Keep the fixture HOME outside the real account's HOME so ancestor discovery cannot load that account's unrelated mise configuration. Retired Node/Yarn compatibility fixtures no longer need legacy downloads. Runtime tests compile/run small JVM programs, verify `JAVA_HOME`, native shims, attested Python policy, Python native-library imports/venv isolation and strict interrupted-install handling; they do not establish Gradle/IDE or Python application compatibility. See [language cutover](language-runtime-cutover.md).

Pi integration also checks the locked standalone executable without PATH Node, native package registration/backups/preservation, SDK extension and prompt discovery/reload, theme discovery in the native config selector, and project settings precedence. A temporary native Node 24 project checks that Pi shell commands retain the modern project runtime; it may download Node 24 into private mise data on a cold cache. This is not a legacy Node compatibility gate. No model requests, authentication or MCP connections are made. See [Pi setup](../agents/pi/README.md) for scope.

The VM must already have the font/system prerequisites supplied by the regular Brewfile. Integration tests intentionally exercise native deployment/runtime installers in temporary fixtures; cold fixture caches can require downloads. Preference tests use dedicated synthetic domains, because CFPreferences is tied to the OS user, **not** an overridden HOME. These tests must not run on the host. Existing/default user preferences, account login, cloud restore and whole-machine provisioning are not part of this task.

After an interrupted download, inspect native `mise which` diagnostics. Repair only the known damaged version in the private test data if necessary; do not erase runtime directories or add deployment `--force` to make tests pass. Tests check actual executable ownership, not just matching versions.

## GUI acceptance is separate

In the normally provisioned guest account, with an unlocked GUI and iTerm quit:

```sh
DOTFILES_ITERM_FIRST_LAUNCH=1 bun test tests/terminal-first-launch.test.ts
```

This explicitly opens iTerm normally and checks automatic default selection and GUID collisions without choosing a profile. OS/app consent dialogs may need a human response. Both normal verification tasks clear this GUI opt-in. A relaunch check is not an untouched first-account provisioning result; record that distinction. See [terminal evidence and limits](terminal-setup.md).

## Shell startup checks

Shell fixtures source the actual managed rc/path/functions in temporary homes, with external framework/tool boundaries replaced. They cover one completion pass, early path/fpath availability, absent optional tools, lazy correction initialization/failure, tty-aware GPG, inherited settings, guarded SDK/Go/Homebrew paths and the ignored local override. PTY tests do not source the developer's live rc or invoke its GPG tools.

The real guest rc/Oh My Zsh was separately measured before/after with the same PTY protocol, and a functional PTY check preserves Agnoster/fzf and mise Node/Bun provenance/switching. Latest real-shell language checks additionally verify the upgraded Java/Kotlin/Python defaults with both private and normal guest runtime data. Timing instrumentation stays outside Git and production startup. See [shell setup](shell-setup.md) for the measurements and scope; they are not a universal performance threshold or an iTerm GUI assertion.

## Latest checkpoint

Pi provisioning/native configuration: **106 host passes /58 opt-in skips**, **163 VM passes /one iTerm GUI skip**, 164 tests across 15 files. Real normal-guest `agents` installation/registration and repeat also pass without changing the curated skill lock. The native Pi config-selector PTY is resource-discovery evidence, not iTerm GUI visual acceptance. Hosted CI/publication and host rollout remain separately gated.

Optional-tools follow-up: **119 host passes /58 skips**, **176 VM passes /one iTerm GUI skip**, 177 tests/17 files. Ordinary tests use a controlled Brew boundary and real synthetic Git repositories; they never install desktop packages or fetch the real Git helper. Explicit real guest provisioning and PTY-menu checks are recorded in [optional tools](optional-tools.md), not run implicitly by either verification task. Lint now includes both optional installer scripts and `Brewfile.desktop`.

Fresh desktop/config follow-up: **123 host passes /58 skips**, and **123/58** for ordinary `verify` in the new guest, 181 tests/18 files. Four configuration regressions cover supported/fail-fast Yabai settings, unambiguous habitual shortcuts and centering only floating windows. Separate [fresh GUI acceptance](desktop-fresh-acceptance.md) passes twelve live checks through the running services after manual OS consent; lock guards, temporary idle assertion and explicit native skhd reload prevent false keyboard conclusions. No new ordinary-suite GUI or service activation is introduced. The preceding full VM-suite counts are historical, not a rerun of this fresh-stage checkpoint. Lint now also checks the actual `.yabairc` in POSIX sh and ShellCheck.

M11 security/authorization follow-up: **152 host passes /58 skips**, 210 tests/18 files; ordinary guest verification uses the same safe suite. Public-bootstrap fixtures control all mutation/credential/package seams. A separate real-sudo guest PTY run observed one initial password prompt, native refresh during 75 seconds of work, cleanup and cache invalidation. Native security queries returned attention (2) with unchanged disabled states; changing firewall/encryption/update operations were not run. See [provisioning security](provisioning-security.md) for the distinction between simulated actions, native authorization and actual security acceptance.

## Historical pilot

The duplicate pilot TOML/lock and pilot-specific environment names were retired. Its [archived README](../mise/pilot/README.md) and [original results](mise-pilot-results.md) retain the experiment's evidence; Git commit `1831bdf` retains the exact original files. The current tests use the production configuration as the only runtime declaration.
