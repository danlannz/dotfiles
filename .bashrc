export PATH="$PATH:/usr/local/sbin"

export ANDROID_HOME="/usr/local/opt/android-sdk"
export ANDROID_NDK="/usr/local/opt/android-ndk"
export NVM_DIR="/Users/Daniel/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"  # This loads nvm

export PATH="$HOME/.yarn/bin:$PATH"

eval $(thefuck --alias)

# Add RVM to PATH for scripting. Make sure this is the last PATH variable change.
export PATH="$PATH:$HOME/.rvm/bin"
