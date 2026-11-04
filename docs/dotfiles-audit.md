# Dotfiles audit and cleanup plan

Reviewed 2026-11-02 against local commit `e023516` on `device/mbp-14-m1`.

The [living modernisation backlog](modernisation-backlog.md) now tracks current status and the agreed mise adoption order. Keep the original findings below as historical evidence rather than using them as the active checklist.

Follow-up: native ARM Homebrew provisioning is fixed in `249635a`. The cleanup branch also removes obsolete taps and annotates/reconciles the Brewfile; see [package review](brewfile-review.md) and [real VM results](utm-bootstrap-results.md). The original findings below describe the audited baseline, not an assertion that every issue is still open. General linking and post-install error handling remain unresolved.

## Recommendation

Keep the useful configuration; modernise the installation layer before reorganising files. The highest-value work is making a fresh-Mac setup safe, current, repeatable, and observable. Do not start with a wholesale Nix migration, a new shell framework, or a package dump from the existing machine.

Keep Homebrew for software, Zsh for the shell, and the existing shared agent setup. Separate machine provisioning, file linking, package installation, and optional configuration restores. Choose one owner for each file or installation task.

Only this report was added during the audit. No bootstrap, package installation, security-setting changes, app restores, commits, or pushes were performed. Destructive-link behaviour was tested only in temporary homes. No background-agent tool was available, so the research was performed directly.

## What was checked

- All tracked configuration and bootstrap files; Git history and current remote branch heads.
- ShellCheck over `bootstrap.sh`, both `script/` hooks, `.path`, `.functions`, `.alias`, and `.yabairc`: **25 warnings, 30 informational diagnostics, zero error-level diagnostics**. These are lint findings, not 55 independently confirmed bugs.
- Bash syntax checks and Zsh syntax checks: passed. Syntax validity does not prove that a fresh-machine setup works.
- Existing agent setup tests: **36 passed**.
- Temporary-home reproductions: general setup destroys a pre-existing file without a backup; the post-install hook can return success after a failed Mackup restore.
- Current upstream Strap, the explicitly credited Yabai source, representative popular personal dotfiles, Dotbot, official Homebrew metadata, Oh My Zsh installation code, and Mackup documentation.
- Previously reviewed examples: Mitchell Hashimoto, Joel Hooks, Omarchy/DHH, Matt Pocock, Evan Bacon/Expo.

The requested GitHub star-sorted search page was not accessible to the web-search provider. The popular-repository sample was checked directly; this report does not claim an exact live ranking or use stars as a quality guarantee.

## Findings, in priority order

### 1. High: the general dotfile linker can lose existing configuration

**Evidence:** [`script/setup:12–30`](../script/setup) loops over every top-level hidden entry and runs `rm -rv "$HOMEFILE"` before linking when the destination isn't an already recognised symlink. There is no backup or conflict confirmation. Source directories also gain trailing slashes, making directory handling particularly fragile. The script doesn't stop on failed `cd` or link operations.

**Reproduction:** copied the real script to a temporary repo, created different source and home `.zshrc` files, and ran it with an isolated `HOME`. It exited 0, replaced the existing file with a link, and retained no copy of the previous content.

**Change:** replace blanket hidden-file installation with deliberate ownership and safe conflict handling. Leave correct links alone; refuse or back up conflicts; never delete a directory to install a link. Test absent destinations, existing files, directories, correct/wrong/broken links, repeated runs, and paths containing spaces. The agent linker's backup/idempotency tests are a useful model.

### 2. High: fresh Apple Silicon Homebrew installation uses Intel defaults

**Evidence:** [`bootstrap.sh:273–302`](../bootstrap.sh) falls back to `/usr/local` and `/usr/local/Homebrew` whenever `brew` is unavailable. This is exactly the fresh-device case. It also recursively changes repository ownership and reinitialises/fetches/hard-resets Homebrew even when Homebrew is already installed.

Current Strap selects `/opt/homebrew` for `arm64`, `/usr/local` for Intel, and gates repository installation behind absence of `brew` [S1]. Official Homebrew documents the same architecture-specific prefixes [S2].

**Change:** stop maintaining the old Homebrew-install fork. Either use current Strap for machine provisioning with a deliberate revision/update policy, or use Homebrew's official installer from a thin first-run script. Do not hard-reset an existing Homebrew checkout during routine dotfile updates. Keep a small shell entry point before Bun is available.

