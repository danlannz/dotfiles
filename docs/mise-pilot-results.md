# Mise runtime pilot results

## Scope and checkpoint

The pre-pilot work and consolidated backlog were committed as **`d7d76e2` — `Modernise dotfiles provisioning and track the remaining backlog`**. Nothing was pushed. The [living backlog](modernisation-backlog.md) retains all original audit/README work; mise is an implementation choice, not a replacement checklist.

The first pilot used a separate Git checkout and private HOME/config/data/cache/state inside the existing disposable ARM macOS guest. The host and the guest's normal shell/runtime configuration were **not migrated**. No Brewfile entries, shell activation, App Store/iCloud settings or live agent links were changed by the pilot.

## Inputs

- CLI: **mise v2026.11.0**, macOS ARM64 release, checked against GitHub's published asset SHA-256 before guest execution.
- Archive digest: `9c3678b20515f091208b3a2a9900bbc5ab7f228a1c5893849f0f2939b1829df3`.
- Runtimes: **Node 26.13.0**, **Bun 1.4.4**, matching the versions already present in the guest before the experiment.
- Source: sanitised clone of the checkpoint bundle plus explicit `mise/pilot/` and test overlays. No host `.git`/credentials were copied; the guest remote is the transferred bundle.
- Native `mise.lock` records `core:node` and `core:bun`, official artifact URLs and SHA-256 checksums for `macos-arm64` only. No checksum enforcement was disabled.

An initial cold lock/install command exceeded its controller's 180-second window before producing a completed install; a subsequent observable retry completed. This is not an offline or cold-start latency guarantee. The initial default lock operation considered other platforms, including an unsigned unofficial Linux/musl Node checksum feed. The final pilot deliberately regenerates a macOS-ARM64-only lockfile; it does not claim those other platforms were installed or validated.

## Verified results

| Check | Result |
| --- | --- |
| Noninteractive `mise exec` | Correct Node/Bun versions **and** executable paths under the private mise installation directory. |
| Before/after regression | Each runtime initially came from the existing manager; provenance checks failed even though version numbers matched. Each passed after mise installation. |
| `mise run verify` | **71 tests passed**, plus individual Bash/sh/Zsh syntax checks, both Ruby Brewfile checks, error-level ShellCheck and Git whitespace checks. Caller cwd does not need to be the repository. |
| Repeat strict install | A second `mise install --locked` reported two already-installed tools and installed zero tools. |
| npm | The mise Node includes npm **11.20.0**. Existing NVM npm is **12.2.1**, separately upgraded by the old hook. The pilot performs no latest-npm upgrade; a deliberate separate npm pin is a cutover decision. |
| Bunx | Mise-provided Bunx ran the real `skills@1.7.4` CLI and reported its version. |
| Existing agent module | Dry run correctly planned isolated links/restores. For actual validation, 29 managed skills were seeded from the guest's collection and `caveman` was deliberately omitted. Mise-managed Bun/Bunx fetched it, validated 30 skills and five isolated global links, and a second run found nothing missing. No live agent collection was replaced. |
| Interactive activation | A minimal private zsh rc activated mise in a PTY. Node/Bun/Bunx resolved to the private mise installation directory without a trust prompt after the reviewed config was explicitly trusted. This is not a change to the user's real Oh My Zsh startup. |
| Missing pilot opt-in | Verification task fails before installation/tests when the required isolation variables are absent. Task auto-install is disabled so it cannot precede the guard. |
| Missing lockfile | The native strict installer fails. The verification task's explicit strict-install preflight stops before command fallback or tests. |
| Ordinary host test suite | Existing 69 tests run; two mise-specific integration cases are skipped without explicit opt-in. It never downloads mise/runtimes automatically. |

The native configuration and reproducible entry point are documented in [`mise/pilot/README.md`](../mise/pilot/README.md). The test command is intentionally VM-only and checks its environment before proceeding.

## Findings that affect the migration

### Matching versions do not prove ownership

Both existing and mise-managed tools can report identical versions. The tests assert the executable's location as well, otherwise a pilot can appear to pass while still relying on Brew/NVM. This remains an acceptance gate for future activation changes.

### Interactive trust is a separate check

After editing the config, the first interactive probe reported it untrusted, declined it, and used the existing Node. Explicitly trusting only the final reviewed config resolved this. Passing noninteractive/CI commands did not establish that a new interactive shell would use mise. Do not introduce broad trusted-directory settings to hide this.

### A raw exec is not the strict-install gate

In the reviewed version, the missing-lock probe with `locked = true` warned about unresolved tools but could still run an existing Brew binary via `mise exec -- ...`. `mise install --locked` correctly returned 1. The pilot `verify` task now performs that native preflight and retains provenance tests; missing lock/isolation probes both fail before tests. No upstream behaviour was patched or described as stronger than observed.

### Keep version and package ownership decisions separate

The pilot demonstrates Node/Bun management, not replacement of the audited Brewfiles or mise's native Homebrew providers. It did not remove the old NVM/Brew runtimes or their activation. It did not upgrade npm to mimic the legacy `--latest-npm` behaviour.

## Limits and next work

- This is a successful **isolated runtime/task pilot**, not a host/default-runtime cutover or complete machine bootstrap.
- Actual global Oh My Zsh/mise integration still needs its own test when activation ownership moves. The interactive pilot used a minimal private rc; existing prompt tests remain in the normal suite.
- The agent restoration exercise fetched one missing skill, not all thirty from scratch; validation remains structural, not an upstream-content hash guarantee.
- No real App Store or cloud login was used. Existing Mackup restoration/error policy is still open.
- The unsafe general linker, safe terminal-profile deployment, completion ownership, PATH cleanup, OS security/recovery handling, CI, configuration cleanup and rollout remain tracked in the backlog.
- Next: inventory project runtime requirements, decide bundled versus separately pinned npm, then implement explicit native dotfile deployment and a selected native iTerm profile in the guest. Resolve cold-start ordering so mise exists before replacing the linker.

## Artifacts

The verified native source snapshot is:

```text
mise/pilot/mise.toml: 3d6b984dc89c1ce495b7cad42b86b372a1a8ed494e7098ea76744a3881bc87d5
mise/pilot/mise.lock: 3ca88766f1d151a3242cd765bde2b2c9b626ba665fd0e2cfde862d7ef12c6020
tests/mise-pilot.test.ts: 9f2f59bbe252811b93ecfdae33e10a64f63c1c9db5658e6c36cd78ac5dce45ec
```

Private raw logs and the pinned CLI download remain outside Git under `~/Library/Caches/dotfiles-vm/`, with `mise-pilot-*` names. A snapshot of the logs and structured result is archived in `runs/20261104-174940-mise-pilot/`. The guest pilot root is stored in `mise-pilot-guest.path`; all guest-generated installs/configuration are under that private root. Live user configuration and the clean VM baseline remain separate.
