# Remaining runtime and package ownership

Read-only inventory and proposal, **2026-11-09 UTC**, after `623fdbe`. No installation, removal, runtime/provider change, project rewrite, service restart, account authentication or host rollout is part of this checkpoint.

**Subsequent decision:** the user retired legacy Node/Yarn compatibility and approved mise language migration plus upgrades. [Language cutover](language-runtime-cutover.md) records the implementation, including Java/Kotlin's migration-only checkpoint, upgrades, and verified current Python adoption without bypassing the old-artifact attestation gate. The inventory/recommendations below remain the historical discovery snapshot, not the current ownership authority.

## Recommendation

1. **Keep asdf and its existing installations for now.** Java/Kotlin/Python are selected globally, and Python has application dependencies that an interpreter-only migration would not restore.
2. **Extend the compatibility inventory before another cutover:** Node 14/Yarn 1 and project Bun requirements were not in the previously verified Node 16/18 matrix. In particular, exact Node 14.17.0 has no official macOS ARM64 archive.
3. **Make essential standalone CLIs reproducible deliberately**, rather than copying every historical global package. Pi and the existing explicit Bun CLI selections need an owner decision; the current agent module restores configuration/skills, not those executables.
4. **Treat Yabai/skhd as an active desktop workflow.** Both are installed and running on the host, despite missing provisioning declarations. Preserve their files/services and propose an explicit optional desktop stage, not silent removal or automatic security changes.
5. **Keep Homebrew as owner of Go, Rust, uv, CocoaPods and applications.** Android Studio's bundled JBR is application-owned, separate from the shell's Java selection. No additional language manager retirement is justified yet.

This is an ownership proposal, **not an extra installation manifest**. Production tools remain authoritative in [`mise/config.toml`](../mise/config.toml), baseline software in [`.Brewfile`](../.Brewfile), project dependencies in their own manifests, and the curated agent module in [`agents/`](../agents/README.md).

## Discovery scope and confidence

Local evidence comes from version files, package manifests/distribution metadata, installation directories, executable links, `asdf current`, installed Homebrew receipts, and launch-agent/process presence. No project code, Gradle wrapper, package lifecycle scripts or legacy Java/Python interpreters were executed. Cloud credential stores and service configuration were not part of the inventory; no credentials were exported or copied.

The bounded `~/Dev` filesystem scan examined **12,881 files in 3,410 directories**. It retained **123 relevant records**, including **67 package manifests** with engines/package-manager/global-package-overlap information. It did not follow symlinks and excluded dependency trees, virtual environments, build outputs, Git metadata and caches. A separate bounded text search found no doctl/Yabai/skhd/git-fuzzy references under `~/Dev`; that is not proof of non-use elsewhere. Project names and raw manifests stay out of this public report.

Files in temporary/archive/example directories are requirements worth preserving, **not proof of an actively maintained project**. Requirements files and installed packages do not prove that a project still works. Other checkouts, custom package prefixes, unexamined environment configuration and IDE-selected toolchains may add consumers.

Private evidence: `~/Library/Caches/dotfiles-vm/last-runtime-ownership.path` points to the inventory, observations and downloaded primary-source snapshots. No host inventory or credentials were copied into the guest. A guest-only metadata check confirmed that its installed mise engine lists Kotlin's `github`, `asdf` and `vfox` backends; it did not install them.

## Runtime ownership matrix

