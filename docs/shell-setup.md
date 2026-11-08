# Shell startup and PATH ownership

These changes are on `chore/mise-deployment`, not the host's live checkout. Editing or merging files behind the host's existing symlinks is a rollout operation. Do not source this worktree's rc into the host to test it.

## Startup order

1. Set the existing Oh My Zsh location/theme.
2. Source `.path` so dependent plugins can find installed tools.
3. Register existing Docker/asdf completion directories, then let **Oh My Zsh own the single `compinit` pass**. Keep the existing plugin collection and Agnoster theme.
4. Load personal aliases/functions, interactive GPG tty information and any existing iTerm/Bun shell integration.
5. Source a readable regular **`~/.zshrc.local`** if present.
6. Activate mise **last**, after other PATH writers, so Node/Bun/project pnpm remain mise-owned while asdf continues serving unmigrated languages.

Docker/asdf completion directories are included only when present and before completion initialization. Existing Bun completion code is still loaded after the framework has supplied `compdef`. No second completion initialization is added for it.

## Optional helpers

- Shell startup no longer runs `gpgconf --launch gpg-agent`. GPG can start its agent on demand. Existing agents and keys are not stopped, removed or changed. If an independently configured SSH/GPG workflow requires explicit agent startup, invoke `gpgconf --launch gpg-agent` deliberately rather than paying that cost in every shell.
- `GPG_TTY` uses Zsh's existing `$TTY` only when stdin is a tty and GPG is available. No `tty` process runs in `.path`, and non-tty startup does not invent a `not a tty` value or overwrite an inherited setting.
- With `thefuck` installed, `fuck` initializes its trusted CLI-generated correction function on first use, not every startup. Missing tools are quiet; failed initialization returns its failure and can be retried. Existing Git/fzf helper definitions remain intact.

## PATH policy

`.path` remains POSIX-sourceable. Managed additions are existing **absolute directories**, added only once even when the file is sourced again. It preserves inherited PATH entries/order and explicit user configuration; this is not a blanket sanitizer of arbitrary inherited values.

- A supplied `HOMEBREW_PREFIX` is respected. Otherwise the native macOS prefix is selected by architecture (`/opt/homebrew` ARM64, `/usr/local` Intel). No `brew --prefix` process runs at startup. An available prefix supplies its bin/sbin and libpq bin directory.
- Local, Bun, pnpm and git-fuzzy bin directories are included only when present; existing installations are not deleted or adopted by a new owner.
- `GOBIN` takes priority when set. Otherwise existing `bin` directories under configured `GOPATH` roots are searched, not the bare workspace roots. Exported custom roots and paths containing spaces are retained; no `go env` process runs at startup.
- Android honors an inherited SDK root/home or the conventional `~/Library/Android/sdk`, but only an existing SDK is advertised and only installed emulator/platform-tools/cmdline-tools directories enter PATH. No SDK download or account setup occurs.
- No automatic `./node_modules/.bin` entry remains. Use a project script, `bun run`, `npm exec` or `pnpm exec` instead of implicitly trusting the current directory for command lookup.

## Vulkan and dynamic libraries

An SDK's mere presence must not inject its libraries into every command. `.path` no longer creates Vulkan loader variables or prepends Vulkan to `DYLD_LIBRARY_PATH`. Explicit inherited values remain the user's choice and are not silently erased.

Scope Vulkan to the build/project that needs it, for example:

```sh
sdk="$HOME/vulkan_sdk/macOS"
env VULKAN_SDK="$sdk" \
  VK_ICD_FILENAMES="$sdk/etc/vulkan/icd.d/MoltenVK_icd.json" \
  VK_LAYER_PATH="$sdk/etc/vulkan/explicit_layer.d" \
  DYLD_LIBRARY_PATH="$sdk/lib${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}" \
  PATH="$sdk/bin:$PATH" your-build-command
```

Use the actual installed SDK location, or reviewed project-local mise environment settings. Do not add these variables to the shared global runtime config. A new shell can still inherit old exports from its parent; use a fresh login environment when evaluating removal, rather than blindly unsetting somebody else's explicit library configuration.

## Local override

Create **`~/.zshrc.local`**, not a tracked configuration replacement, for device-specific environment, PATH additions or alias overrides. It is optional and is never created, linked or overwritten by setup. `/.zshrc.local` is also ignored in the repository to prevent an accidental copy from being committed. It is not an encrypted secret store.

The override runs after the managed paths/aliases and framework, but before mise activation. It may override aliases and add its own guarded paths. It is not a pre-framework theme/plugin hook; shared theme/plugin selection remains in `.zshrc`. A custom SDK declared there must include its desired command paths explicitly rather than expecting earlier default-path discovery to run again.

## Guest evidence and limits

Before/after measurements used the same disposable Sequoia ARM64 guest, actual rc/Oh My Zsh, current HOME as cwd, real PTYs, system Zsh and eight sequential startup samples (first recorded separately; median of seven warm samples). Oh My Zsh update checks were disabled for both measurements to avoid network noise. This measures startup, not an iTerm font-rendering benchmark or prompt cost in a large Git repository.

| Probe | Before | After |
| --- | --- | --- |
| Warm startup median | 814.64 ms | 140.33 ms |
| Profiled `compinit` calls | 2 | 1 |

That is about **83% less startup time in this guest**, not a promise for every machine. The initial after-checkpoint median was 131.67 ms; the table reports the final-code rerun rather than selecting the faster sample. Independent five-sample command medians identified `gpgconf --launch gpg-agent` at **577 ms**, `thefuck --alias` at **79 ms**, and mise activation at **13 ms**. No timing instrumentation was added to the production rc.

A real guest PTY still loads Agnoster, keeps fzf's Ctrl-R binding, sets GPG's actual tty, resolves mise-owned Node/Bun, and switches Node **26.13.0 → 16.20.2 → 26.13.0** with isolated runtime data. Fixtures cover missing optional tools, lazy correction/retry behavior, pre-framework completion paths, PATH idempotency/spacing/custom SDKs and Go roots, inherited-value preservation, POSIX sourcing, and the ignored local override. Intel execution, the host rollout and remaining package-consumer inventory (such as git-fuzzy/doctl) remain separate work.

Private logs/backups are referenced by `~/Library/Caches/dotfiles-vm/last-shell-startup.path`; no host credentials, home mounts or live host rc sourcing are involved. See [testing](testing.md) for ordinary and VM checks.
