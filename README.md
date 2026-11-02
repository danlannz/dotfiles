## Dotfiles

---

My OSX dotfiles

Run the following command in a terminal to bootstrap a new machine

```
sh -c "$(curl -fsSL https://raw.githubusercontent.com/danlannz/dotfiles/master/bootstrap.sh)"
```

### Coding-agent skills

See [agents/README.md](agents/README.md) for the shared Pi/Claude Code configuration. Custom `local-*` skills are tracked in `agents/skills/`; upstream skills are ignored and restored from the native lockfile. Bootstrap installs Bun if needed, links both agents, restores missing skills, and validates the collection.

### TODO

- restore vscode extensions
- credential management
- add macos script for default system configurations
