#!/bin/bash

# based on this https://github.com/mikemcquaid/strap
#/ Usage: bootstrap.sh [--debug] [--app-store | --security-check | --security-apply | --macos-updates]
#/ Install development dependencies on macOS.
set -e

INSTALL_APP_STORE=""
MODE="bootstrap"
for argument in "$@"; do
  case "$argument" in
    --debug) DEBUG="1" ;;
    --app-store) INSTALL_APP_STORE="1" ;;
    --security-check|--security-apply|--macos-updates)
      [ "$MODE" = bootstrap ] || { echo "Choose only one action mode." >&2; exit 2; }
      MODE="${argument#--}" ;;
    *) echo "Unknown option: $argument. Usage: $0 [--debug] [--app-store | --security-check | --security-apply | --macos-updates]" >&2; exit 2 ;;
  esac
done
if [ "$MODE" != bootstrap ]; then
  [ -z "$INSTALL_APP_STORE" ] || { echo "Action modes cannot be combined with --app-store." >&2; exit 2; }
  if [ "$MODE" != security-check ] && [ -n "$CI" ]; then
    echo "Explicit security/update changes are not allowed in CI." >&2
    exit 2
  fi
fi
[[ -o xtrace ]] && DEBUG="1"
SUCCESS=""
HOMEBREW_INSTALLER=""
CLT_PLACEHOLDER=""
CLT_PLACEHOLDER_CREATED=""
SUDO_AUTH_STARTED=""
SUDO_KEEPALIVE_PID=""
ATTENTION_ONLY=""

sudo_run() { sudo --non-interactive "$@"; }

