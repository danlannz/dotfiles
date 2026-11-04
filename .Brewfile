# Reviewed against Homebrew catalogs and the NZ App Store on 2026-11-02.

# Tart's current Homebrew dependency (softnet) requires macOS 26 Tahoe.
# Skip it on older hosts rather than breaking bundle installation.
if OS.mac? && Hardware::CPU.arm? && MacOS.version >= :tahoe
  tap "openai/tools", trusted: { formulae: ["tart", "softnet"] } # Tart virtualization tools; scoped trust only
  brew "openai/tools/tart"                                       # Repeatable macOS VM bootstrap testing
end

brew "ack"                                                       # Programmer-oriented text search
brew "agent-browser"                                             # Browser automation CLI for AI agents
brew "asdf"                                                      # Legacy Java/Kotlin/Python manager; Node/Bun use mise
brew "automake"                                                  # Generate GNU-compatible Makefiles
brew "awscli"                                                    # Amazon Web Services command-line interface
brew "bat"                                                       # Display files with syntax highlighting and Git integration
brew "cloudflared"                                               # Cloudflare Tunnel client
brew "cmake"                                                     # Cross-platform build configuration
brew "cocoapods"                                                 # Dependency manager for Apple application projects
brew "coreutils"                                                 # GNU file, shell, and text utilities
# brew "deno"                                                    # JavaScript and TypeScript runtime
brew "diff-so-fancy"                                             # Improve readability of terminal Git diffs
brew "duckdb"                                                    # Embedded analytical SQL database
brew "eza"                                                       # Modern ls replacement;
brew "fd"                                                        # Fast, user-friendly alternative to find
brew "ffmpeg"                                                    # Record, convert, and stream audio and video
brew "fontforge"                                                 # Create and edit font files
brew "fzf"                                                       # Interactive command-line fuzzy finder
brew "git"                                                       # Distributed version control
# NOTE: openssl is a valid rolling alias, currently openssl@4; pin explicitly if an older ABI is required.
brew "openssl"                                                   # TLS and cryptography toolkit
brew "gh"                                                        # GitHub command-line interface
brew "gifsicle"                                                  # Create, optimise, and manipulate GIF images
brew "git-delta"                                                 # Syntax-highlighting pager for Git diffs
brew "glow"                                                      # Render Markdown in the terminal
brew "gnupg"                                                     # OpenPGP encryption and signing
brew "go"                                                        # Go compiler, runtime, and developer tools
brew "grc"                                                       # Colourise logs and command output
brew "htop"                                                      # Interactive process and resource monitor
brew "hub"                                                       # Git wrapper with GitHub commands
brew "imagemagick"                                               # Image conversion and manipulation tools
brew "jq"                                                        # Command-line JSON processor
brew "lcov"                                                      # Collect and report code coverage
brew "libpq"                                                     # PostgreSQL client library and CLI tools
brew "libsodium"                                                 # Networking and cryptography library
brew "llm"                                                       # Access language models from the command line
brew "mackup"                                                    # Back up and restore application settings
brew "mas"                                                       # Mac App Store command-line interface
brew "mise"                                                      # Runtime management and explicit dotfile deployment
brew "mkcert"                                                    # Create locally trusted development certificates
brew "neovim"                                                    # Extensible terminal text editor
brew "nss"                                                       # Mozilla Network Security Services libraries and tools
brew "opencode"                                                  # Terminal-based AI coding agent
brew "overmind"                                                  # Run Procfile-based applications using tmux
brew "pinentry-mac"                                              # Native macOS GPG passphrase prompt
brew "poppler"                                                   # PDF rendering and inspection utilities
# NOTE: postgres is a valid rolling alias, currently postgresql@18; choose a major explicitly before database migration.
# brew "postgres"                                                # PostgreSQL database server
brew "pygments"                                                  # Generic syntax highlighter
brew "protobuf"                                                  # Protocol Buffers compiler and libraries
brew "railway"                                                   # Railway application deployment CLI
brew "ripgrep"                                                   # Fast recursive text search
brew "rtk"                                                       # Reduce token-heavy command output for coding agents
brew "rust"                                                      # Rust compiler and Cargo package manager
brew "shellcheck"                                                # Static analysis for shell scripts
brew "socat"                                                     # Connect and relay between sockets and streams
brew "ssh-copy-id"                                               # Add an SSH public key to a remote account
brew "swiftlint"                                                 # Enforce Swift style and conventions
# brew "tesseract"                                               # Optical character recognition engine
brew "thefuck"                                                   # Correct mistyped console commands
brew "tlrc"                                                      # Concise command examples
brew "tree"                                                      # Display directory trees
brew "uv"                                                        # Fast Python package and environment manager
brew "wget"                                                      # Download files over HTTP/FTP
brew "xz"                                                        # General-purpose compressed-file tools
brew "zsh-completions"                                           # Additional Zsh completion definitions
brew "zsh-syntax-highlighting"                                   # Highlight commands while typing in Zsh