| Runtime/tool | Observed local state | Proposed owner / action |
| --- | --- | --- |
| Node/Bun/project pnpm | Branch defaults remain Node 26.13.0/Bun 1.4.4 with bundled npm 11.20.0. Host lookup selects NVM Node 26.13.0 and Brew Bun (installed 1.4.3); Brew Node kegs 25.3.0/26.4.0/26.7.0 also remain. Host activation is not the branch. | **mise**, as already implemented; preserve old installations. Expand project acceptance separately, below. |
| Java | `~/.tool-versions` selects `adoptopenjdk-21.0.4+7.0.LTS`; asdf also holds `21.0.1+12.0.LTS`. Both release files identify Eclipse Adoptium and ARM64. | **Retain asdf now; mise Java pilot next.** Select an explicit distribution/build, check exact version availability and `JAVA_HOME`, and test the project/IDE contract before changing ownership. Do not silently equate a legacy identifier with a new vendor/default. |
| Registered Java 8 | A separate `/Library/Java/JavaVirtualMachines/adoptopenjdk-8.jdk` is **1.8.0_292, x86_64**. It is not the globally selected asdf JDK. | **Preserve; consumer unknown.** No Rosetta installation, cask replacement or removal. Determine whether a real Java 8 consumer exists before choosing an upgrade or an explicit Intel compatibility path. |
| Android Studio JBR | Bundled JBR **21.0.5, ARM64**, vendor JetBrains. | **Application-owned**; do not replace it merely because shell Java moves to mise. IDE and Gradle JDK selection require their own acceptance check. |
| Kotlin | `~/.tool-versions` selects installed standalone compiler **1.9.25**. Android project files separately reference the Kotlin Gradle plugin; one example explicitly selects **2.0.21**. | **Retain standalone asdf Kotlin pending need confirmation.** Gradle/plugin versions remain project-owned; they are not a request to replace the global compiler with 2.0.21. A later mise CLI pilot must use a chosen backend and the validated JDK. |
| Python | asdf selects **3.9.19**, also holds **3.12.5**; both binaries are ARM64. Their site-packages contain **84** and **7** `.dist-info` distributions respectively. | **Retain asdf now.** Reproduce interpreters and dependencies independently in an isolated pilot, not a blanket global pip restore. Python 3.9 lifecycle upgrades are separate project work. |
| Other Python | A physically separate pyenv **3.9.19 ARM64** installation has two distribution metadata records. Homebrew has **python@3.13 3.13.2**, and the OS/CLT also owns its own Python entry point. | **Preserve all.** Do not mistake matching version strings for shared installation directories, or remove Homebrew/OS dependencies. Decide whether the separate pyenv installation has consumers before retirement. |
| Python tools / environments | asdf Python 3.12.5 includes **frida-tools 12.5.0**; 3.9.19 contains web/database/test tooling such as FastAPI, SQLAlchemy-related packages, pytest, boto3 and crypto dependencies. | Project packages belong in **project environments/requirements**. A confirmed standalone tool may use **uv's isolated tool environment**, with its interpreter owner explicit. Do not install the entire old environment into a new default. |
| Go/Rust/uv/CocoaPods | Already explicitly declared in Brewfile. | **Keep Homebrew ownership.** No reason discovered to move them into mise in this checkpoint. |

The host's global `.tool-versions` is **user-owned and not deployed by the current dotfile inventory**. Installing the `asdf` formula does not reproduce its plugins, languages or packages. The fresh guest has asdf but no `~/.asdf/installs` or global `.tool-versions`; system Java's command path is not evidence of an installed equivalent JDK. A future language baseline needs explicit reviewed declarations and tests.

Mise's current allowlist remains `node`, `nodejs`, `bun`, `pnpm`; Java/Kotlin/Python/Yarn have **not** been enabled. Mise reads asdf-style files but uses its own installations; sharing asdf installation directories is not the migration plan. Java activation must supply the correct `JAVA_HOME`, while macOS's registered JDK discovery and IDE selection are separate mechanisms. [S1–S4]

### Python evidence is not a complete runtime pin

Two backend `setup.cfg` files contain `python_version = 3.9` **under `[mypy]`**. This is type-checker configuration, not an exact interpreter declaration. Requirements files corroborate a Python application dependency surface, but do not identify an exact interpreter owner or prove compatibility with 3.12/3.13. Retain the selected global 3.9.19 until project tests and an explicit replacement policy exist.

The `.dist-info/REQUESTED` flags are only installation metadata, not a trustworthy curated list of top-level application requirements. A uv tool environment is isolated and linked to a Python interpreter; removing that interpreter can break the tool. Do not let both uv and mise silently download competing interpreter defaults for the same tool/project. uv itself remains Brew-owned. [S5]

## Newly exposed project compatibility gaps