### 3. High: the Brewfile is no longer a reliable fresh-install specification

**Evidence:** [`.Brewfile`](../.Brewfile) still requests retired/deprecated names and applications. Direct official Homebrew API checks during this audit:

| Entry | Observation |
| --- | --- |
| `barrier` | Present but disabled; upstream is unmaintained. |
| `skype` | Present but disabled; product discontinued. |
| `fork-cleaner` | Deprecated because its repository is archived. |
| `exa`, `openssl@1.1`, `container-diff` | Requested names returned 404 from the current formula API. |
| `adoptopenjdk8`, `hyperdock` | Requested names returned 404 from the current cask API. |
| `postgres` | Requested formula API endpoint returned 404; select the intended canonical PostgreSQL formula/version rather than assuming the old name. |

404 means the requested API name is unavailable, not proof that no alias or replacement exists. Check canonical names and required versions before editing. `eza` is a replacement candidate for `exa`; a maintained JDK distribution is a candidate for `adoptopenjdk8` if Java 8 is still needed. Do not silently change database majors.

The Brewfile also carries old explicit Homebrew taps, legacy OpenSSL 1.1 alongside the rolling OpenSSL alias, and a large undifferentiated mix of baseline tools, specialised development tools, GUI applications, and App Store installs. Conversely, config refers to tools such as `git-fuzzy` and Yabai/skhd without a corresponding install in this Brewfile/hooks.

**Change:** ask which applications and specialised stacks are still wanted, choose supported versions, and audit each install declaration against its actual consumers. Prefer a small baseline Brewfile plus optional app/work profiles over installing everything everywhere. Do not run `brew bundle cleanup` as part of this work: declaration cleanup must not automatically uninstall the user's software. Homebrew Bundle is already the right native package declaration format [S3].

### 4. High: post-install orchestration can report success after failures

**Evidence:** [`script/after-setup`](../script/after-setup) lacks fail-fast handling. Its `log()` calls `sudo_refresh`, but that function is defined only in the parent bootstrap, and `bootstrap.sh:134` executes hooks as separate processes. Ordinary shell functions are not inherited that way. The parent also hides hook stderr outside debug mode.

**Reproduction:** ran the actual hook prefix through the Node setup in an isolated home with a stubbed `mackup` that exited 9 and successful stubbed NVM functions. The hook exited **0**. This reproduces failure masking without running Mackup or package installation.

Oh My Zsh setup has additional fresh-install issues:

- `$ZSH_CUSTOM/plugins/...` has no default for the first plugin clone; an unset value points at `/plugins/...`.
- All plugin clones are inside the `if ~/.oh-my-zsh is absent` branch. Missing plugins are not repaired when the framework already exists.
- The unconfigured installer may replace the `.zshrc` link that `script/setup` just created, and may launch a login shell. Upstream provides `KEEP_ZSHRC=yes` and unattended flags specifically for scripted installs [S4].

The bootstrap also declares `/bin/sh` while using Bash-specific `[[ ... ]]`, here-strings, `local`, and arrays. macOS's Bash-based `sh` can mask this; it is not a portable POSIX-shell contract. Current Strap explicitly uses Bash. Align the shebang, documented invocation, and syntax tests rather than treating successful parsing on this Mac as portability proof.

**Change:** make each stage independently rerunnable, report failures, keep stderr visible, and don't rely on parent-shell functions. Make software/framework installation precede linking configuration that installers would replace, or explicitly preserve existing config. Decide which plugin provider owns each plugin instead of mixing accidental framework and package-manager installs.

### 5. High for rollout: the documented bootstrap does not retrieve the reviewed work

**Evidence:** [`README.md:10`](../README.md) downloads `master`. The local work is on `device/mbp-14-m1`. `git ls-remote` during the audit returned:

```text
master             bb9660531f9a60f083860982795529b1370e3d91
device/mbp-14-m1    9647aff336bbe010d2d90b1be463d969cf91ac39
local HEAD         e02351636bd13528e148334a8aa073dfb86a62da
```

The recent agent setup commits are therefore not on either published head. A new machine using the README won't get the reviewed local setup. This is a release/distribution gap, not a request to push automatically.

**Change:** choose the shared baseline branch, review/merge/push deliberately, then test the exact documented bootstrap. If device-specific differences are needed, prefer small local overrides or explicit profiles over maintaining long-lived divergent copies of the whole setup.

