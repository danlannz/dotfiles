# Brewfile lifecycle review

Reviewed 2026-11-02 against Homebrew's complete official formula/cask catalogs and rename maps, plus Apple's NZ App Store lookup API. Reconciled with the owner's subsequent package-selection cleanup using the same cached metadata snapshot. This checks package names, lifecycle flags, and documented platform requirements—not whether every installed application is up to date or still personally useful.

## Changes

- Removed the bootstrap's inline core/cask/services tap bundle.
- Removed explicit `homebrew/bundle`, `homebrew/core`, `homebrew/cask`, `homebrew/services`, and `homebrew/cask-versions` tap declarations from `.Brewfile`. Bundle/services are built in; normal core/cask usage is API-backed; the services/versions taps are retired.
- Added a short inline description to every declaration, including optional/commented tools and taps.
- Initially annotated unavailable/disabled packages; the owner subsequently removed most of those declarations entirely. Remaining inactive lifecycle warnings are retained.
- Preserved the owner's selection of supported tools; release age alone is not proof of obsolescence.
- Kept the existing Sequoia-safe Tart guard and scoped trust declarations.

## Owner's package-selection cleanup

Compared with the previous reviewed Brewfile (the VM-tested snapshot with SHA-256 `91f1592c9689b07a170df8bad940bebc6b99559d7d771aa1e206ee6546b99fde`):

- Enabled maintained replacements `eza` and `tlrc` in place of unavailable `exa` and `tldr`. Both replacements are present and neither deprecated nor disabled in the catalog snapshot.
- Removed active declarations for `fork-cleaner`, `kubernetes-cli`, `dash`, `react-native-debugger`, and `sketch`.
- Made `deno`, `postgres`, `tesseract`, `divvy`, `insomnia`, `postman`, `steam`, `sublime-text`, `virtualbox`, and `zoom` optional/commented.
- Removed the unused Heroku tap, obsolete commented entries, and optional App Store IDs previously missing from the NZ lookup.
- Initially kept `libpq` active without the PostgreSQL server; the owner subsequently selected Postgres.app as described below. The formula-based `postgres` server remains optional/commented.

No remaining executable shell/bootstrap reference to these removed commands was found in the repository. The existing Yabai window rule for Zoom is harmless when Zoom is absent. These are provisioning choices, not uninstall commands: deleting or commenting a declaration does not remove existing software.

**Resolved review gap:** At the owner's request, added `cask "bruno"` so fresh setups provision the intended replacement for Insomnia/Postman. Both older clients remain optional/commented. This changes provisioning configuration only; Bruno was not installed on the host.

## Additional owner-selected software

After reviewing the locally installed Homebrew inventory, the owner selected these additions:

- **13 casks:** `tailscale-app`, `raycast`, `postgres-app`, `oversight`, `paseo`, `notion`, `handbrake-app`, `ghostty`, `font-hack-nerd-font`, `expo-orbit`, `claude-code`, `charles`, `blender`.
- **18 formulas:** `agent-browser`, `llm`, `opencode`, `rtk`, `oven-sh/bun/bun`, `cocoapods`, `gh`, `rust`, `uv`, `cloudflared`, `railway`, `diff-so-fancy`, `glow`, `htop`, `neovim`, `duckdb`, `ffmpeg`, `fontforge`.
- Added the official `oven-sh/bun` tap for the fully qualified Bun formula. Every new declaration has a description. All other selections and optional entries are unchanged.

Postgres.app provisions a database server via a cask; it does not enable the separate `postgres` formula or migrate existing databases. These are configuration additions only: no host installs or upgrades were run.

## Unavailable or disabled entries