| Evidence found in local checkouts | What is and is not established |
| --- | --- |
| Three `.nvmrc` files request Node **14**; another project pins **Node 14.17.0 / Yarn 1.22.10**. | **Not covered** by previous Node 16/18 acceptance. The official 14.17.0 release lists Darwin x64 archives, not Darwin ARM64. Choose a project upgrade or an explicitly tested compatibility route; do not promise a native download or automatically install Rosetta. [S6] |
| `.nvmrc` pins Node **16.13.0**, and other projects request majors **16/18**. | Existing major-version tests do not prove every patch pin. Preserve files and validate strict executable provenance for each selected version. Node 14/16/18 are EOL; upgrading projects is separate from manager ownership. [S7] |
| A parent `.tool-versions` pins **Node 18.14.2 / pnpm 7.27.1**; a nested example declares `packageManager = pnpm@7.18.2`. | Parent exact-pin compatibility was tested previously. The nested manifest disagreement needs a resolver/working-directory test, not an automatic rewrite to one pnpm version. |
| Three manifests declare **`bun@1.3.6`**. | The branch default is **1.4.4**. A `packageManager` field is not evidence that the present mise configuration automatically selects that runtime. Decide/verify project-specific selection and compatibility before calling these projects migrated. |
| Yarn 1 packages exist under old Node installs. | Yarn is absent from the current mise allowlist. Do not rely on an old NVM global to satisfy an exact project Yarn requirement. Node 25+ no longer bundles Corepack; a Corepack-based policy would need its own explicit, runtime-compatible owner/version. [S8] |
| Android projects use Gradle **8.13** and project-selected Kotlin plugins. | The Gradle runtime JDK, compilation toolchain and standalone Kotlin CLI are different contracts. Build with the wrapper under the chosen JDK; do not infer success from an installed `kotlinc`. [S4, S9] |

## Global JavaScript packages: inventory, not a restore list

### NVM prefixes

Each Node version has a separate global package prefix. The observed top-level package metadata is:

| Node installation | npm / Corepack metadata | Other global packages |
| --- | --- | --- |
| 16.17.0 | npm 8.18.0; Corepack 0.12.1 | ts-node 10.9.1; Yarn 1.22.19 |
| 18.13.0 | npm 8.19.3; Corepack 0.15.2 | dpdm 3.14.0; Yarn 1.22.19 |
| 18.20.4 | npm 10.8.2; Corepack 0.28.0 | Claude Code 0.2.68; expo-cli 6.3.12; Husky 9.1.4; Sass 1.78.0; Yarn 1.22.22 |
| 23.11.0 | npm 10.9.2; Corepack 0.32.0 | cline 3.0.61; kanban 0.1.68 |
| 26.13.0 (selected on host) | npm 11.20.0; no Corepack entry | None found |

This is the current snapshot, not an edit to earlier npm-version observations. The Homebrew global prefix separately contains npm **11.19.0**. Restoring npm from an old prefix would defeat the branch's deliberate bundled-npm policy. [S10]

### Explicit Bun and Yarn globals

Bun's native global `package.json` explicitly requests **six** packages:

| Package | Installed version | Proposal |
| --- | --- | --- |
| `@earendil-works/pi-coding-agent` | 1.5.0 | Essential candidate for a reproducible standalone CLI; choose/pin its owner explicitly. Config/skill links do not install `pi`. |
| `cline` | 3.0.29 | Optional standalone CLI. Current PATH selects this Bun installation, not the NVM 23 package (3.0.61). Keep one chosen future owner, preserve both existing installations. |
| `eas-cli` | 16.8.0 | Candidate mobile-development CLI; current PATH selects Bun. Keep separate from project-local Expo CLI and confirm whether it belongs in the baseline or an optional mobile stage. |
| `@executeautomation/playwright-mcp-server` | 1.0.3 | Optional integration; an installed package is not permission to configure/start an MCP server. Decide whether still required and how the consuming client launches it. |
| `typescript` | 5.8.3 | Project tool by default; optional ad-hoc global convenience, not a project compiler override. |
| `sxh` | 1.0.0 | No `bin` entry in its package metadata. Do not classify it as a CLI merely because it is global; confirm its purpose before reproducing it. |

The separate **Yarn global manifest** requests `eas-cli` **10.2.2**, `ts-node` **10.9.1**, and TypeScript **4.9.5**. `/usr/local/bin/ts-node` is a link into that Yarn tree—not a Homebrew global package. Yarn's executable is not on the inspected current PATH, but its old global executables can still be reachable. Do not remove that tree on the assumption that the manager command is absent.

Bun's global tree also contains hoisted/transitive packages and a Codex executable link under its `node_modules/.bin`, but Codex is **not in the explicit global manifest or current command lookup**. These files are not a request to declare hundreds of packages or add a global `node_modules/.bin` path. Bun globals and npm's prefix-based globals are distinct stores. [S10, S11]

### Package manager does not determine the execution runtime

