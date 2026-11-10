# Pi configuration

A **native local Pi package**, not a replacement agent directory or settings merger. Its conventional resource directories are intentionally empty until you choose customizations.

## Ownership

| Concern | Authority |
| --- | --- |
| Pi executable | Exact `pi` version in [`mise/config.toml`](../../mise/config.toml), native [`mise/mise.lock`](../../mise/mise.lock). Currently **1.5.0**, backend `aqua:earendil-works/pi`. |
| Shared Pi extensions, prompts and themes | This private package and its conventional directories. No custom resource manifest/loader. |
| Shared instructions and skills | Existing [agent module](../README.md), `instructions.md` and native skill lockfile. No duplicate skill inventory here. |
| Preferences, additional packages, keybindings, models, auth and sessions | Native files in `~/.pi/agent`, or an explicit `PI_CODING_AGENT_DIR`. Machine-local; never copied into Git. |
| Project configuration | Native `.pi/` files and Pi's normal trust/precedence rules. No blanket project trust. |

The official standalone release includes its runtime. Unlike the existing host Bun-installed npm package, its entry point does **not** run a project-selected Node or require Node >=22.19 on PATH. Agent shell commands still use the project's environment; no custom interpreter wrapper or `shellCommandPrefix` is added. Old Bun/NVM/Yarn installations remain untouched.

## Setup and preservation

After reviewed native dotfile deployment, run:

```sh
mise -C ~/.dotfiles run agents
```

**This is deployment to the invoking account, not a host-safe verification command.** It strictly installs/checks the managed tools, runs the existing shared-agent module, then runs `agents/setup-pi.ts`.

The Pi step delegates registration to `pi install <checkout>/agents/pi --no-approve`, offline with telemetry disabled for that invocation. Pi owns its native `settings.json` write and relative package-source representation. Existing preferences, unknown settings, unrelated packages and resource filters survive. It does not replace the agent directory, auth, sessions, models, keybindings or local extensions.

A needed registration first backs up existing settings to a private adjacent `settings.json.backup-*` file. Malformed settings fail without rewriting that file; native registration is checked afterward because Pi 1.5 can warn about failed settings writes yet return success. An already-registered package, including a filtered object entry, is left byte-for-byte unchanged with no extra backup. Backups are recovery material; setup does not automatically overwrite later user edits to restore one. The shared-agent step has its own earlier link/restoration side effects; the combined task is not a universal transaction.

Preview **only** the Pi registration, without invoking Pi or writing settings:

```sh
bun ~/.dotfiles/agents/setup-pi.ts --dry-run
```

Use an absolute `PI_CODING_AGENT_DIR` when overriding the destination for the complete shared-agent task. Registration is path-based: after moving the checkout, review `pi list` and explicitly remove any obsolete local-package source. Setup never prunes unrelated registrations.

## Customize using Pi conventions

- **Extensions:** add `extensions/my-workflow.ts`, exporting a default factory. Pi supplies its extension SDK at runtime; do not bundle another copy of Pi. Added extension code executes globally with the agent's permissions, so review it like executable code.
- **Prompt templates:** add `prompts/review.md` with optional YAML frontmatter (`description`) and the prompt body; invoke `/review`.
- **Themes:** add `themes/my-theme.json` following Pi's theme schema, then choose it with `/settings`. Start from an official theme example and retain applicable attribution.
- Run **`/reload`** after edits or adding files. No bootstrap rerun, per-file symlink or inventory entry is required.
- Use **`pi config`** for native resource/package selection. Disabling this package's resources is respected by setup.
- Keep custom shared skills under **`../skills/local-*/`**, following the existing module's namespace/lock policy.

Minimal extension:

```ts
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

export default function (pi: ExtensionAPI) {
  pi.registerCommand('hello', {
    handler: async (_args, ctx) => { ctx.ui.notify('Hello'); },
  });
}
```

There are no package dependencies today. If a future extension needs third-party dependencies, add and lock them deliberately; local Pi packages do not automatically install them. Pi SDK packages belong in peer dependencies, not bundled runtime dependencies. Do not add a speculative installer before a real dependency exists.

Use native `/settings` and machine-local files for model, theme, permission and keybinding preferences. Additional `pi install` packages remain native user configuration; setup does not replace their list. Project `.pi/settings.json` remains project-owned and subject to native trust. No theme, model, permission, MCP server or provider is selected by this package.

## Updating Pi

Update through **mise**, review/commit the production version/lock changes, and rerun verification. For an approved active deployment, the native update command is:

```sh
mise upgrade --global --bump --pin --no-prune pi
```

This writes the **active global** configuration, so do not run it on the host merely to work on this branch. Do not update Pi independently with Bun/npm or replace its managed binary manually. Standalone binaries have no default package-manager self-update command; any existing user `selfUpdateCommand`/`PI_SELF_UPDATE_COMMAND` is preserved and should be reviewed before rollout.

## Verified scope

On the disposable Sequoia ARM64 guest:

- Real locked standalone installation/version, executable ownership, poisoned-PATH Node independence, and interrupted-install rejection.
- Actual `agents` task registration, backup mode, repeat idempotency, custom agent paths with spaces, and preservation of preferences/package filters/auth/session sentinels.
- A private copy of this package accepts conventional SDK extension, prompt and theme additions. RPC loads the runtime SDK without Node, honors explicitly approved fixture project settings, and discovers a new prompt after native reload. Native `pi config` lists all three resource types without changing selection.
- Launching the real Pi shim inside a native **Node 24** project retains Node 24 for a real RPC shell command, while production defaults remain Node 26. This is a modern selection check, not restoration of the retired legacy compatibility matrix.
- The normal disposable account also installs Pi and registers the real package through `mise run agents`; a repeat is a no-op. The curated skill lock remains unchanged.

Full checkpoint verification: **106 host passes /58 opt-in skips**, **163 VM passes /one separate iTerm GUI skip** across 164 tests. Syntax/ShellCheck/actionlint/whitespace are checked separately. [Testing instructions](../../docs/testing.md) retain explicit VM/GUI gates. Tests send no model requests or credentials.

No host activation, Intel execution, authenticated provider check, every-third-party-extension compatibility, new GUI palette acceptance, untouched first-account bootstrap or published/hosted-CI success is claimed. Private raw evidence is referenced by `~/Library/Caches/dotfiles-vm/last-pi-cli.path`.

Native references, checked against Pi 1.5: [packages](https://github.com/earendil-works/pi/blob/v1.5.0/packages/coding-agent/docs/packages.md), [extensions](https://github.com/earendil-works/pi/blob/v1.5.0/packages/coding-agent/docs/extensions.md), [prompts](https://github.com/earendil-works/pi/blob/v1.5.0/packages/coding-agent/docs/prompt-templates.md), [themes](https://github.com/earendil-works/pi/blob/v1.5.0/packages/coding-agent/docs/themes.md), [settings](https://github.com/earendil-works/pi/blob/v1.5.0/packages/coding-agent/docs/settings.md), [release assets](https://github.com/earendil-works/pi/releases/tag/v1.5.0).
