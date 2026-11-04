#!/bin/sh

# based on this https://github.com/mikemcquaid/strap
#/ Usage: bootstrap.sh [--debug] [--app-store]
#/ Install development dependencies on macOS.
set -e

INSTALL_APP_STORE=""
for argument in "$@"; do
  case "$argument" in
    --debug) DEBUG="1" ;;
    --app-store) INSTALL_APP_STORE="1" ;;
    *) echo "Unknown option: $argument. Usage: $0 [--debug] [--app-store]" >&2; exit 2 ;;
  esac
done
[[ -o xtrace ]] && DEBUG="1"
SUCCESS=""
HOMEBREW_INSTALLER=""

sudo_askpass() {
  if [ -n "$SUDO_ASKPASS" ]; then
    sudo --askpass "$@"
  else
    sudo "$@"
  fi
}

cleanup() {
  set +e
  sudo_askpass rm -rf "$CLT_PLACEHOLDER" "$SUDO_ASKPASS" "$SUDO_ASKPASS_DIR" "$HOMEBREW_INSTALLER"
  sudo --reset-timestamp
  if [ -z "$SUCCESS" ]; then
    if [ -n "$STEP" ]; then
      echo "!!! $STEP FAILED" >&2
    else
      echo "!!! FAILED" >&2
    fi
    if [ -z "$DEBUG" ]; then
      echo "!!! Run '$0 --debug' for debugging output." >&2
    fi
  fi
}

trap "cleanup" EXIT

if [ -n "$DEBUG" ]; then
  set -x
else
  QUIET_FLAG="-q"
  Q="$QUIET_FLAG"
fi

STDIN_FILE_DESCRIPTOR="0"
[ -t "$STDIN_FILE_DESCRIPTOR" ] && INTERACTIVE="1"

GIT_NAME="Daniel Landers"
GIT_EMAIL="daniel@landers.co.nz"
GITHUB_USER="danlannz"
# GITHUB_TOKEN=
# CUSTOM_HOMEBREW_TAP=
# CUSTOM_BREW_COMMAND=

# We want to always prompt for sudo password at least once rather than doing
# root stuff unexpectedly.
sudo --reset-timestamp

# functions for turning off debug for use when handling the user password
clear_debug() {
  set +x
}

reset_debug() {
  if [ -n "$DEBUG" ]; then
    set -x
  fi
}

# Initialise (or reinitialise) sudo to save unhelpful prompts later.
sudo_init() {
  if [ -z "$INTERACTIVE" ]; then
    return
  fi

  local SUDO_PASSWORD SUDO_PASSWORD_SCRIPT

  if ! sudo --validate --non-interactive &>/dev/null; then
    while true; do
      read -rsp "--> Enter your password (for sudo access):" SUDO_PASSWORD
      echo
      if sudo --validate --stdin 2>/dev/null <<<"$SUDO_PASSWORD"; then
        break
      fi

      unset SUDO_PASSWORD
      echo "!!! Wrong password!" >&2
    done

    clear_debug
    SUDO_PASSWORD_SCRIPT="$(cat <<BASH
#!/bin/bash
echo "$SUDO_PASSWORD"
BASH
)"
    unset SUDO_PASSWORD
    SUDO_ASKPASS_DIR="$(mktemp -d)"
    SUDO_ASKPASS="$(mktemp "$SUDO_ASKPASS_DIR"/strap-askpass-XXXXXXXX)"
    chmod 700 "$SUDO_ASKPASS_DIR" "$SUDO_ASKPASS"
    bash -c "cat > '$SUDO_ASKPASS'" <<<"$SUDO_PASSWORD_SCRIPT"
    unset SUDO_PASSWORD_SCRIPT
    reset_debug

    export SUDO_ASKPASS
  fi
}

sudo_refresh() {
  clear_debug
  if [ -n "$SUDO_ASKPASS" ]; then
    sudo --askpass --validate
  else
    sudo_init
  fi
  reset_debug
}

abort() { STEP="";   echo "!!! $*" >&2; exit 1; }
log()   { STEP="$*"; sudo_refresh; echo "--> $*"; }
logn()  { STEP="$*"; sudo_refresh; printf -- "--> %s " "$*"; }
logk()  { STEP="";   echo "OK"; }
escape() {
  printf '%s' "${1//\'/\'}"
}

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