The installed Pi, EAS and Cline entry points use **`#!/usr/bin/env node`**, even though their packages were installed using Bun. Pi 1.5.0's package metadata requires **Node >=22.19.0**. Thus an isolated npm package directory alone does not make the CLI safe to launch under a project's Node 14/16/18 selection. The current host Node 26 satisfies that declared minimum; legacy-project launch has not been accepted.

A future standalone CLI migration must verify the actual interpreter and invocation contract **both outside and inside legacy projects**, including how the agent's subprocesses retain project runtime selection. Do not solve this by silently raising project Node versions or assuming that a Bun global install runs the CLI with Bun.

### Proposed CLI policy

- **Do not copy entire global directories** or restore every package discovered on disk.
- **Keep Claude Code's existing Brew cask owner**; do not reinstall the historical NVM npm package as a second default owner.
- **Keep TypeScript/ts-node/Husky/Sass project-owned.** The scan found local dependency overlaps for all four (64, 9, 2 and 2 manifests respectively). This is evidence of project declarations, not proof every script is independent of global binaries. Husky's documented setup is local; modern Expo CLI is provided by the project's `expo` package, not the legacy global `expo-cli`. [S12, S13]
- **Keep bundled npm.** Choose any project Yarn/Corepack policy explicitly rather than copying old Corepack installations.
- **Reproduce selected standalone CLIs through one native owner only.** Candidate: pinned mise `npm:` tool entries using the already declared Node, with backend/allowlist/lock/provenance and cross-project runtime acceptance in the disposable guest. Its isolated package installs still need a suitable runtime; project-local package dependencies should stay project-local. This is a proposed migration, not a change to existing Bun globals or an assertion that the pinned engine's installer behavior has been tested. [S14]
- **Confirm optional utilities before declaring them:** dpdm, kanban, cline, EAS, the Playwright MCP server, ad-hoc global TypeScript and `sxh`. Preserve their existing installations meanwhile.

## Package-to-consumer reconciliation

| Tool | Consumer and observed state | Proposed provisioning boundary |
| --- | --- | --- |
| **Yabai** | Active rules/layout in [`.yabairc`](../.yabairc); installed **7.1.1**, receipt tap `koekeishiya/formulae`; running host launch agent/process. No current Brewfile install declaration. | Retain the active setup. Propose a native **optional desktop Brewfile/task**, paired with skhd, after owner confirmation. Installation must not automatically start services, replace working configuration or change SIP/sudo policy. |
| **skhd** | Active Yabai bindings in [`.skhdrc`](../.skhdrc); installed **0.3.5**, same receipt tap; running `homebrew.mxcl.skhd`. No Brewfile install declaration. | Same optional desktop boundary. Keep permission/service activation explicit. The duplicate `alt - x` bindings and Yabai option compatibility stay in **M14**, not silently repaired during discovery. |
| **git-fuzzy** | `gf='git fuzzy'` in [`.alias`](../.alias); existing checkout's bin directory exposed by [`.path`](../.path). Origin is `bigH/git-fuzzy`, commit **`36fc08f084a0cabf3e381dbbbce8e3a1a22fbaa4`**. The after-setup plugin loop does not install it. | Preserve the checkout. Propose an **optional, explicitly pinned repository-backed Git helper**, using existing Brew-owned Git/fzf. Its placement under OMZ's plugins directory does not make it an enabled OMZ plugin. Do not clone/update over the user's checkout. |
| **doctl** | Listed in the OMZ plugin array, but no CLI found on inspected host/guest PATH, no Brewfile declaration, and no bounded project-reference matches. | **Opt-in cloud CLI**, not a justified baseline install. The plugin returns immediately when `doctl` is absent and only supplies completion when available; it is not an installer. Keep the current harmless reference until the owner chooses removal or optional installation. No token/auth action. [S15, S16] |

Current upstream Yabai/skhd repositories redirect from **`koekeishiya` to `asmvik`**; the GitHub API confirmed both redirects. This is a source/provisioning review item, not permission to retap or upgrade the installed tools. Current installation docs separate Accessibility permissions and the optional scripting addition/security requirements. Keep SIP/security changes out of automatic provisioning. Running processes are evidence of active use, **not proof that every current binding/option works on a fresh account**. [S17, S18]

The checked-in git-fuzzy revision documents fzf **0.21.0+**. Do not substitute a changing upstream HEAD or assume its current requirements match this old checkout. A new pinned choice needs its own compatibility check. [S19]

## Safe next implementation sequence

