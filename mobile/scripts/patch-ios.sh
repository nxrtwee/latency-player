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
# 2. AppDelegate.swift  ->  overwrite with our version (AVAudioSession +
#    disable lock-screen ±10s skip commands). Copying a full file is more robust
#    than sed-splicing; pinned to the Capacitor 8 template structure.
# ---------------------------------------------------------------------------
APPDELEGATE_SRC="$MOBILE_DIR/native/AppDelegate.swift"
if [ -f "$APPDELEGATE_SRC" ]; then
  cp "$APPDELEGATE_SRC" "$APPDELEGATE"
  echo "==> AppDelegate replaced from native/AppDelegate.swift"
else
  echo "ERROR: $APPDELEGATE_SRC not found" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 3. App icon — replace the single 1024 slot with our logo (sips ships with macOS)
# ---------------------------------------------------------------------------
ICON_SRC="$MOBILE_DIR/assets/appicon-source.png"
ICON_DST="$APP_DIR/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
if [ -f "$ICON_SRC" ] && [ -d "$(dirname "$ICON_DST")" ]; then
  # Capacitor 8 uses a single universal 1024x1024 icon; resize ours into it.
  sips -s format png -z 1024 1024 "$ICON_SRC" --out "$ICON_DST" >/dev/null
  echo "==> app icon set from assets/appicon-source.png"
else
  echo "WARNING: icon source or appiconset missing — keeping default Capacitor icon" >&2
fi

# ---------------------------------------------------------------------------
# 4. Status bar — let the @capacitor/status-bar plugin control the style
#    (required so setStyle/overlay take effect app-wide).
# ---------------------------------------------------------------------------
if "$PB" -c "Print :UIViewControllerBasedStatusBarAppearance" "$PLIST" >/dev/null 2>&1; then
  "$PB" -c "Set :UIViewControllerBasedStatusBarAppearance false" "$PLIST"
else
  "$PB" -c "Add :UIViewControllerBasedStatusBarAppearance bool false" "$PLIST"
fi
echo "==> UIViewControllerBasedStatusBarAppearance = false"

# ---------------------------------------------------------------------------
# 5. Lock to portrait — rotation is unwanted (and looks broken on iPad).
#    Overwrite the supported-orientation arrays (iPhone + iPad) with portrait
#    only. Delete-then-add so re-runs are idempotent.
# ---------------------------------------------------------------------------
for KEY in UISupportedInterfaceOrientations "UISupportedInterfaceOrientations~ipad"; do
  "$PB" -c "Delete :$KEY" "$PLIST" >/dev/null 2>&1 || true
  "$PB" -c "Add :$KEY array" "$PLIST"
  "$PB" -c "Add :$KEY:0 string UIInterfaceOrientationPortrait" "$PLIST"
done
echo "==> locked to portrait (iPhone + iPad)"

# ---------------------------------------------------------------------------
# 6. NativeAudioBridge — copy the Swift bridge file into the Xcode project.
#    This provides native AVPlayer + MPRemoteCommandCenter (prev/next track on
#    lock screen) via WKScriptMessageHandler, bypassing Capacitor's plugin
#    registration (which requires modifying the Xcode project file).
# ---------------------------------------------------------------------------
BRIDGE_SRC="$MOBILE_DIR/ios-plugin/NativeAudioBridge.swift"
BRIDGE_DST="$APP_DIR/NativeAudioBridge.swift"
if [ -f "$BRIDGE_SRC" ]; then
  cp "$BRIDGE_SRC" "$BRIDGE_DST"
  echo "==> NativeAudioBridge.swift copied to $APP_DIR"
else
  echo "WARNING: NativeAudioBridge.swift missing — lock screen prev/next will not work" >&2
fi

echo "==> patch-ios: done"
echo "----- final AppDelegate.swift -----"
cat "$APPDELEGATE"
