#!/usr/bin/env bash
#
# patch-android.sh — apply the native Android pieces that aren't expressed in JS,
# run in CI right after `npx cap add android` + `npx cap sync android`. The
# Android project is regenerated on every CI run (not committed, see ../.gitignore),
# so these edits must be scripted.
#
# Mirrors scripts/patch-ios.sh, but Android needs LESS native glue than iOS (see
# ../android-notes.md):
#   1. AndroidManifest.xml -> permissions for background audio + the media
#                             notification (FOREGROUND_SERVICE[_MEDIA_PLAYBACK],
#                             WAKE_LOCK, POST_NOTIFICATIONS). INTERNET is already
#                             in the Capacitor template.
#   2. App icon            -> replace the default Capacitor launcher icons with
#                             our logo (legacy + adaptive foreground), and tint
#                             the adaptive background to our dark color.
#
# Unlike iOS there is NO MainActivity edit: the system WebView drives the media
# notification, and prev/next/play/pause come from navigator.mediaSession (JS,
# src/api/mediaSession.ts). So no native ±10s-skip suppression is needed.
#
# Idempotent: re-running is a no-op. Fails loudly if a required anchor is missing
# (manifest) so a Capacitor template change surfaces in the CI log; icon steps
# only WARN on missing inputs (keep the default icon) — same stance as patch-ios.sh.

set -euo pipefail

# Resolve paths relative to this script (mobile/scripts/) so it works regardless
# of the caller's CWD.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ANDROID_DIR="$MOBILE_DIR/android"
APP_MAIN="$ANDROID_DIR/app/src/main"
MANIFEST="$APP_MAIN/AndroidManifest.xml"
RES_DIR="$APP_MAIN/res"

echo "==> patch-android: app main = $APP_MAIN"

[ -f "$MANIFEST" ] || { echo "ERROR: AndroidManifest.xml not found at $MANIFEST"; exit 1; }

# ---------------------------------------------------------------------------
# 1. AndroidManifest.xml -> background-audio + media-notification permissions
#    Inserted before </manifest>. Guarded on FOREGROUND_SERVICE so re-runs and
#    a template that already grants them are both no-ops.
# ---------------------------------------------------------------------------
if grep -q "android.permission.FOREGROUND_SERVICE\b" "$MANIFEST"; then
  echo "==> background-audio permissions already present, skipping"
else
  grep -q "</manifest>" "$MANIFEST" || { echo "ERROR: </manifest> anchor not found in $MANIFEST"; exit 1; }
  PERMS='    <!-- Latency: keep audio + the media notification alive in background -->\
    <uses-permission android:name="android.permission.WAKE_LOCK" />\
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />\
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />\
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\
'
  # Insert the permission block immediately before the closing </manifest> tag.
  sed -i "s#</manifest>#${PERMS}</manifest>#" "$MANIFEST"
  echo "==> background-audio permissions added"
fi

# ---------------------------------------------------------------------------
# 2. App icon — replace the default Capacitor launcher with our logo.
#    ImageMagick (`convert`) ships on the ubuntu CI runner. We write:
#      • legacy square + round icons   (ic_launcher.png / ic_launcher_round.png)
#      • adaptive foreground layer      (ic_launcher_foreground.png, logo padded
#        into the central safe zone so the system mask doesn't crop it)
#    and tint the adaptive background color to our dark theme.
# ---------------------------------------------------------------------------
ICON_SRC="$MOBILE_DIR/assets/appicon-source.png"
BG_HEX="#07070c"

# Pick an ImageMagick entrypoint (v7: `magick`, v6: `convert`).
IM=""
if command -v magick >/dev/null 2>&1; then IM="magick"
elif command -v convert >/dev/null 2>&1; then IM="convert"
fi

if [ -z "$IM" ]; then
  echo "WARNING: ImageMagick not found — keeping default Capacitor icon" >&2
elif [ ! -f "$ICON_SRC" ]; then
  echo "WARNING: icon source $ICON_SRC missing — keeping default Capacitor icon" >&2
elif [ ! -d "$RES_DIR" ]; then
  echo "WARNING: res dir $RES_DIR missing — keeping default Capacitor icon" >&2
else
  # density -> "launcherPx foregroundPx". Launcher = 48dp baseline; adaptive
  # foreground layer = 108dp baseline; both scaled by the density factor.
  set_icon() {
    local dir="$1" launcher="$2" fg="$3"
    local mip="$RES_DIR/mipmap-$dir"
    [ -d "$mip" ] || return 0   # density not present in this template — skip
    # legacy icons (full-bleed square logo)
    "$IM" "$ICON_SRC" -resize "${launcher}x${launcher}" "$mip/ic_launcher.png"
    [ -f "$mip/ic_launcher_round.png" ] && \
      "$IM" "$ICON_SRC" -resize "${launcher}x${launcher}" "$mip/ic_launcher_round.png"
    # adaptive foreground: logo at ~62% on a transparent canvas (safe zone), so
    # the round/squircle system mask never clips the logo.
    if [ -f "$mip/ic_launcher_foreground.png" ]; then
      local inner=$(( fg * 62 / 100 ))
      "$IM" -size "${fg}x${fg}" xc:none \
        \( "$ICON_SRC" -resize "${inner}x${inner}" \) -gravity center -composite \
        "$mip/ic_launcher_foreground.png"
    fi
  }
  set_icon mdpi    48  108
  set_icon hdpi    72  162
  set_icon xhdpi   96  216
  set_icon xxhdpi  144 324
  set_icon xxxhdpi 192 432
  echo "==> app icon set from assets/appicon-source.png"

  # Tint the adaptive-icon background color to our dark theme, if the template
  # defines it as a color resource (Capacitor 8 default).
  BG_XML="$RES_DIR/values/ic_launcher_background.xml"
  if [ -f "$BG_XML" ]; then
    sed -i -E "s/(<color name=\"ic_launcher_background\">)#[0-9A-Fa-f]{6,8}(<\/color>)/\1${BG_HEX}\2/" "$BG_XML"
    echo "==> adaptive icon background tinted to $BG_HEX"
  fi
fi

echo "==> patch-android: done"
echo "----- granted permissions -----"
grep "uses-permission" "$MANIFEST" || true
