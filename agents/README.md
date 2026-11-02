# Agent configuration

Shared configuration lives in `agents/`, rather than a top-level `.agents/` that the generic dotfiles bootstrap would link over machine-local agent state.

## Layout

```text
agents/
  skills/
    tdd/                   # Downloaded, ignored by Git
    local-my-workflow/     # Custom, tracked in Git
  .skill-lock.json         # Native Skills CLI global metadata, tracked
  instructions.md          # Shared personal defaults and workflow policy
  setup.ts
  setup.test.ts
```

The home directories share this collection through whole-directory symlinks:

```text
~/.agents/skills           -> ~/.dotfiles/agents/skills
~/.claude/skills           -> ~/.dotfiles/agents/skills
~/.agents/.skill-lock.json -> ~/.dotfiles/agents/.skill-lock.json
~/.pi/agent/AGENTS.md      -> ~/.dotfiles/agents/instructions.md
~/.claude/rules/dotfiles.md -> ~/.dotfiles/agents/instructions.md
```

If `XDG_STATE_HOME` is set, the lockfile link goes under `$XDG_STATE_HOME/skills/` instead. Skill directory links remain as shown above.

## Personal instructions

Edit `instructions.md` to tune shared development and communication defaults. It prefers Bun/TypeScript for new tooling, native configuration formats, focused changes, explicit approval for commits/pushes, and evidence-backed verification. Project conventions and explicit requests take precedence over these defaults.

The workflow policy makes Matt Pocock the primary toolkit, Superpowers supplementary guardrails, and `caveman`/`i-have-adhd` opt-in communication modes. No model, permission, or MCP settings are changed.

Pi reads this through its global `AGENTS.md`; `PI_CODING_AGENT_DIR` overrides the default `~/.pi/agent` destination. Claude reads it as an unconditional user-level rule, leaving existing `~/.claude/CLAUDE.md` imports (including RTK) and unrelated rules untouched. Existing conflicting files at the managed destinations are backed up. A Pi `AGENTS.override.md` in the same directory takes precedence over `AGENTS.md` and needs separate review if present.

Run `/reload` in Pi or start a new Claude session after editing. For discovery details, see [Pi configuration](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/configuration.md) and [Claude memory/rules](https://code.claude.com/docs/en/memory).

## New device

The dotfiles bootstrap installs Bun if needed and runs setup. To run independently:

```sh
bun ~/.dotfiles/agents/setup.ts --dry-run
bun ~/.dotfiles/agents/setup.ts
```

Setup validates existing skills and lock metadata, plans missing downloads, creates the global links, restores missing managed skills with CLI 1.7.4, then verifies links and collection structure. It supports GitHub sources (all current entries), honors explicit Git refs, and fails before linking if a missing source cannot be restored. Download failures return failure; rerunning resumes missing installs. Existing managed content is not overwritten by setup.

Missing downloads resolve **current upstream content unless an explicit ref is recorded**. Hashes in the lockfile are change detectors, not downloadable versions; setup does not verify upstream hashes. Downloads may update the lockfile, so review it afterward. Malformed existing skills fail validation rather than being silently overwritten.

Existing directories/files or conflicting links are renamed to adjacent `*.backup-*` paths, not deleted or merged. Correct links are left alone. Review backups for machine-only skills. Restart agent sessions afterward. Agent applications, credentials, and subagent tooling are configured separately.

## Custom skills: use `local-`

Create a skill through any of these equivalent paths:

```text
~/.dotfiles/agents/skills/local-my-workflow/SKILL.md
~/.agents/skills/local-my-workflow/SKILL.md
~/.claude/skills/local-my-workflow/SKILL.md
```

Use matching frontmatter:

```yaml
---
name: local-my-workflow
description: When to use this skill.
---
```

No manifest entry, mapping, per-skill link, or bootstrap rerun is needed. Commit the folder; other devices receive it with `git pull`. Custom skills are not registered in the lockfile. Setup rejects managed entries with the reserved `local-` prefix and warns about unregistered, unprefixed skills that Git would otherwise silently ignore.

Root `.gitignore` ignores `agents/skills/*` except `local-*/`. These are glob patterns, not regex. New upstream additions need no ignore changes. To adapt an upstream skill, copy it as `local-<name>`, change its frontmatter name, and retain applicable license texts and notices inside its `local-*` folder. Never edit the managed original expecting those edits to be tracked. Keep secrets and machine-local data out of custom skills.

## Upstream maintenance

Requires Bun, Git, and network access:

```sh
bunx --bun skills@1.7.4 list --global
bunx --bun skills@1.7.4 update --global
bunx --bun skills@1.7.4 add <owner/repo> --global --agent claude-code pi --skill <name> --yes
bunx --bun skills@1.7.4 remove <name> --global --yes
```

CLI operations write through the links. Upstream content stays ignored; review/commit `agents/.skill-lock.json` plus any `local-*` changes. Pull before updating, avoid concurrent Git/CLI writes, and rerun setup to validate or restore additions from another device. Existing skills aren't updated by setup: use the CLI update command. Removing a lock entry alone does not delete an already-downloaded skill on another device; remove that obsolete skill explicitly.

No experimental project sync, custom install manifest, or duplicate plugin installations are involved. Global directory links were tested with CLI 1.7.4 add/update/remove; retest when upgrading the CLI.

## Collection

**[Matt Pocock](https://github.com/mattpocock/skills): primary workflow (23 skills)**

| Purpose | Skills |
| --- | --- |
| Choose/clarify | `ask-matt`, `grill-me`, `grill-with-docs`, `grilling`, `prototype` |
| Domain/architecture | `domain-modeling`, `codebase-design`, `improve-codebase-architecture` |
| Plan | `to-spec`, `to-tickets`, `wayfinder` |
| Implement | `implement`, `implement-spec`, `tdd` |
| Diagnose/review | `diagnosing-bugs`, `code-review` |
| Supporting workflows | `setup-matt-pocock-skills`, `triage`, `research`, `pr`, `retro`, `handoff`, `writing-for-agents` |

Run `/setup-matt-pocock-skills` per project for tracker/domain-doc configuration. Orchestration requires suitable host tools; skills alone don't provide them.

**[Superpowers](https://github.com/obra/superpowers): complementary guardrails (4 skills)**

`verification-before-completion`, `receiving-code-review`, `using-git-worktrees`, `finishing-a-development-branch`. No Superpowers bootstrap/plugin/hooks or competing TDD/planning/debugging/execution workflows.

**Other:**

- [`juliusbrussee/caveman`](https://github.com/juliusbrussee/caveman): `caveman`, terse responses.
- [`vercel-labs/skills`](https://github.com/vercel-labs/skills): `find-skills`, discovery.
- [`ayghri/i-have-adhd`](https://github.com/ayghri/i-have-adhd): `i-have-adhd`, opt-in ADHD-friendly response formatting. Invoke `/i-have-adhd`; disable with “stop adhd mode” or “normal mode”.

`zoom-out` is intentionally absent; Matt removed it because it went unused. Caveman uses its own upstream, not Matt's removed copy.

## Tests

```sh
bun test ~/.dotfiles/agents/setup.test.ts
```

Tests use temporary homes and a mocked CLI to verify validation, restoration, backups, idempotency, custom skills, and Git ignore behaviour without modifying your real installation.
