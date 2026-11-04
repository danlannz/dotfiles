## Dotfiles

---

My OSX dotfiles

Run the following command in a terminal to bootstrap a new machine

```
sh -c "$(curl -fsSL https://raw.githubusercontent.com/danlannz/dotfiles/master/bootstrap.sh)"
```

### App Store apps

Sign in to the **App Store** during new-device setup if you want to install these apps immediately. With this version checked out, opt in during bootstrap:

```sh
/bin/bash ~/.dotfiles/bootstrap.sh --app-store
# Add --debug if needed; option order does not matter.
```

Without `--app-store`, bootstrap installs the regular `.Brewfile` and defers App Store apps. After signing in, retry **only** those apps:

```sh
~/.dotfiles/script/setup-app-store
```

The retry uses the separate native `Brewfile.app-store`, checks for missing apps, and does not upgrade existing apps or rerun security settings, linking, or post-install hooks. Failed installs return a failure status; rerunning after sign-in retries missing apps, while a satisfied manifest is a no-op. Current `mas` cannot reliably report account status, so neither command attempts to detect login or handle credentials. Xcode remains conditional on the host macOS version.

The remote command above uses published `master`; these local changes are unavailable there until published.

### Shell setup

The Oh My Zsh installer runs with `--unattended --keep-zshrc`: it preserves existing `.zshrc` files/symlinks, does not change the login shell, and does not launch an interactive shell. Missing custom plugins are repaired on reruns; existing plugin directories are left alone. Oh My Zsh download/installer and plugin-clone failures stop the hook.

Shell/framework, Bun completion, Docker completion, and per-user tool paths use `$HOME`, not a machine-specific account directory. Open a new terminal tab (or run `exec zsh -l`) after updating shell configuration. For Agnoster's separator glyphs, select an installed Powerline/Nerd Font such as **Hack Nerd Font** in your terminal profile; font installation alone does not select it in iTerm.

### Coding-agent skills

See [agents/README.md](agents/README.md) for the shared Pi/Claude Code configuration. Custom `local-*` skills are tracked in `agents/skills/`; upstream skills are ignored and restored from the native lockfile. Bootstrap installs Bun if needed, links both agents, restores missing skills, and validates the collection.

### Modernisation

The [living backlog](docs/modernisation-backlog.md) tracks the original audit, completed fixes, remaining safety/UX work and the mise adoption sequence. Original VS Code, credential-management and macOS-defaults TODOs are retained there.

See the [original audit](docs/dotfiles-audit.md), [mise fit review](docs/mise-fit-review.md), and [VM results](docs/utm-bootstrap-results.md) for evidence and limits.
