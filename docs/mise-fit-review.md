# Where mise fits in these dotfiles

## Recommendation

**Adopt mise incrementally, starting next—not as a wholesale rewrite and not merely as a wrapper around the existing bootstrap.** Use it first for developer runtimes, explicit dotfile deployment, and named setup/verification tasks. Keep Homebrew Bundle as the initial authority for apps, fonts, libraries, and system utilities. Keep a small cold-start/OS entry point and the tested agent-setup module.

Decide the iTerm profile/font requirements now, but avoid building another bespoke provisioning framework for them. Store the eventual iTerm profile in its native format and use the mise pilot to evaluate its deployment. Selecting a sensible default without overwriting a personalised profile still needs an explicit policy.

Research baseline: **released mise v2026.11.0**, published **2026-11-03**, not just an unreleased proposal. The capabilities below were checked against that tag's official documentation. No mise binary was installed or executed, and no host/VM provisioning was performed for this review. This is a capability/design review, not a claim that a migration has passed our VM tests. [S1]

Follow-up: the [isolated runtime/task pilot](mise-pilot-results.md) now has real VM evidence. It supports proceeding incrementally, but exposed interactive config-trust and raw-exec lockfile-fallback caveats. The original review below remains the capability/design baseline; it is not a claim that later migration phases have been implemented.

## What we currently have

- `bootstrap.sh`: administrator/security settings, FileVault/CI handling, CLT and native Homebrew installation, Git setup, checkout/linking, package installation, App Store opt-in, and post-install dispatch.
- `script/setup`: a generic hidden-file linker that can delete existing real files. This remains a high-priority safety problem.
- `script/after-setup`: Oh My Zsh/framework/plugins, ad hoc font downloads, Mackup restoration, NVM/Node LTS/latest npm, and Bun/agent setup. The shell installation has been repaired, but failed Mackup restoration is still ignored.
- `.Brewfile`: system utilities/libraries/apps/fonts, plus overlapping runtime ownership: `asdf`, `nvm`, Bun, Go, Ruby build tooling, and Rust.
- `.zshrc` / `.path`: prompt/plugins, runtime-manager integration, and user/tool paths. They have just needed a portability fix for another username.
- `Brewfile.app-store` / `script/setup-app-store`: an explicit, independently resumable App Store stage.
- `agents/setup.ts`: a tested module for whole-directory skill links, instruction links, backups, managed-skill restoration, and collection validation.
- **69 existing tests**, including installer behaviour and actual zsh startup; real VM findings are in `utm-bootstrap-results.md`.

There is no tracked mise configuration or `.tool-versions` in this repository. That does not establish whether other projects depend on asdf/NVM; inventory those before retiring either manager.

## What current mise can actually replace

Current mise is broader than an asdf replacement. It has `[tools]`, tasks/environments, declarative machine bootstrap, dotfiles, repositories, and macOS preferences. Calling it “only a runtime manager” would miss relevant released functionality. [S2–S8]

| Responsibility | mise capability | Fit here |
| --- | --- | --- |
| Node and Bun selection/installation | Versioned `[tools]`, global defaults, project overrides, lockfiles, `mise exec` | **Strong first adoption.** Replace NVM's installation/use and repeated latest-npm work; migrate Bun after its bootstrap dependency is handled. |
| asdf integration | Reads `.tool-versions`; supports asdf plugins and its own backends | **Strong potential replacement.** Remove asdf activation only after project-by-project checks, not just because the dotfiles have no version file. |
| Generic linking | `[dotfiles]` with explicit symlink targets, previews/status and conflict checks | **Strong next adoption.** Replace the unsafe general linker rather than investing in a large custom replacement. |
| Setup stages/retries | Named tasks, explicit ordering, prerequisite failure handling; `mise bootstrap --only` / `--skip` | **Useful.** Separate packages, terminal, shell, agents, App Store, cloud restoration, and verification instead of growing one hook. |
| Oh My Zsh/plugin checkout | `[bootstrap.repos]` clones declared Git repositories before deploying dotfiles | **Good later simplification.** Evaluate direct framework/plugin repository declarations plus our maintained rc, instead of downloading an installer that must be prevented from changing that rc. |
| Fonts/apps/formulae | Native `brew:` and `brew-cask:` bootstrap package managers | **Capable, but not the first migration.** These change the package installer/ownership model; keep Brewfiles initially. |
| macOS/iTerm settings | User preference declarations; dotfile copy/template/merge/seed operations | **Good deployment mechanism, not a design substitute.** We still choose font/theme, preserve custom profiles, and handle application reload/default-profile policy. |
| App Store apps | A `mas:` manager with numeric app IDs | **Does not remove authentication.** Keep the explicit opt-in stage; there is no reason to reintroduce it into every bootstrap. |
| Agent setup | Task invocation and whole-directory links; separate tool-provided skills support | **Run the existing module.** mise's tool-bundled skills are not a replacement for our curated collection/lockfile/instruction validation. |
| iCloud restoration, FileVault, app permissions | Commands/hooks can invoke platform operations | **Still policy/OS-specific.** mise cannot provide missing Apple credentials, cloud data, graphical login, or privacy permission grants. |