cleanup() {
  local result=$?
  trap - EXIT INT TERM HUP
  set +e
  if [ -n "$SUDO_KEEPALIVE_PID" ]; then
    kill "$SUDO_KEEPALIVE_PID" 2>/dev/null
    wait "$SUDO_KEEPALIVE_PID" 2>/dev/null
  fi
  if [ -n "$CLT_PLACEHOLDER_CREATED" ]; then
    sudo_run rm -f "$CLT_PLACEHOLDER" || echo "!!! Could not remove the owned CLT placeholder: $CLT_PLACEHOLDER" >&2
  fi
  [ -z "$HOMEBREW_INSTALLER" ] || rm -f "$HOMEBREW_INSTALLER"
  # Never delete or replace an inherited askpass helper or its directory.
  if [ -n "$SUDO_AUTH_STARTED" ] && ! sudo --reset-timestamp; then
    echo "!!! Could not invalidate sudo authorization; run 'sudo -k' manually." >&2
    if [ "$result" -eq 0 ] || [ -n "$ATTENTION_ONLY" ]; then result=1; fi
    ATTENTION_ONLY=""
  fi
  if { [ -z "$SUCCESS" ] || [ "$result" -ne 0 ]; } && [ -z "$ATTENTION_ONLY" ]; then
    if [ -n "$STEP" ]; then
      echo "!!! $STEP FAILED" >&2
    else
      echo "!!! FAILED" >&2
    fi
    if [ -z "$DEBUG" ]; then
      echo "!!! Run '$0 --debug' for debugging output." >&2
    fi
  fi
  exit "$result"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

if [ -n "$DEBUG" ]; then
  set -x
else
  QUIET_FLAG="-q"
  Q="$QUIET_FLAG"
fi

STDIN_FILE_DESCRIPTOR="0"
INTERACTIVE=""
[ -t "$STDIN_FILE_DESCRIPTOR" ] && INTERACTIVE="1"

GIT_NAME="Daniel Landers"
GIT_EMAIL="daniel@landers.co.nz"
GITHUB_USER="danlannz"
# GITHUB_TOKEN=
# CUSTOM_HOMEBREW_TAP=
# CUSTOM_BREW_COMMAND=

# Suppress shell tracing around optional caller-provided credentials.
clear_debug() {
  set +x
}

reset_debug() {
  if [ -n "$DEBUG" ]; then
    set -x
  fi
}

# Native sudo owns password entry and its per-terminal credential cache.
# Headless callers must supply an existing authorization or their own askpass.
sudo_init() {
  SUDO_AUTH_STARTED="1"
  if [ -n "$INTERACTIVE" ]; then
    sudo --reset-timestamp
    sudo --validate || abort "Could not obtain initial sudo authorization."
  elif [ -n "$SUDO_ASKPASS" ]; then
    sudo --askpass --validate || abort "Could not obtain initial sudo authorization from the caller's helper."
  else
    sudo --non-interactive --validate || abort "Initial sudo authorization is required; run from a terminal or provide an external askpass helper."
  fi
}

sudo_refresh() {
  sudo --non-interactive --validate || abort "Lost sudo authorization; rerun bootstrap from a terminal."
}

start_sudo_keepalive() {
  # Without a terminal, sudo may scope tickets by parent PID instead. Refresh
  # those in foreground checkpoints, not from a different background parent.
  [ -n "$INTERACTIVE" ] || return 0
  local bootstrap_pid=$$
  (
    set +x
    sleeper=""
    trap '[ -z "$sleeper" ] || { kill "$sleeper" 2>/dev/null; wait "$sleeper" 2>/dev/null; }; exit 0' TERM INT HUP
    while kill -0 "$bootstrap_pid" 2>/dev/null; do
      sleep 60 & sleeper=$!
      wait "$sleeper" || exit
      sleeper=""
      kill -0 "$bootstrap_pid" 2>/dev/null || exit
      if ! sudo --non-interactive --validate; then
        echo "!!! Lost sudo authorization; stopping bootstrap without prompting again." >&2
        kill -TERM "$bootstrap_pid" 2>/dev/null
        exit 1
      fi
    done
  ) &
  SUDO_KEEPALIVE_PID=$!
}

abort() { STEP="";   echo "!!! $*" >&2; exit 1; }
log()   { STEP="$*"; sudo_refresh; echo "--> $*"; }
logn()  { STEP="$*"; sudo_refresh; printf -- "--> %s " "$*"; }
logk()  { STEP="";   echo "OK"; }

# Given a list of scripts in the dotfiles repo, run the first one that exists
run_dotfile_scripts() {
  if [ -d ~/.dotfiles ]; then
    (
      cd ~/.dotfiles
      for i in "$@"; do
        if [ -f "$i" ] && [ -x "$i" ]; then
          log "Running dotfiles $i:"
          # Preserve actionable conflict/installer diagnostics in normal runs too.
          "$i"
          break
        fi
      done
    )
  fi
}

# Read-only diagnostics: exit 0 = checked/on, 2 = attention needed, 1 = unknown/error.
# No passwords, recovery keys, security preferences or sudo timestamps are touched.
security_check() {
  local vault firewall pending=0
  if ! vault=$(LC_ALL=C fdesetup status); then
    echo "!!! FileVault status query failed; security is not verified." >&2
    return 1
  fi
  printf '%s\n' "$vault"
  case "$vault" in
    *"Encryption in progress"*|*"Decryption in progress"*|*"will be enabled after the next restart"*) pending=2 ;;
    "FileVault is On."*) ;;
    "FileVault is Off."*) pending=2 ;;
    *) echo "!!! Unrecognised FileVault status; security is not verified." >&2; return 1 ;;
  esac
  if ! firewall=$(PATH="$PATH:/usr/libexec/ApplicationFirewall" LC_ALL=C socketfilterfw --getglobalstate); then
    echo "!!! Firewall status query failed; security is not verified." >&2
    return 1
  fi
  printf '%s\n' "$firewall"
  case "$firewall" in
    *"State = 1"*|*"State = 2"*) ;;
    *"State = 0"*) pending=2 ;;
    *) echo "!!! Unrecognised firewall status; security is not verified." >&2; return 1 ;;
  esac
  if [ -e "$HOME/Desktop/FileVault Recovery Key.txt" ] || [ -L "$HOME/Desktop/FileVault Recovery Key.txt" ]; then
    echo "Legacy recovery-key file exists on Desktop. Review/move it to secure storage manually; its contents were not read."
    pending=2
  fi
  echo "Review FileVault recovery and screen-lock settings in System Settings. This is not a full security audit."
  return "$pending"
}