### 6. Medium: shell configuration relies on this machine masking portability gaps

**Evidence:** [`.zshrc`](../.zshrc), [`.path`](../.path), [`.functions`](../.functions):

- User-specific `/Users/daniel/...` paths and a `/Users/Daniel/.oh-my-zsh` path. The latter exists on this machine, but case-insensitive storage can mask the mismatch; it is not portable to another username or a case-sensitive volume.
- Interactive NVM sources still target `/usr/local/opt/nvm`, absent here, while `/opt/homebrew/opt/nvm/nvm.sh` exists. The Oh My Zsh NVM plugin may mask this; the explicit sources are nevertheless inconsistent with the architecture-aware post-install hook.
- Docker completion paths and an explicit `compinit` appear after Oh My Zsh initialisation; this duplicates completion ownership and makes ordering harder to reason about.
- `asdf`, NVM, Node/npm plugins, Bun, and pnpm configuration coexist without documented ownership. Coexistence is not inherently wrong, but choose one intentional provider of Node versions.
- `.functions` launches GPG and runs `thefuck` unconditionally whenever it is sourced, whether those tools are available or needed.

**Change:** use `$HOME`, establish Homebrew/environment paths before loading dependent plugins, guard optional tools, have one completion-init path, and put machine-only additions in a documented ignored local override. Keep useful personal aliases and Git helpers rather than rewriting the shell wholesale.

### 7. Medium: PATH mixes global tools with untrusted project-relative executables

**Evidence:** [`.path:25–42`](../.path) adds `./node_modules/.bin` to the interactive PATH and appends `$GOPATH` rather than its usual `bin` subdirectory. It exports global Vulkan/DYLD settings even when that SDK is not in use.

**Change:** remove the persistent project-relative PATH entry; use `bun run`, project commands, or explicitly trusted project environments. Add the actual Go binary directory. Keep optional Android/Vulkan development environment settings scoped or guarded. This is partly correctness and partly avoiding executable lookup changing silently as you `cd` into arbitrary projects.

### 8. Medium: security settings and app restore need deliberate ownership

**Evidence:** `bootstrap.sh:182–184` writes the FileVault recovery key to the Desktop via `tee` without an explicit restrictive mode; permissions depend on the inherited umask. The script also changes security settings and runs all macOS software updates as part of bootstrap. These inherited Strap choices are not automatically malicious or unnecessary, but they deserve separate consent and recovery handling.

[`.mackup.cfg`](../.mackup.cfg) restores iCloud-backed settings and excludes only Zsh; [`script/after-setup:29`](../script/after-setup) runs a broad `mackup restore`. This can create overlapping ownership with dotfiles unless restore scope is chosen explicitly. Current Mackup distinguishes copy and link workflows and warns against preference symlinks on Sonoma and later [S5]. This audit did not run a restore or inspect private cloud contents.

**Change:** keep security checks, but separate potentially disruptive system updates and recovery-key handling from ordinary link maintenance. Prefer OS-native recovery-key escrow/password-manager storage or explicit protected files, not an unattended Desktop artifact. Use Mackup for a selected set of application preferences, not files already owned by dotfiles. Document interactive App Store login and cloud availability as prerequisites instead of assuming automation can supply credentials.

### 9. Low/medium: copied reference configuration obscures the active setup

**Evidence:** [`.skhdrc:195,216`](../.skhdrc) assigns `alt - x` to two different actions. Most of the file is copied grammar/reference examples. [`.yabairc`](../.yabairc) contains a second shebang and large commented blocks copied from historical Yabai configs; active options should be checked against the version actually installed. [`.macos`](../.macos) contains one Simulator preference but is only linked, never invoked by the bootstrap. [`.inputrc`](../.inputrc) is marked executable although it is Readline configuration, not a shell script.

**Change:** retain active bindings and intentional settings, resolve the duplicate chord, move explanatory links into a README, and delete unused reference blocks only after checking what is actually used. Make macOS defaults an explicit optional action. Fix file modes as part of normal cleanup.

### 10. Keep: the newer agents directory is a useful pattern, not the first rewrite target

The agent setup has native lockfile metadata, shared directories, `local-*` custom ownership, backups, validation, dry-run support, missing-skill restoration, and 36 passing tests. Keep this investment. It already documents that unpinned restores fetch current upstream content rather than exact historical versions.