[ "$USER" = "root" ] && abort "Run as yourself, not root."
groups | grep $Q -E "\b(admin)\b" || abort "Add $USER to the admin group."

# Prevent sleeping during script execution, as long as the machine is on AC power
caffeinate -s -w $$ &

# Set some basic security settings.
logn "Configuring security settings:"
defaults write com.apple.Safari \
  com.apple.Safari.ContentPageGroupIdentifier.WebKit2JavaEnabled \
  -bool false
defaults write com.apple.Safari \
  com.apple.Safari.ContentPageGroupIdentifier.WebKit2JavaEnabledForLocalFiles \
  -bool false
defaults write com.apple.screensaver askForPassword -int 1
defaults write com.apple.screensaver askForPasswordDelay -int 0
sudo_askpass defaults write /Library/Preferences/com.apple.alf globalstate -int 1
sudo_askpass launchctl load /System/Library/LaunchDaemons/com.apple.alf.agent.plist 2>/dev/null

if [ -n "$GIT_NAME" ] && [ -n "$GIT_EMAIL" ]; then
  LOGIN_TEXT=$(escape "Found this computer? Please contact $GIT_NAME at $GIT_EMAIL.")
  echo "$LOGIN_TEXT" | grep -q '[()]' && LOGIN_TEXT="'$LOGIN_TEXT'"
  sudo_askpass defaults write /Library/Preferences/com.apple.loginwindow \
    LoginwindowText \
    "$LOGIN_TEXT"
fi
logk

# Check and enable full-disk encryption.
logn "Checking full-disk encryption status:"
if fdesetup status | grep $Q -E "FileVault is (On|Off, but will be enabled after the next restart)."; then
  logk
elif [ -n "$CI" ]; then
  echo
  logn "Skipping full-disk encryption for CI"
elif [ -n "$INTERACTIVE" ]; then
  echo
  log "Enabling full-disk encryption on next reboot:"
  sudo_askpass fdesetup enable -user "$USER" \
    | tee ~/Desktop/"FileVault Recovery Key.txt"
  logk
else
  echo
  abort "Run 'sudo fdesetup enable -user \"$USER\"' to enable full-disk encryption."
fi

# Install the Xcode Command Line Tools.
if ! [ -f "/Library/Developer/CommandLineTools/usr/bin/git" ]
then
  log "Installing the Xcode Command Line Tools:"
  CLT_PLACEHOLDER="/tmp/.com.apple.dt.CommandLineTools.installondemand.in-progress"
  sudo_askpass touch "$CLT_PLACEHOLDER"

  CLT_PACKAGE=$(softwareupdate -l | \
                grep -B 1 "Command Line Tools" | \
                awk -F"*" '/^ *\*/ {print $2}' | \
                sed -e 's/^ *Label: //' -e 's/^ *//' | \
                sort -V |
                tail -n1)
  sudo_askpass softwareupdate -i "$CLT_PACKAGE"
  sudo_askpass rm -f "$CLT_PLACEHOLDER"
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
      sudo_askpass xcodebuild -license
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

  if [ -n "$GITHUB_USER" ] && [ -n "$GITHUB_TOKEN" ]
  then
    printf "protocol=https\\nhost=github.com\\n" | git credential-osxkeychain erase
    printf "protocol=https\\nhost=github.com\\nusername=%s\\npassword=%s\\n" \
          "$GITHUB_USER" "$GITHUB_TOKEN" \
          | git credential-osxkeychain store
  fi
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
  if ! /bin/bash "$HOMEBREW_INSTALLER"; then
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

# Check and install any remaining software updates.
logn "Checking for software updates:"
if softwareupdate -l 2>&1 | grep $Q "No new software available."; then
  logk
else
  echo
  log "Installing software updates:"
  if [ -z "$CI" ]; then
    sudo_askpass softwareupdate --install --all
    xcode_license
  else
    echo "Skipping software updates for CI"
  fi
  logk
fi

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

SUCCESS="1"
log "You're good to go"

