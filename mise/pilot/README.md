# Isolated mise pilot

This is the first migration experiment, **not** the machine's global mise configuration. Do not activate it globally, run provisioning on the host, remove NVM/asdf, or change Brewfile runtime ownership yet. The [living backlog](../../docs/modernisation-backlog.md) remains the migration checklist.

## What is here

- `mise.toml`: reviewed Node 26.13.0 and Bun 1.4.4, plus a named `verify` task.
- `mise.lock`: native mise-generated backend/URL/checksum records for **macOS ARM64 only**. Additional platforms need their own reviewed lock entries and verification.
- `../../tests/mise-pilot.test.ts`: opt-in real-CLI integration checks. Matching versions are insufficient: executables must come from the isolated mise installation directory, not existing Brew/NVM runtimes.

The tested CLI is **mise v2026.11.0**. Its macOS ARM64 tarball was checked against the GitHub release asset SHA-256 before guest execution:

```text
9c3678b20515f091208b3a2a9900bbc5ab7f228a1c5893849f0f2939b1829df3
```

This is release-download integrity verification, not a claim of independent signature verification of the mise executable.

## Prepared guest layout

The VM-only test uses a private root under the disposable guest's caches:

```text
$PILOT_ROOT/
  bin/mise                 # pinned CLI, never added to the user's normal PATH
  source/                  # sanitised checkpoint checkout plus explicit pilot overlays
  home/                    # isolated HOME, including test-only agent links and shell rc
  config/ data/ cache/ state/
```

The checkout's Git remote is a transferred local bundle, not the host checkout. No host home, keys, account credentials or private runtime configuration are mounted/copied. Existing VM dotfiles, NVM/Brew runtimes, terminal preferences and live agent links remain unchanged.

## Run in that prepared guest

These are verification commands, **not** a replacement first-Mac installer. `PILOT_ROOT` must already identify the prepared private guest directory and contain the current working-source overlays; the published branch may not yet contain this pilot.

Use a subshell so even the invoking guest shell retains its normal environment:

```sh
(
  : "${PILOT_ROOT:?Set this to the prepared disposable-guest pilot directory}"
  export DOTFILES_MISE_PILOT_ROOT="$PILOT_ROOT"
  export DOTFILES_MISE_PILOT_BIN="$PILOT_ROOT/bin/mise"
  export HOME="$PILOT_ROOT/home"
  export MISE_CONFIG_DIR="$PILOT_ROOT/config"
  export MISE_DATA_DIR="$PILOT_ROOT/data"
  export MISE_CACHE_DIR="$PILOT_ROOT/cache"
  export MISE_STATE_DIR="$PILOT_ROOT/state"
  export PATH="$PILOT_ROOT/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
  unset XDG_CONFIG_HOME XDG_DATA_HOME XDG_CACHE_HOME XDG_STATE_HOME PI_CODING_AGENT_DIR
  cd "$PILOT_ROOT/source/mise/pilot"

  # Explicitly trust only this reviewed configuration, including after edits.
  "$DOTFILES_MISE_PILOT_BIN" trust "$PWD/mise.toml"
  "$DOTFILES_MISE_PILOT_BIN" install --locked
  "$DOTFILES_MISE_PILOT_BIN" run verify
)
```

`verify` checks the isolation variables before its explicit locked install, then runs the regression suite, checks each shell file's syntax, checks both Brewfiles, runs error-level ShellCheck, and checks Git whitespace. Task auto-install is disabled so mise cannot install tools before the guard runs. The guard is pilot/test isolation, not a new production provisioning framework.

Ordinary `bun test` does **not** download mise or runtimes. It runs the existing 69 tests and reports the two mise integration cases as skipped unless the private binary/environment is explicitly provided. Within the prepared pilot, all 71 cases run.

## Observed results

- Actual downloaded mise-owned Node/Bun pass noninteractive executable-provenance checks.
- `mise run verify` passes **71 tests** plus syntax/lint checks. Its task directory is independent of the caller's cwd.
- A repeated `mise install --locked` installs zero tools.
- Bundled npm works: **11.20.0**, versus the existing NVM setup's separately upgraded npm 12.2.1. No npm upgrade was performed by the pilot; decide whether a separate npm pin is needed before cutover.
- `bunx --bun skills@1.7.4 --version` resolves the actual existing skills CLI through mise-managed Bun.
- The existing agent module passed dry-run, actual one-skill restoration and validation in the private HOME. Twenty-nine managed skills were seeded from the guest's existing collection; `caveman` was deliberately missing and fetched by the real CLI. All five links point into the isolated checkout. A second run found zero missing skills and preserved those links. This is not a fresh download test of all thirty skills.
- A minimal **private** zsh rc activated mise in a PTY and selected Node/Bun/Bunx from private mise data. This tests activation, not a cutover of the user's actual Oh My Zsh configuration.
- Missing isolation opt-in and missing lockfile both make `verify` fail before tests/command fallback. Existing host/global guest configuration was not migrated.

## Two important findings

1. **Trust must be tested interactively.** The first interactive probe rejected the untrusted/edited config and fell back to the existing Node. An explicit trust of the final reviewed file fixed it. Successful CI/exec checks are not sufficient evidence of interactive activation.
2. **Do not treat raw `mise exec` as a lockfile gate.** With v2026.11.0, our missing-lock probe warned but could execute the existing Brew runtime. In contrast, `mise install --locked` failed correctly. The verification task therefore performs an explicit locked-install preflight and also tests executable provenance. Do not infer safety from matching version numbers or `locked = true` alone.

These findings are part of the pilot, not reasons to silently disable trust/checksum enforcement. No checksum verification was disabled. Native files and the reproducible VM evidence should be reviewed before any default-activation cutover.

## Next

Record results, keep one runtime owner at a time, inventory NVM/asdf-dependent projects, and pilot explicit safe dotfile deployment plus the chosen native iTerm profile. Keep Brewfiles and the current agent module authoritative until their corresponding migrations have independent acceptance evidence.
