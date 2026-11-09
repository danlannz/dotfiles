# Java/Kotlin/Python cutover

This implementation stays on the isolated `chore/mise-deployment` worktree. It has **not** been rolled out to the host. Old runtime installations, global packages, project files, registered JDKs and application-owned runtimes are not deleted or overwritten.

## Current status

Both checkpoints are implemented and VM-verified. **`967d51b`** preserves the migration-only Java/Kotlin state. The subsequent upgrade uses Java **21.0.13+9**, Kotlin **2.4.21**, and Python **3.15.2**; Node 26.13.0/Bun 1.4.4 stay unchanged. The asdf installation declaration, OMZ plugin and completion-path integration are now removed **on this branch only**. No `brew uninstall`, runtime-directory pruning, host activation or project-file rewrite was performed.

## Checkpoint 1 — Java/Kotlin migration without a version upgrade

Production mise config/lock now supply:

| Tool | Migration pin | Backend |
| --- | --- | --- |
| Node | 26.13.0, unchanged | core:node |
| Bun | 1.4.4, unchanged | core:bun |
| Java | temurin-21.0.4+7.0.LTS | core:java |
| Kotlin | 1.9.25 | github:JetBrains/kotlin |

The Java identifier changes from asdf's historical `adoptopenjdk-...` spelling to mise's explicit Temurin spelling. The host's existing release metadata already identifies Eclipse Adoptium, Java 21.0.4+7; the migration keeps that runtime version/vendor lineage rather than silently selecting a different Java major. The standalone Kotlin compiler is not the Kotlin plugin version in an Android project's Gradle build.

Python remains asdf-owned at this checkpoint. Its historical **3.9.19** prebuilt release lacks the GitHub artifact attestation required by the native mise Python backend. Lock generation refused it. **Attestation verification was not disabled**, and no automatic source-build workaround was added. The user approved migrating Java/Kotlin first, then adopting an attested current Python in the upgrade checkpoint. The old Python environment and its packages remain intact.

## Native configuration and shim policy

- Production pins and generated native lockfile remain in `mise/config.toml` and `mise/mise.lock`.
- Native early settings in **`mise/miserc.toml`** are explicitly deployed to `{{ mise_config_dir }}/miserc.toml`. This requires **mise >=2026.11.2**, the tested engine.
- The early policy ignores only **`~/.tool-versions`** for mise. Otherwise those old global asdf selectors would override the new defaults. The file is preserved byte-for-byte for asdf/rollback. Project-local version files remain discoverable; there is no blanket directory trust or removal of project requirements.
- Early settings must load before ordinary configuration; putting `ignored_config_paths` in `[settings]` did not provide this isolation. A conflicting user-owned early settings file is a visible native deployment conflict, not something setup overwrites.
- `runtimes` checks identity of **all three** deployed mise files, performs locked installation, checks native executable resolution for the managed runtimes/compilers, and runs native **`mise reshim`**. Interrupted JVM installations must not silently use a PATH fallback.
- `.path` adds an existing **native mise shim directory** before fallback tools, honoring `MISE_DATA_DIR` or the XDG/default data location. It does not create custom wrappers or pretend mise is an `asdf` executable.
- Full interactive activation remains last in `.zshrc`, providing tool environment such as **`JAVA_HOME`**. Shims serve configured sessions and their non-interactive children; a separately launched GUI/editor needs its own shim PATH integration or `mise exec`. A shim cannot rewrite the parent application's environment.

The asdf formula/plugin/completion integration remains temporarily for Python at checkpoint 1. Go, Rust, uv, CocoaPods and applications remain Brew-owned. Android Studio's bundled JBR and the separate registered Intel Java 8 installation remain application/user-owned; this work does not make an IDE adopt the shell JDK automatically.

## Legacy Node/Yarn policy

The user confirmed that old Node/Yarn projects are no longer a compatibility requirement. The permanent Node 16/18/exact old pnpm integration fixtures are retired; their prior evidence remains in Git/history. No legacy runtimes, global package trees or project files are removed. Modern project-local selectors remain supported by native mise, but this branch no longer promises to provision or test the obsolete matrix. In particular, it does not install Rosetta to accommodate Node 14.