One caveat for future tooling work: links currently target a particular checkout and multiple devices can update shared lock metadata. Continue to pull/review changes deliberately and avoid claiming byte-for-byte reproducibility from the global hashes. Don't solve the old shell/bootstrap issues by introducing a competing agent configuration tool.

## Original sources and what to borrow now

| Source | Relationship to this repository | Useful takeaway |
| --- | --- | --- |
| [Mike McQuaid / Strap][S1] | Explicit credit at `bootstrap.sh:3`; clear bootstrap ancestry. | Reuse maintained machine provisioning, architecture checks, clear hook contracts, and its test strategy rather than growing the stale fork. Current final hook is `script/strap-after-setup`, not our `script/after-setup`: migration needs an intentional adapter/rename. |
| [Andrew Sardone's dotfiles][S6] | Explicit credit at `.yabairc:78`. | His current repo has moved to nix-darwin/Home Manager with system/user ownership and repo-backed symlinks. Borrow the separation of responsibilities, not an automatic Nix migration. |
| [Mackup][S5] | Initial Git README explicitly mentions it; `.mackup.cfg` and restore hook use it. | Give it a limited app-preferences role and verify the current restore mode. Initial README also mentions GNU Stow as a possibility, not evidence that Stow was ever adopted. |
| [Oh My Zsh][S4], plugin repos, Yabai/skhd | Explicit URLs and install commands in the current code. | Keep upstream documentation links, use installer flags, and install dependencies intentionally. These are dependencies/reference snippets, not necessarily original whole-dotfiles templates. |
| [Mathias Bynens][S7] | `.inputrc` shares 21 exact non-empty unique lines with his current file; attribution is not present locally, so this is similarity rather than proven provenance. | Select useful settings and document them. Do not copy an entire historical `.macos` or overwrite-oriented bootstrap. |

## Popular and previously reviewed dotfiles: comparison

| Example | What was verified | Relevant lesson / limit |
| --- | --- | --- |
| [Holman][S8] | Topic directories, `*.symlink` ownership, installer conflict choices (backup/skip/overwrite). | Organise by responsibility and make conflicts explicit. Popularity is not a reason to copy every setting or shell script. |
| [thoughtbot][S9] | rcm-managed links, `dotfiles-local` precedence, local Zsh/Git overrides. | Shared baseline plus small machine/user overrides is more maintainable than per-device branch drift. |
| [Mathias Bynens][S7] | `rsync`-based bootstrap with a confirmation prompt; inspected snapshot's latest commit is 2024-04-09. | Rich examples, not a current safe bootstrap to transplant. It copies files rather than preserving our source-backed linking model. |
| [Dotbot][S10] | Native YAML/JSON link configuration, explicit targets, `create`, `relink`, `force`, and cleanup policies. | A good candidate if we want a standard link declaration instead of custom shell. Keep `force` disabled; existing real files should cause an explicit conflict, not data loss. Adds a Python dependency, so it is an option, not a free change. |
| [Mitchell Hashimoto][S11] | Nix/Home Manager separates package and user configuration, with machine-specific branches in configuration rather than a universal install assumption. | Borrow ownership and repeatability; a Nix conversion is disproportionate unless declarative OS management becomes a goal. |
| [Joel Hooks][S12] | Source-owned skills, deliberate consumer links, dry-run/replace controls, broken-link inventory. | Audit ownership and broken links. His specific refusal of symlinked consumer roots is his policy; our tested whole-directory link design need not change to match it. |
| [Omarchy/DHH][S13] | System-owned skill directories linked into multiple agents during provisioning. | A shared source with multiple consumers is sound. It is a shared Linux distribution configuration, not proof of DHH's complete private dotfiles or macOS guidance. |
| [Matt Pocock][S14], [Evan Bacon][S15], [Expo][S16] | Published skills/plugins and checked-in project-specific skills. | Keep global personal workflow separate from project knowledge. No evidence here of a universal personal dotfiles standard to replace our working agent setup. |

## Proposed cleanup sequence

### Phase 1: make existing behaviour safe

- Fix the general linker: deliberate inputs, backups/refusal, idempotency, and dry-run support.
- Make hooks standalone and fail clearly; stop suppressing stderr and relying on parent functions.
- Add isolated-home regression tests for the general scripts and CI for shell syntax, ShellCheck, and the existing Bun tests.
- Reconcile the source branch and documented bootstrap before calling the setup ready for another device.

**Exit criteria:** two consecutive runs in a fixture home preserve unrelated files, create the intended links, return nonzero on a failed required stage, and never invoke sudo/package installation in tests.

### Phase 2: restore a credible fresh-Mac path

- Choose maintained Strap versus a thin official-Homebrew wrapper. Do not keep a lightly patched 400-line provisioning fork by default.
- Review the Brewfile with the owner; remove retired apps, select intentional versions, and split optional application/workload installs.
- Make Oh My Zsh/plugin installation preserve configuration and independently repair missing plugins.
- Make app restore, macOS defaults/security work, and account login separate explicit stages.

**Exit criteria:** the documented setup selects the correct Homebrew prefix, has no known disabled/removed package declarations, and reports manual prerequisites honestly. Verify on a disposable/fresh macOS environment before declaring the full bootstrap tested.

### Phase 3: simplify daily shell configuration

- Replace usernames and hard-coded architecture paths, correct Go PATH, and remove the persistent project-relative executable path.
- Choose one owner for Node setup, completions, each plugin, and each managed configuration file.
- Add an ignored local override; trim commented templates and stale keybindings after confirming usage.
- Measure startup performance before and after, rather than assuming removing a framework is necessary.

### Phase 4: optional structure/tooling improvement

A modest destination might be:

```text
agents/                 # Existing shared instructions, skill lock, custom skills
shell/                  # Zsh entry point, environment, aliases/functions
macos/                  # Brewfile(s), explicit defaults, window-manager config
script/                 # Thin entry points with a clear contract
docs/                   # Setup prerequisites, ownership, recovery instructions
```

Choose **one** linking approach: a small well-tested shared helper or a native manager such as Dotbot/rcm. Dotbot is a plausible match for explicit standard configuration and directory symlinks; chezmoi becomes more attractive if machine-specific templates/secret integration become actual requirements. Neither migration is necessary to fix Phase 1. Preserve the current whole-directory skills layout; do not introduce per-skill manual mappings.

## Decisions needed before deleting or replacing anything

1. Is this now an Apple-Silicon-only personal Mac setup, or should Intel/other machines remain supported?
2. Which GUI apps, specialised SDKs, Node managers, and window-manager tools are still used?
3. Should Mackup remain for selected application preferences, and which files does it own?
4. Keep a minimal own bootstrap or adopt current Strap's provisioning contract?
5. Which branch becomes the published shared baseline?

## Sources and inspected snapshots

Primary repositories were read directly, not just through search summaries. Short snapshot IDs are included so later upstream changes can be distinguished from this audit.

[S1]: https://github.com/MikeMcQuaid/strap/tree/bbcc56a
[S2]: https://docs.brew.sh/Installation
[S3]: https://docs.brew.sh/Brew-Bundle-and-Brewfile
[S4]: https://github.com/ohmyzsh/ohmyzsh/blob/master/tools/install.sh
[S5]: https://github.com/lra/mackup#readme
[S6]: https://github.com/andrewsardone/dotfiles/tree/e65b1f7
[S7]: https://github.com/mathiasbynens/dotfiles/tree/b7c7894
[S8]: https://github.com/holman/dotfiles/tree/9a90082
[S9]: https://github.com/thoughtbot/dotfiles/tree/939a270
[S10]: https://github.com/anishathalye/dotbot/tree/ad9511e
[S11]: https://github.com/mitchellh/nixos-config/blob/40d483d/users/mitchellh/home-manager.nix
[S12]: https://github.com/joelhooks/dotfiles/blob/c3f5503/docs/agent-skills.md
[S13]: https://github.com/omacom/omarchy/blob/175e63b/bin/omarchy-provision-user
[S14]: https://github.com/mattpocock/skills/tree/4ae2317
[S15]: https://github.com/EvanBacon/evanbacon.dev/tree/e029877/.claude/skills
[S16]: https://github.com/expo/skills/tree/a9e5bd3

Homebrew package evidence: [Barrier](https://formulae.brew.sh/api/cask/barrier.json), [Skype](https://formulae.brew.sh/api/cask/skype.json), [fork-cleaner](https://formulae.brew.sh/api/formula/fork-cleaner.json). The removed-name API endpoints checked were `https://formulae.brew.sh/api/formula/{exa,openssl@1.1,container-diff,postgres}.json` and `https://formulae.brew.sh/api/cask/{adoptopenjdk8,hyperdock}.json`. Package status is time-sensitive; recheck before implementing replacements.