| Declaration | Finding / action |
| --- | --- |
| `container-diff` | Not in the catalog; declaration removed. |
| `exa` | Not in the catalog; declaration removed and `eza` enabled. |
| `hyperscan` | Not in the catalog; declaration removed. |
| `openssl@1.1` | Legacy/EOL branch, no current formula; declaration removed. Consumers still need review before changing TLS-library ABI. |
| `tldr` | Not in the formula catalog; declaration removed and the official Rust client `tlrc` enabled. |
| `adoptopenjdk8` | Unavailable cask token; inactive. A supported Java distribution such as `temurin@8` needs an intentional choice. |
| `barrier` | Homebrew-disabled because upstream is unmaintained; inactive. |
| `hyperdock` | No current cask; declaration removed. |
| `skype` | Discontinued and disabled by Homebrew; declaration removed. |
| Optional `vmware-fusion` | Unavailable in the catalog; commented declaration removed. |

No replacements were installed during this review. Previously installed applications were not removed.

## Removed deprecated tool

`fork-cleaner` is deprecated because its upstream repository is archived, with disabling scheduled for 2027-01-16 in the catalog snapshot. The owner has now removed its declaration; the previous recommendation to decide whether to keep it is resolved.

## Renames and valid aliases

- `docker` → `docker-desktop`: updated to Homebrew's canonical renamed cask token, with a note. This is the same application, not a switch to a different container runtime.
- Optional `vnc-viewer` → `realvnc-connect-viewer`: updated its commented token and retained the historical name in the note.
- `postgres` is a **valid formula alias**, currently pointing at `postgresql@18`. It is now optional/commented, with its major-version/migration warning retained. This is an intentional opt-out, not a claim that the alias is invalid. No major-version selection or data migration was performed.
- `openssl` is a **valid formula alias**, currently pointing at `openssl@4`. It remains active with a rolling-alias/ABI warning.

The earlier audit's direct `/api/formula/postgres.json` 404 was not sufficient to classify it as removed. The complete formula catalog includes aliases and resolves it correctly. The audit already qualified that uncertainty; this review resolves it.

## Platform and App Store notes

- Current Tart depends on Softnet requiring Tahoe. The existing ARM/macOS 26+ guard remains; Tart is still skipped on the Sequoia host.
- The VirtualBox cask describes ARM64 virtualization. Its declaration is now optional/commented; the architecture note remains.
- The NZ store lookup confirms active IDs for Amphetamine, Harvest, and Slack.
- Current App Store Xcode is 27.2 and requires macOS 26.6+. Its declaration now has an explicit host-version guard; older hosts must obtain a compatible developer download manually. App Store installs cannot be used to silently pin an older Xcode release.
- Optional 1Blocker, StopTheMadness, and Tweetbot IDs were not returned by the NZ lookup. The owner removed those commented declarations; the lookup's regional absence is still not proof of global removal.
- Optional 1Password 7 remains available in that lookup; annotated as a legacy-generation choice to review, not incorrectly marked unavailable.

App Store declarations now live in the separate native `Brewfile.app-store`. Sign in through App Store during initial device setup, then opt in with `bootstrap.sh --app-store`, or later run `script/setup-app-store` to retry only missing App Store apps without rerunning other setup steps or requesting upgrades. The default bootstrap never attempts these apps. Current `mas` removed its account-status command, so the flow uses explicit consent rather than unreliable private account detection or credential handling.

The App Store region/metadata is a time-sensitive snapshot. Account/login requirements, app licences, and signed-in installation outcomes remain unverified in the disposable VM.

## Third-party taps

The owner removed `heroku/brew`; no active formula in this Brewfile requires it. The official `oven-sh/bun` tap now grants formula-scoped `trusted: { formulae: ["bun"] }` after the first VM run exposed missing trust. The guest retest installed and ran Bun 1.4.4; no blanket tap trust was granted. The OpenAI tap remains platform-guarded, trusting only Tart and Softnet rather than every package in the tap. On Sequoia, only the Bun tap is selected. Removing a declaration does not untap an existing installation.

## Verification