## Checkpoint 1 evidence

- **101 host passes / 49 integration skips**; **149 VM passes / one GUI skip**.
- Real Java and Kotlin compilation/execution through mise, correct `JAVA_HOME` despite an invalid inherited value, and executable provenance under private mise data.
- Native shims exercised from a non-activated shell whose PATH contains no active runtime directories.
- Java and Kotlin interrupted-install regressions failed before readiness checks were added and pass afterward; only cloned fixture executables are removed, with a canonical-path guard against following links into original installations.
- Existing global asdf selector content survives deployment/runtime setup while managed JVM executables resolve from mise; user-owned early settings conflicts and missing deployment are rejected.
- Real guest native deployment/runtime rerun plus an actual rc/Oh My Zsh/Agnoster PTY confirms Java 21.0.4/Kotlin 1.9.25, native `JAVA_HOME`, Node/Bun provenance and versions. No iTerm GUI preferences, service restarts or account operations are part of that check.
- CI now links the early policy and checks the additional compilers, but **no GitHub-hosted run is claimed**. Intel URLs/checksums exist in the lock; execution is ARM64 only.

Native dot deployment emitted warnings when inspecting non-runtime configuration/lock targets; those logs are preserved. The real shell check is separate from a claim that every installer emits no warnings. Python application dependencies, Gradle project builds, IDE selection and host rollout are not validated by a compiler smoke test.

Private evidence/backups: `~/Library/Caches/dotfiles-vm/last-language-migration.path`.

## Checkpoint 2 — upgrades and verified Python adoption

Native mise metadata resolved these exact targets on 2026-11-09:

| Tool | Upgraded pin | Acceptance |
| --- | --- | --- |
| Java | temurin-21.0.13+9.0.LTS | `java`, `javac`, native `JAVA_HOME`, Java/Kotlin compile/run and native shims |
| Kotlin | 2.4.21 | Compiler/launcher under the selected JDK; no Gradle plugin edits |
| Python | 3.15.2 | `python`/`python3`, executable provenance, stdlib native-library imports and independent venv |

Java stays within **Java 21 LTS** to preserve the existing Gradle 8.13 runtime contract; Java 25 would require a separate project-build upgrade. This is a security-patch upgrade, not a silent JDK-major change.

Python uses the native `core:python` backend with **`compile = false` and `github_attestations = true`**. Generated ARM64 and Intel lock entries both record `provenance = "github-attestations"` and SHA-256 checksums. The old 3.9.19 rejection was not bypassed. As explicitly approved, Python's owner/version changes occur together in this checkpoint. No old pip environment is copied or restored into it.

Current verification is **102 host passes /51 integration skips**, **152 VM passes /one GUI skip**. Native tests cover SSL, SQLite, ctypes, zlib and decimal imports, venv isolation without network/package installation, compiler execution, shell environment and native shims. Python now has its own failed-before-fix interrupted-install regression; strict setup checks `python` and `python3` along with the other required executables.

The actual disposable-account `runtimes` task also installed the upgraded defaults in its normal mise data directory, not just the private test data. Real rc/OMZ/Agnoster PTY checks passed with both private and normal guest runtime data. Existing asdf installations are not uninstalled. Mise printed optional system-JDK registration instructions, but **no sudo/JavaVirtualMachines registration commands were executed**.

These are interpreter/compiler/venv and shell acceptance checks, not evidence that old Python applications, Android/Gradle builds, IDE discovery or all third-party packages support the new versions. Those consumers need their own tests if revived. The earlier ownership inventory remains a historical snapshot; standalone CLI reproduction and host/publication gates are still open.

References: [mise early settings](https://mise.jdx.dev/configuration/settings.html), [shims](https://mise.jdx.dev/dev-tools/shims.html), [Java](https://mise.jdx.dev/lang/java.html), [Python](https://mise.jdx.dev/lang/python.html), [Gradle 8.13 compatibility](https://docs.gradle.org/8.13/userguide/compatibility.html), and the [read-only ownership inventory](runtime-package-ownership.md).