1. **Confirm the standalone CLI and desktop selections.** Pi is the clearest missing fresh-device executable; decide baseline versus optional mobile/cloud/desktop tools. No new inventory format: use native mise tool entries, Brewfiles and project manifests where their ownership belongs.
2. **Close the expanded project compatibility gates** in private guest fixtures: exact Node 16.13.0, Node 14/Yarn strategy, nested pnpm disagreement, and Bun 1.3.6 policy. Keep original project files byte-identical unless a project-specific change is separately approved.
3. **Pilot Java first**, one explicit JDK distribution/build, isolated data/config; verify `java`, `javac`, `JAVA_HOME`, architecture and Gradle/IDE behavior without fallback to asdf/registered JDKs. Keep the old JDKs and asdf activation until acceptance.
4. **Evaluate standalone Kotlin separately from Gradle.** Only migrate its compiler if still needed, and test it against the selected Java. Do not lift an Android plugin version into the global runtime baseline.
5. **Pilot Python and a representative application environment.** Use exact interpreter selection and existing project requirements; verify native extensions/tests. Handle Frida as an explicit optional tool environment. Do not equate interpreter installation with dependency restoration or remove pyenv/asdf data.
6. **Only then propose manager retirement and host rollout**, with global executable provenance, tested rollback and separate approval. Publication, hosted CI, signed-in restoration and untouched remote bootstrap gates remain open.

No production declarations, allowlist, lockfiles, package versions, shell activation, agent module, project files or services changed in this inventory checkpoint. Host and guest installation states remain separate; no Intel execution or legacy project build success is claimed.

## Primary sources

Local observations above are backed by the private snapshot, plus the linked tracked configuration. External behavior claims use these first-party sources (accessed 2026-11-09):

- **S1:** [mise migration from asdf](https://mise.jdx.dev/dev-tools/comparison-to-asdf.html).
- **S2:** [mise Java](https://mise.jdx.dev/lang/java.html).
- **S3:** [mise Python](https://mise.jdx.dev/lang/python.html) and [registry](https://mise.jdx.dev/registry.html). Registry/backend documentation is not an installation test.
- **S4:** [Kotlin Gradle configuration/toolchains](https://kotlinlang.org/docs/gradle-configure-project.html).
- **S5:** [uv isolated tools and interpreter lifetime](https://docs.astral.sh/uv/concepts/tools/); [Python version lifecycle](https://devguide.python.org/versions/).
- **S6:** [Node 14.17.0 official release checksums/artifact list](https://nodejs.org/download/release/v14.17.0/SHASUMS256.txt), downloaded into the private evidence.
- **S7:** [Node end-of-life releases](https://nodejs.org/en/about/eol).
- **S8:** [Node 25 Corepack documentation](https://nodejs.org/download/release/v25.0.0/docs/api/corepack.html) and [Corepack's own documentation](https://github.com/nodejs/corepack).
- **S9:** [Gradle 8.13 compatibility matrix](https://docs.gradle.org/8.13/userguide/compatibility.html).
- **S10:** [npm global folders/prefix](https://docs.npmjs.com/cli/v11/configuring-npm/folders/).
- **S11:** [Bun global package installation](https://bun.sh/docs/pm/cli/add).
- **S12:** [Husky project-local setup](https://typicode.github.io/husky/get-started.html).
- **S13:** [Expo CLI](https://docs.expo.dev/more/expo-cli/) and [Expo's local CLI migration](https://blog.expo.dev/the-new-expo-cli-f4250d8e3421).
- **S14:** [mise npm backend and runtime dependency](https://mise.jdx.dev/dev-tools/backends/npm.html).
- **S15:** [OMZ doctl plugin source](https://github.com/ohmyzsh/ohmyzsh/blob/master/plugins/doctl/doctl.plugin.zsh), downloaded into the private evidence.
- **S16:** [DigitalOcean doctl installation](https://docs.digitalocean.com/reference/doctl/how-to/install/).
- **S17:** [Yabai installation and permission boundaries](https://github.com/asmvik/yabai/wiki/Installing-yabai-(latest-release)); [repository API](https://api.github.com/repos/koekeishiya/yabai), downloaded into the private evidence.
- **S18:** [skhd upstream](https://github.com/asmvik/skhd); [repository API](https://api.github.com/repos/koekeishiya/skhd), downloaded into the private evidence.
- **S19:** [git-fuzzy at the installed revision](https://github.com/bigH/git-fuzzy/tree/36fc08f084a0cabf3e381dbbbce8e3a1a22fbaa4).
