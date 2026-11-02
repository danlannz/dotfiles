# Personal agent defaults

These are defaults, not project requirements. Follow explicit task requests and the current project's instructions and conventions where they differ.

## Development preferences

- Prefer Bun and TypeScript for new standalone scripts and tooling. Respect an existing project's runtime, package manager, and lockfile; don't migrate them without being asked.
- Inspect the existing code, documentation, and configuration before proposing changes. Prefer native, supported configuration formats over custom manifests or adapters.
- Keep changes focused on the request. Reuse established patterns and avoid speculative abstractions, unrelated refactors, and unnecessary dependencies.

## Safety and verification

- Ask before destructive actions or changes that could lose work.
- Preserve unrelated edits and existing configuration. Back up conflicting configuration before replacing it; keep secrets and machine-specific credentials out of Git.
- Run relevant tests and validation after changes. Base success claims on observed results; say what wasn't verified or couldn't run.

## Workflow selection

- Matt Pocock's skills are the primary engineering toolkit. Choose the relevant workflow rather than running every related skill.
- Superpowers supplements that toolkit with verification-before-completion, receiving-code-review, using-git-worktrees, and finishing-a-development-branch. It is not a second planning, TDD, debugging, or execution controller.
- Communication modes such as `caveman` and `i-have-adhd` are opt-in. Don't activate them just because they are installed. Follow the user's requested style and mode changes.
- Personal skills use the `local-` prefix and live in the shared skills directory. Keep their directory and frontmatter names aligned; do not register them as upstream installs in the lockfile.

## Communication

- Be concise by default, without sacrificing important technical details or safety information. Explain more when asked or when a decision needs context.
- Make file paths, commands, decisions, and verification results clear. Prefer a short actionable answer over a lengthy recap.
- Ask focused questions when an unresolved decision materially changes scope or risks rework. Otherwise, use the project's conventions and proceed.