list_updates() {
  local update_status
  if update_status=$(LC_ALL=C softwareupdate --list); then
    [ -n "$update_status" ] || abort "Software update status was empty; it is not verified."
    printf '%s\n' "$update_status"
  else
    abort "Software update status query failed; no updates were requested."
  fi
}

if [ "$MODE" = security-check ]; then
  trap - EXIT INT TERM HUP
  security_check
  exit $?
fi

[ "$USER" = "root" ] && abort "Run as yourself, not root."
groups | grep $Q -E "\b(admin)\b" || abort "Add $USER to the admin group."
sudo_init
start_sudo_keepalive

if [ "$MODE" = security-apply ]; then
  log "Explicitly enabling the native Application Firewall (only):"
  sudo_run /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on
  security_status=0
  security_check || security_status=$?
  if [ "$security_status" -eq 2 ]; then ATTENTION_ONLY="1"; fi
  [ "$security_status" -ne 1 ] || abort "Security status could not be verified after the firewall action."
  SUCCESS="1"
  exit "$security_status"
fi

if [ "$MODE" = macos-updates ]; then
  log "Explicit macOS update installation requested (no automatic restart flag):"
  list_updates
  sudo_run softwareupdate --install --all
  echo "Update command completed. Review any native restart/owner-authorization requirements; no restart was requested by bootstrap."
  SUCCESS="1"
  exit 0
fi

# Prevent sleeping during script execution, as long as the machine is on AC power
caffeinate -s -w $$ &

# Check/report only. FileVault enablement/recovery and screen-lock policy belong
# in native System Settings; bootstrap never handles their secrets or consent.
log "Checking security status (read-only):"
if security_check; then
  logk
else
  security_status=$?
  [ "$security_status" -eq 2 ] || abort "Security status could not be verified."
  echo "Development provisioning will continue; manual security review is still required."
fi

# Install the Xcode Command Line Tools.
if ! [ -f "/Library/Developer/CommandLineTools/usr/bin/git" ]
then
  log "Installing the Xcode Command Line Tools:"
  CLT_PLACEHOLDER="/tmp/.com.apple.dt.CommandLineTools.installondemand.in-progress"
  if [ -e "$CLT_PLACEHOLDER" ] || [ -L "$CLT_PLACEHOLDER" ]; then
    [ -f "$CLT_PLACEHOLDER" ] && [ ! -L "$CLT_PLACEHOLDER" ] || abort "Unsafe Command Line Tools placeholder; inspect it manually."
  else
    # Atomically refuse existing files/links; never follow an attacker-controlled
    # /tmp symlink with a privileged touch or overwrite another install's marker.
    sudo_run /bin/bash -c 'set -C; : > "$1"' bootstrap-clt "$CLT_PLACEHOLDER"
    CLT_PLACEHOLDER_CREATED="1"
  fi

  if ! CLT_LIST=$(LC_ALL=C softwareupdate --list); then
    abort "Command Line Tools discovery failed; no update installation was requested."
  fi
  CLT_PACKAGE=$(printf '%s\n' "$CLT_LIST" | \
                grep -B 1 "Command Line Tools" | \
                awk -F"*" '/^ *\*/ {print $2}' | \
                sed -e 's/^ *Label: //' -e 's/^ *//' | \
                sort -V |
                tail -n1)
  [ -n "$CLT_PACKAGE" ] || abort "No compatible Command Line Tools update was found; install the tools manually first."
  sudo_run softwareupdate -i "$CLT_PACKAGE"
  if [ -n "$CLT_PLACEHOLDER_CREATED" ]; then
    sudo_run rm -f "$CLT_PLACEHOLDER"
    CLT_PLACEHOLDER_CREATED=""
  fi
  if ! [ -f "/Library/Developer/CommandLineTools/usr/bin/git" ]
  then
    if [ -n "$INTERACTIVE" ]; then
      echo
      logn "Requesting user install of Xcode Command Line Tools:"
      xcode-select --install
    else
      echo
      abort "Run 'xcode-select --install' to install the Xcode Command Line Tools."
    fi
  fi
  logk