### Important: native mise Homebrew support is not `brew bundle`

In v2026.11.0, the `brew:` manager downloads/pours formulae itself into the standard prefix and writes Homebrew-compatible receipts. It explicitly **does not run `brew`**. Its macOS formula support is Apple Silicon, not Intel. Unsupported source-formula language features can fail rather than falling back to Homebrew. [S9]

The native cask manager likewise installs artifacts itself. Casks installed by mise are mise-owned by default and do not have normal Homebrew metadata unless configured to hand ownership to Homebrew. Replacing an app can also affect macOS privacy permissions; adoption behaviour needs testing. Homebrew-owned casks are recognised and left to Homebrew for upgrades. [S10]

That is a meaningful provider change, not just moving a list from Ruby to TOML. Our current Brewfiles already encode reviewed aliases, scoped tap trust, architecture/macOS guards, and App Store separation. **Initially invoke the real `brew bundle` from a mise task and keep one package manifest.** Do not duplicate the same package inventory in `[bootstrap.packages]` and the Brewfiles. Later, migrate selected entries only if native package support proves advantageous in the VM.

Mise does not inherently fix the vendor Tailscale installer/login context issue or the App Store login requirement. Its `mas:` documentation explicitly requires a signed-in Apple Account and notes authentication/indexing requirements. [S11]

## What genuinely becomes less bespoke

### 1. Runtime ownership

Use mise as the developer-facing owner of **Node and Bun** first. Declare reviewed versions and lock their resolved artifacts; use `mise exec -- ...` / `mise run ...` for bootstrap and CI so they do not depend on an interactive shell having activated tools. Global defaults belong in the native global config; projects can override them. [S3, S12–S14]

This can remove:

- NVM sourcing/install/use from `script/after-setup`;
- NVM and asdf activation/plugin glue once their replacements are verified;
- the repeated `--latest-npm` operation (npm can be separately pinned if needed);
- Bun's direct Brewfile/tap ownership once all Bun and `bunx` callers work through mise.

Do **not** immediately migrate every language or uninstall existing managers. Keep Go/Rust/Ruby tooling where it is until there is a concrete version-management need and compatibility checks. Homebrew may retain Node/Ruby/Python as dependencies even after mise owns the versions the developer invokes; those are not necessarily redundant installations.

At the Bun cutover, also replace the hook's `brew install oven-sh/bun/bun` fallback; otherwise a missing mise activation could silently reinstate the old owner. Bootstrap hooks do not automatically run in the `[tools]` task environment, so invoke runtime-dependent work through `mise exec` or a task rather than relying on bare `bun` being on PATH. [S2]

Existing `.nvmrc` files are not automatically honoured by default: enable Node's idiomatic version-file support deliberately and test representative projects. `.tool-versions` has different compatibility/lockfile rules. Mise does not reuse asdf's installation directories. [S4, S13]

### 2. Safe dotfile deployment

Prefer an explicit `[dotfiles]` allowlist in the existing repository over the broad “everything hidden goes into HOME” loop. Use repository-managed **symlinks**, not automatic tracking/sync, for this first adoption. Native symlink deployment stops on real-file/directory conflicts without `--force`, and already-correct targets are skipped. Whole-directory symlinks are supported, so no per-skill mapping is necessary. [S5, S6]

Cautions:

- An existing link to somewhere else can be repointed without `--force`.
- `copy`/template modes can overwrite live edits without `--force`; `create_if_missing` seeds a file without subsequently owning its edits.
- History/undo is conditional on tracking; do not assume every apply automatically backs up every unmanaged conflict.
- Do not declare paths already owned by `agents/setup.ts` until that ownership is intentionally transferred. Keep its backup/validation guarantees intact.

This is real deletion of custom behaviour: safer native deployment can replace `script/setup`. Merely placing a `mise run setup` wrapper around the existing destructive loop would not achieve that.

