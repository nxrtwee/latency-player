#!/usr/bin/env bash
#
# patch-ios.sh — apply the native iOS pieces that aren't expressed in JS, run in
# CI right after `npx cap add ios` + `npx cap sync ios`. The iOS project is
# regenerated on every CI run (not committed), so these edits must be scripted.
#
# It does two things (see ../ios-notes.md §2-3):
#   1. Info.plist     -> UIBackgroundModes = ["audio"]   (keep audio alive when
#                        the screen locks / app backgrounds)
#   2. AppDelegate    -> AVAudioSession category .playback + setActive(true)
#                        (makes the lock-screen Media Session transport authoritative)
#
# Idempotent: re-running is a no-op. Fails loudly if an anchor is missing so a
# Capacitor template change surfaces in the CI log instead of silently shipping
# an app with no background audio.

set -euo pipefail

# Resolve paths relative to this script (mobile/scripts/) so it works regardless
# of the caller's CWD.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$MOBILE_DIR/ios/App/App"
PLIST="$APP_DIR/Info.plist"
APPDELEGATE="$APP_DIR/AppDelegate.swift"

echo "==> patch-ios: app dir = $APP_DIR"

[ -f "$PLIST" ]       || { echo "ERROR: Info.plist not found at $PLIST"; exit 1; }
[ -f "$APPDELEGATE" ] || { echo "ERROR: AppDelegate.swift not found at $APPDELEGATE"; exit 1; }

# ---------------------------------------------------------------------------
# 1. Info.plist  ->  UIBackgroundModes = ["audio"]
# ---------------------------------------------------------------------------
PB=/usr/libexec/PlistBuddy
if "$PB" -c "Print :UIBackgroundModes" "$PLIST" >/dev/null 2>&1; then
  echo "==> UIBackgroundModes already present, skipping"
else
  "$PB" -c "Add :UIBackgroundModes array" "$PLIST"
  "$PB" -c "Add :UIBackgroundModes:0 string audio" "$PLIST"
  echo "==> UIBackgroundModes = [audio] added"
fi

# ---------------------------------------------------------------------------
# 2. AppDelegate.swift  ->  AVAudioSession .playback
# ---------------------------------------------------------------------------
if grep -q "AVAudioSession" "$APPDELEGATE"; then
  echo "==> AppDelegate already patched, skipping"
else
  # 2a. add `import AVFoundation` right after `import Capacitor`
  if grep -q "^import Capacitor" "$APPDELEGATE"; then
    perl -0pi -e 's/^(import Capacitor\n)/$1import AVFoundation\n/m' "$APPDELEGATE"
  else
    echo "ERROR: anchor 'import Capacitor' not found in AppDelegate.swift" >&2
    echo "----- AppDelegate.swift -----" >&2; cat "$APPDELEGATE" >&2
    exit 1
  fi

  # 2b. insert the AVAudioSession block at the top of didFinishLaunchingWithOptions.
  #     Anchor: the method signature line ending in `-> Bool {`.
  read -r -d '' AUDIO_BLOCK <<'SWIFT' || true
        // Latency: keep audio playing when locked/backgrounded; makes the
        // Media Session lock-screen controls authoritative (see ios-notes.md).
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("AVAudioSession error: \(error)")
        }
SWIFT

  if grep -q "didFinishLaunchingWithOptions" "$APPDELEGATE"; then
    # Use perl: after the first line containing both didFinishLaunchingWithOptions
    # and the opening brace, splice in the block.
    export AUDIO_BLOCK
    perl -0pi -e '
      my $blk = $ENV{AUDIO_BLOCK};
      s/(func application\([^\n]*didFinishLaunchingWithOptions[^\n]*\{\n)/$1$blk\n/s;
    ' "$APPDELEGATE"
  else
    echo "ERROR: anchor 'didFinishLaunchingWithOptions' not found in AppDelegate.swift" >&2
    echo "----- AppDelegate.swift -----" >&2; cat "$APPDELEGATE" >&2
    exit 1
  fi

  # Verify the splice actually landed.
  if ! grep -q "AVAudioSession.sharedInstance().setCategory" "$APPDELEGATE"; then
    echo "ERROR: AVAudioSession block was not inserted (anchor matched but splice failed)" >&2
    echo "----- AppDelegate.swift -----" >&2; cat "$APPDELEGATE" >&2
    exit 1
  fi
  echo "==> AppDelegate patched with AVAudioSession .playback"
fi

echo "==> patch-ios: done"
echo "----- final AppDelegate.swift -----"
cat "$APPDELEGATE"