fi

# Check if the Xcode license is agreed to and agree if not.
xcode_license() {
  if /usr/bin/xcrun clang 2>&1 | grep $Q license; then
    if [ -n "$INTERACTIVE" ]; then
      logn "Asking for Xcode license confirmation:"
      sudo_run xcodebuild -license
      logk
    else
      abort "Run 'sudo xcodebuild -license' to agree to the Xcode license."
    fi
  fi
}
xcode_license

# Setup Git configuration.
logn "Configuring Git:"
if [ -n "$GIT_NAME" ] && ! git config user.name >/dev/null; then
  git config --global user.name "$GIT_NAME"
fi

if [ -n "$GIT_EMAIL" ] && ! git config user.email >/dev/null; then
  git config --global user.email "$GIT_EMAIL"
fi

if [ -n "$GITHUB_USER" ] && [ "$(git config github.user)" != "$GITHUB_USER" ]; then
  git config --global github.user "$GITHUB_USER"
fi

# Squelch git 2.x warning message when pushing
if ! git config push.default >/dev/null; then
  git config --global push.default simple
fi

# # Setup GitHub HTTPS credentials.
if git credential-osxkeychain 2>&1 | grep $Q "git.credential-osxkeychain"
then
  if [ "$(git config --global credential.helper)" != "osxkeychain" ]
  then
    git config --global credential.helper osxkeychain
  fi

  # Caller-provided credentials must never enter xtrace, including condition tests.
  clear_debug
  if [ -n "$GITHUB_USER" ] && [ -n "$GITHUB_TOKEN" ]
  then
    printf "protocol=https\\nhost=github.com\\n" | git credential-osxkeychain erase
    printf "protocol=https\\nhost=github.com\\nusername=%s\\npassword=%s\\n" \
          "$GITHUB_USER" "$GITHUB_TOKEN" \
          | git credential-osxkeychain store
  fi
  reset_debug
fi
logk

# Select the native prefix before looking for brew; an Intel installation on an
# Apple Silicon Mac must not determine where the native installation belongs.
case "$(uname -m)" in
  arm64) HOMEBREW_PREFIX="/opt/homebrew" ;;
  x86_64) HOMEBREW_PREFIX="/usr/local" ;;
  *) abort "Unsupported architecture for Homebrew: $(uname -m)" ;;
esac
export PATH="$HOMEBREW_PREFIX/bin:$PATH"

# Let Homebrew's maintained installer own its layout and permissions. Never
# reinitialise or hard-reset an existing installation during dotfile setup.
if ! [ -x "$HOMEBREW_PREFIX/bin/brew" ]; then
  logn "Installing Homebrew:"
  HOMEBREW_INSTALLER="$(mktemp "${TMPDIR:-/tmp}/dotfiles-homebrew-install.XXXXXX")"
  if ! curl --fail --show-error --location \
      https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh \
      --output "$HOMEBREW_INSTALLER"; then
    abort "Could not download the official Homebrew installer."
  fi
  if ! env -u INTERACTIVE NONINTERACTIVE=1 /bin/bash "$HOMEBREW_INSTALLER"; then
    abort "The official Homebrew installer failed."
  fi
  if ! [ -x "$HOMEBREW_PREFIX/bin/brew" ]; then
    abort "Homebrew installer did not provide $HOMEBREW_PREFIX/bin/brew."
  fi
  rm -f "$HOMEBREW_INSTALLER"
  HOMEBREW_INSTALLER=""
  logk
fi

# Update Homebrew.
log "Updating Homebrew:"
brew update
logk

# Bundle and services are built into Homebrew. Application-specific taps belong
# in .Brewfile; explicitly tapping homebrew/core or homebrew/cask is unnecessary.