- Six Brewfile regression tests cover native App Store manifest isolation, scoped Bun trust, built-in/retired tap removal, descriptions in both manifests, obsolete entries being absent or inactive/annotated, and rolling-alias warnings without forcing optional PostgreSQL installation.
- The bootstrap command-boundary regression test initially failed at the obsolete inline tap bundle and passes after removal.
- All **69 tests** pass on host and guest across agent setup, bootstrap, both manifests, and the standalone App Store retry. The retry tests cover missing dependencies, failed installation followed by a successful retry/no-op, cwd independence, missing Homebrew, and invalid options; bootstrap tests cover default deferral, explicit initial opt-in, and failure propagation.
- Ruby syntax and read-only native `brew bundle list` parsing pass for the owner's updated selection. On the Sequoia host, **64 active formulas, 33 casks, and the Bun tap** are selected by default; the separate App Store manifest selects 3 optional-stage apps. All selected core formula/cask tokens resolve to non-disabled entries in the cached official catalogs; Bun resolves to installed metadata from its official third-party tap. Tart and Xcode are skipped by their existing platform guards.
- Native App Store selection from `Brewfile.app-store` contains Amphetamine, Harvest, and Slack on host and guest. The regular `.Brewfile` selects none; Xcode retains its platform guard.
- The earlier guarded UTM smoke test used the preceding Brewfile (49 formulas and 30 casks) and intentionally blocked installation with exit 125. On 2026-11-03, the latest selection, including the owner's subsequent `ngrok` opt-out, was tested with package installation enabled: 182 formulas/dependencies and 32 casks were registered. The run exposed missing Bun tap trust, a Tailscale vendor post-install launch failure in a guest without desktop login, and stalled App Store operations. The controller deliberately interrupted the App Store stage; **this is not an end-to-end pass**. The post-install hook/agent setup were not reached in that first run. The subsequent split-manifest/scoped-trust retest passed the regular dependency check twice and registered 192 formulas/dependencies plus 33 casks, including Bun and Tailscale. It reached the legacy post-install hook, where the controller stopped an Oh My Zsh `.zshrc` overwrite prompt to preserve configuration. A further focused native retest fixed that Oh My Zsh prompt, preserved `.zshrc` through a fresh installation and rerun, and verified all three custom plugins. A later interactive iTerm check found the preserved rc still referenced `/Users/Daniel`; `$HOME`-relative framework/completion/tool paths now load Agnoster in the actual guest login shell. Mackup still reports missing iCloud Drive in the disposable guest, and separate full reruns were blocked earlier by Homebrew update/connectivity. This is still **not a full-bootstrap pass**. See [VM results](utm-bootstrap-results.md).

No `brew upgrade`, package uninstall, `brew bundle cleanup`, or full host Brewfile install was run.

## Sources

- [Homebrew formula catalog](https://formulae.brew.sh/api/formula.json)
- [Homebrew cask catalog](https://formulae.brew.sh/api/cask.json)
- [Official formula rename map](https://github.com/Homebrew/homebrew-core/blob/HEAD/formula_renames.json)
- [Official cask rename map](https://github.com/Homebrew/homebrew-cask/blob/HEAD/cask_renames.json)
- [Homebrew Bundle documentation](https://docs.brew.sh/Brew-Bundle-and-Brewfile)
- [mas usage and authentication requirements](https://github.com/mas-cli/mas/blob/main/README.md)
- [mas releases (account command removed in v5)](https://github.com/mas-cli/mas/releases)
- [Eza metadata](https://formulae.brew.sh/api/formula/eza.json)
- [Tlrc metadata](https://formulae.brew.sh/api/formula/tlrc.json)
- [Bruno metadata](https://formulae.brew.sh/api/cask/bruno.json)
- [Fork-cleaner metadata](https://formulae.brew.sh/api/formula/fork-cleaner.json)
- [Barrier metadata](https://formulae.brew.sh/api/cask/barrier.json)
- [Skype metadata](https://formulae.brew.sh/api/cask/skype.json)
- [OpenAI Homebrew tap](https://github.com/openai/homebrew-tools)
- [Apple NZ App Store lookup](https://itunes.apple.com/lookup?country=nz&id=1107421413,1333542190,937984704,506189836,1289583905,803453959,1376402589,1384080005,497799835)