### 3. Understandable stages

Expose a small set of named operations, conceptually:

- `setup:packages` — the current regular Brewfile;
- `setup:terminal` — managed native iTerm profile and its font;
- `setup:shell` — framework/plugins/activation;
- `setup:agents` — the existing Bun module;
- `setup:app-store` — explicit opt-in only;
- `restore:settings` — explicit cloud restore, not a prerequisite for a usable terminal;
- `verify` — existing tests plus native installed-state and interactive startup checks.

These names are proposed interfaces, not commands added by this review. Keep setup requirements in native declarative sections where they fit, and keep scripts only for policy not covered there. `depends` may run prerequisites in parallel: use real prerequisite edges or ordered run steps where packages must precede terminal configuration or runtime availability must precede agent setup. [S7, S8]

Mise helps the runner propagate an unsuccessful task; it does not notice a failure an existing shell script swallows. The ignored `mackup restore` error still needs an explicit policy/fix.

### 4. Terminal provisioning

The immediate terminal work is a good pilot: select the font and colour/profile baseline, keep the profile in **iTerm's own JSON format**, install its font through the current Brewfile, and deploy the profile through native file management. If default-profile selection needs a small guarded task, that is reasonable application-specific logic—not a reason to maintain a general-purpose installer framework.

Do not manage iTerm's entire profile array with a blanket macOS-defaults value: declared arrays replace whole preferences. Targeted dictionary writes do not support array indexes. Native preferences support is user-scoped, not `sudo defaults`, and apps may need restarting to observe changes. Existing customised profiles/default choices still require preservation rules. [S15]

## What I would keep

- A small **cold-start/OS entry point**: establish prerequisites, native Homebrew/mise availability, reviewed configuration/trust, and any explicitly requested security/CLT operations. Do not make mise install itself through a task that already requires mise.
- `.Brewfile` / `Brewfile.app-store` as package sources of truth initially.
- Oh My Zsh/Agnoster as the prompt implementation; mise is not a prompt theme or a font selector.
- `agents/setup.ts` and its lockfile/local-skill policy. Invoke it with mise-managed Bun, not a rewritten validator.
- Explicit consent for App Store/cloud operations; no fake login detection or real credentials in the VM.
- The current regression tests and VM evidence. mise status/doctor do not replace a real interactive prompt/font/profile check.

Mise also has `mise skills sync`, but it links skills shipped by active Packslip tools. It is not a fetcher/validator for our arbitrary Matt Pocock/Superpowers/custom collection. Do not enable a second writer into the shared skills directory without designing that ownership. [S16]

## When and how to implement it

**Next, before more custom bootstrap infrastructure—not after completing a bespoke iTerm/font installer and then rewriting it.** Keep the content decisions (which font/profile) separate from the deployment mechanism.

1. **Record the current checkpoint and acceptance criteria.** Preserve existing work/backups. No automatic commit/push is implied. Separate “new machine becomes usable” from optional account/cloud restoration.
2. **A small VM pilot: Node, Bun, and verification.** Install a chosen mise release only in a disposable guest, use native configuration and a lockfile, verify `node`, `npm`, `bun`, `bunx`, the agent module and interactive zsh. Initially use explicit `mise exec`/tasks; change activation and retire NVM/asdf glue only when the results agree. Do not uninstall old versions yet.
3. **Replace the unsafe linker and deploy the terminal profile.** Test symlink/no-op/conflict cases and custom-profile preservation. Keep one owner for shell activation: our tracked `.zshrc` or mise-managed activation blocks, not both editing it. Do not retain the old destructive linker in the default path.
4. **Move orchestration, shell repos, and user defaults into native features where useful.** Delete the corresponding old sections as ownership moves. Keep cloud/App Store tasks out of default dependencies. Narrow the OS entry point rather than layering `mise bootstrap` and the old monolith around each other.
5. **Evaluate native package installation last.** Test our particular casks, third-party taps, OS-version guards, existing installs, privilege needs, and ownership/upgrade behaviour before moving a package. There is no requirement to migrate them if Homebrew Bundle remains the clearer tool.

Do not require every legacy issue to be fixed before the pilot, but do not turn mise into a new wrapper that hides them either. A safe linker and explicit restore policy are still necessary outcomes; native features should replace implementation work rather than postpone those outcomes.

### Pilot acceptance gates