# cask "1password-cli"                                           # OPTIONAL: 1Password command-line interface
# cask "adoptopenjdk8"                                           # Java 8 JDK; NOTE: unavailable token; choose a supported JDK (e.g. temurin@8) explicitly.
cask "android-file-transfer"                                     # Transfer files to/from Android devices
cask "android-studio"                                            # Android application IDE and development tools
cask "appcleaner"                                                # Remove applications and associated files
# cask "barrier"                                                 # Software keyboard/mouse sharing; NOTE: disabled by Homebrew because upstream is unmaintained.
cask "blender"                                                   # 3D modelling, animation, and rendering suite
cask "brave-browser"                                             # Privacy-oriented web browser
cask "bruno"                                                     # Local-first HTTP and GraphQL API client
cask "charles"                                                   # HTTP/HTTPS debugging proxy
cask "claude-code"                                               # Terminal-based Claude coding assistant
# cask "divvy"                                                   # Resize and arrange application windows
cask "discord"                                                   # Voice, video, and community chat
cask "docker-desktop"                                            # Docker containers and GUI; NOTE: renamed from docker.
cask "expo-orbit"                                                # Launch mobile builds and manage simulator workflows
cask "firefox"                                                   # Firefox web browser
cask "font-hack-nerd-font"                                       # Hack developer font with Nerd Font icons
cask "ghostty"                                                   # GPU-accelerated native terminal emulator
cask "google-chrome"                                             # Google Chrome web browser
cask "handbrake-app"                                             # Convert and transcode video files
# cask "insomnia"                                                # HTTP and GraphQL API client # replaced by bruno
cask "iterm2"                                                    # Terminal emulator
# cask "keepingyouawake"                                         # OPTIONAL: prevent the Mac from sleeping
# cask "orka"                                                    # OPTIONAL: Kubernetes-based Apple virtualization orchestration
cask "oversight"                                                 # Monitor microphone and webcam access
cask "paseo"                                                     # Remote access to self-hosted coding agents
# cask "ngrok"                                                   # Secure tunnels to local development services
cask "notion"                                                    # Notes, documents, and collaborative workspace
cask "plex-media-server"                                         # Home media server
# cask "postman"                                                 # API development and testing client # replaced by bruno
cask "postgres-app"                                              # PostgreSQL server packaged as a macOS application
cask "raycast"                                                   # Keyboard-driven launcher and productivity tools
# cask "sizeup"                                                  # OPTIONAL: keyboard-driven window positioning (compare with Divvy/Yabai)
cask "smartgit"                                                  # Graphical Git client
# cask "steam"                                                   # PC game distribution and launcher
# cask "subler"                                                  # OPTIONAL: mux and tag MP4 media
# cask "sublime-text"                                            # Text and code editor
cask "spotify"                                                   # Music and podcast streaming
cask "the-unarchiver"                                            # Extract compressed archives
cask "tableplus"                                                 # Database GUI client
cask "tailscale-app"                                             # WireGuard-based mesh VPN application
cask "transmission"                                              # BitTorrent client
cask "utm"                                                       # GUI for macOS/Linux virtual machines
# cask "virtualbox"                                              # Virtual machines; NOTE: the current cask targets ARM64 hardware.
cask "visual-studio-code"                                        # Code editor and debugger
cask "vlc"                                                       # Media player
# cask "realvnc-connect-viewer"                                  # OPTIONAL: remote desktop viewer; NOTE: renamed from vnc-viewer.
cask "whatsapp"                                                  # WhatsApp desktop messaging
# cask "zoom"                                                    # Video meetings and communication

# App Store apps are opt-in: see Brewfile.app-store and script/setup-app-store.