# Listing is read-only; never turn a failed query into an install decision.
log "Checking for software updates (read-only):"
list_updates
echo "macOS updates deferred. Review System Settings or explicitly run bootstrap.sh --macos-updates."

# Setup dotfiles
if [ -n "$GITHUB_USER" ]; then
  DOTFILES_URL="https://github.com/$GITHUB_USER/dotfiles"

  if git ls-remote "$DOTFILES_URL" &>/dev/null; then
    log "Fetching $GITHUB_USER/dotfiles from GitHub:"
    if [ ! -d "$HOME/.dotfiles" ]; then
      log "Cloning to ~/.dotfiles:"
      git clone $Q "$DOTFILES_URL" ~/.dotfiles
    else
      (
        cd ~/.dotfiles
        git pull $Q --rebase --autostash
      )
    fi
    logk
  fi
fi

# Deployment needs mise before Bundle can read the linked Brewfile. A local
# checkout is still usable when the GitHub availability probe is offline.
if [ -d "$HOME/.dotfiles" ]; then
  # Ensure the chosen provider after its metadata refresh, even when an older
  # mise is already in PATH: linking requires the new declaration's minimum.
  # brew install ensures this prerequisite without a blanket package upgrade.
  log "Ensuring mise for dotfile deployment:"
  brew install mise
  logk
  command -v mise >/dev/null 2>&1 || abort "mise installation did not provide a usable binary."
  run_dotfile_scripts script/setup script/bootstrap
fi

# Setup Brewfile
if [ -n "$GITHUB_USER" ] && { [ ! -f "$HOME/.Brewfile" ] || [ "$HOME/.Brewfile" -ef "$HOME/.homebrew-brewfile/Brewfile" ]; }; then
  HOMEBREW_BREWFILE_URL="https://github.com/$GITHUB_USER/homebrew-brewfile"

  if git ls-remote "$HOMEBREW_BREWFILE_URL" &>/dev/null; then
    log "Fetching $GITHUB_USER/homebrew-brewfile from GitHub:"
    if [ ! -d "$HOME/.homebrew-brewfile" ]; then
      log "Cloning to ~/.homebrew-brewfile:"
      git clone $Q "$HOMEBREW_BREWFILE_URL" ~/.homebrew-brewfile
      logk
    else
      (
        cd ~/.homebrew-brewfile
        git pull $Q
      )
    fi
    ln -sf ~/.homebrew-brewfile/Brewfile ~/.Brewfile
    logk
  fi
fi

# Install from local Brewfile
if [ -f "$HOME/.Brewfile" ]; then
  log "Installing from user Brewfile on GitHub:"
  brew bundle check --global || brew bundle --global
  logk
fi

# Account detection is not supported by current mas. Require explicit consent
# after the user signs in through App Store; the standalone command is resumable.
if [ -n "$INSTALL_APP_STORE" ]; then
  APP_STORE_SETUP="$HOME/.dotfiles/script/setup-app-store"
  [ -x "$APP_STORE_SETUP" ] || abort "Missing $APP_STORE_SETUP; update the dotfiles checkout first."
  log "Installing App Store apps:"
  "$APP_STORE_SETUP"
  logk
else
  echo "App Store apps deferred. After signing in, run ~/.dotfiles/script/setup-app-store."
fi

# Tap a custom Homebrew tap
if [ -n "$CUSTOM_HOMEBREW_TAP" ]; then
  read -ra CUSTOM_HOMEBREW_TAP <<< "$CUSTOM_HOMEBREW_TAP"
  log "Running 'brew tap ${CUSTOM_HOMEBREW_TAP[*]}':"
  brew tap "${CUSTOM_HOMEBREW_TAP[@]}"
  logk
fi

# Run a custom `brew` command
if [ -n "$CUSTOM_BREW_COMMAND" ]; then
  log "Executing 'brew $CUSTOM_BREW_COMMAND':"
  # shellcheck disable=SC2086
  brew $CUSTOM_BREW_COMMAND
  logk
fi

# Run post-install dotfiles script
run_dotfile_scripts script/after-setup

log "Development setup complete. Review security and software update status above."
SUCCESS="1"