- First apply works; a second apply preserves configs and does no unnecessary installation.
- Existing real files and personalised iTerm profiles survive conflicts.
- The actual guest login shell has the expected prompt, paths and runtime versions; noninteractive tasks work without shell activation.
- Agreed missing tools/configuration produce a failure, not an apparent success or an authentication hang.
- Default setup never attempts App Store or iCloud login.
- Tools and packages have one declared owner; old managers remain available for rollback until verified.
- Existing 69 tests remain meaningful; replace old implementation-coupled checks only alongside equivalent coverage at the new public interfaces.
- Provisioning stays in a disposable VM with the baseline untouched and no host credentials/home sharing.

## Risks worth making explicit

- **Not a transaction:** declarative parts skip satisfied state, but hooks/bootstrap tasks run each time, and earlier changes remain after failure. Task caching is not machine-state reconciliation. [S2]
- **Dry run is not an unconditional sandbox:** `exec()` in system-file content templates can execute during status/plan/dry-run. Avoid executable templates for this setup. [S2]
- **Secret/history exposure:** do not adopt automatic dotfile tracking, watcher/push, or whole-config capture into this public repo by default. Saved history can retain deleted secrets. Native repo deployment is enough here. [S17]
- **Trust/version behaviour:** review the config/backends, avoid broad trusted-directory settings, set an appropriate minimum mise version, and test deliberate upgrades. Locking tools does not pin Homebrew/App Store packages, OS behaviour, or application dependencies. [S12, S18]
- **No broad prune/force during migration:** native package pruning can remove Homebrew-installed formulae not declared in the active configuration; app replacement can affect privacy grants. A review is not permission to clean the host. [S9, S10]

## Sources

Sources are first-party mise documentation pinned to the reviewed release unless noted.

- **S1:** [v2026.11.0 release and publication date](https://github.com/jdx/mise/releases/tag/v2026.11.0).
- **S2:** [Bootstrap: state, ordering, hooks, dry-run limitations](https://github.com/jdx/mise/blob/v2026.11.0/docs/bootstrap.md).
- **S3:** [Tool management](https://github.com/jdx/mise/blob/v2026.11.0/docs/dev-tools/index.md).
- **S4:** [Migrating from asdf](https://github.com/jdx/mise/blob/v2026.11.0/docs/dev-tools/comparison-to-asdf.md).
- **S5:** [Dotfiles overview and repository deployment](https://github.com/jdx/mise/blob/v2026.11.0/docs/dotfiles.md).
- **S6:** [Managed-file modes, conflicts, seeding and undo](https://github.com/jdx/mise/blob/v2026.11.0/docs/dotfiles/managed.md).
- **S7:** [Tasks](https://github.com/jdx/mise/blob/v2026.11.0/docs/tasks/index.md).
- **S8:** [Task ordering and dependency semantics](https://github.com/jdx/mise/blob/v2026.11.0/docs/tasks/architecture.md).
- **S9:** [Native Homebrew formula implementation/platforms/ownership](https://github.com/jdx/mise/blob/v2026.11.0/docs/bootstrap/packages/brew.md).
- **S10:** [Native casks, adoption, permissions and ownership](https://github.com/jdx/mise/blob/v2026.11.0/docs/bootstrap/packages/brew-cask.md).
- **S11:** [App Store manager prerequisites and limitations](https://github.com/jdx/mise/blob/v2026.11.0/docs/bootstrap/packages/mas.md).
- **S12:** [Tool lockfiles, global scope, checksums and limits](https://github.com/jdx/mise/blob/v2026.11.0/docs/dev-tools/mise-lock.md).
- **S13:** [Node versions, `.nvmrc` opt-in and npm](https://github.com/jdx/mise/blob/v2026.11.0/docs/lang/node.md).
- **S14:** [Shell activation versus noninteractive exec/tasks](https://github.com/jdx/mise/blob/v2026.11.0/docs/shell-setup.md).
- **S15:** [macOS preferences: replacement, scope, targeted writes and restarts](https://github.com/jdx/mise/blob/v2026.11.0/docs/bootstrap/macos-defaults.md).
- **S16:** [Tool-bundled agent skills](https://github.com/jdx/mise/blob/v2026.11.0/docs/cli/skills.md), [sync ownership and directories](https://github.com/jdx/mise/blob/v2026.11.0/docs/cli/skills/sync.md).
- **S17:** [Setup/history sharing and conflicts](https://github.com/jdx/mise/blob/v2026.11.0/docs/bootstrap/setup.md).
- **S18:** [Security](https://github.com/jdx/mise/blob/v2026.11.0/docs/security.md), [configuration/minimum version](https://github.com/jdx/mise/blob/v2026.11.0/docs/configuration.md).
