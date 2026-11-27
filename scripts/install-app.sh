#!/usr/bin/env bash
# `mise run install-app`: puts "Stack monitor.app" in ~/Applications, so the monitor opens from
# Spotlight, Launchpad or the Dock with no terminal. The app is a launcher for this checkout: it
# runs `mise run app` here, with the PATH of the terminal that installed it (an app opened from
# Finder gets a bare PATH, without mise, git or claude). Run it again after moving the checkout or
# changing your PATH.
set -euo pipefail

name="Stack monitor"
id="io.github.npherrington.stack-monitor.launcher"
app="$HOME/Applications/$name.app"
root=$(cd "$(dirname "$0")/.." && pwd)
mise_bin=$(command -v mise || true)
if [ -z "$mise_bin" ]; then
  echo "mise isn't on this terminal's PATH" >&2
  exit 1
fi

# Never replace an app this script didn't make (a Safari web app of the same name, say).
if [ -e "$app" ]; then
  current=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Contents/Info.plist" 2>/dev/null || true)
  if [ "$current" != "$id" ]; then
    echo "$app is another app (${current:-no bundle id}). Move it to the Bin, then run this again." >&2
    exit 1
  fi
  rm -rf "$app"
fi

contents="$app/Contents"
mkdir -p "$contents/MacOS" "$contents/Resources"

cat >"$contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>launcher</string>
  <key>CFBundleIdentifier</key><string>$id</string>
  <key>CFBundleName</key><string>$name</string>
  <key>CFBundleDisplayName</key><string>$name</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <!-- The Electron window it opens has the Dock icon; the launcher stays out of the Dock. -->
  <key>LSUIElement</key><true/>
</dict>
</plist>
PLIST

{
  echo '#!/bin/bash'
  echo '# Written by scripts/install-app.sh: opens the monitor from its checkout.'
  printf 'root=%q\n' "$root"
  printf 'mise_bin=%q\n' "$mise_bin"
  printf 'export PATH=%q\n' "$PATH"
  # What "Update from main…" reopens once it's done (scripts/update-app.sh).
  printf 'export STACK_MONITOR_APP=%q\n' "$app"
  cat <<'LAUNCHER'
logs="$HOME/Library/Logs/Stack monitor"
mkdir -p "$logs"
log="$logs/app.log"
cd "$root" 2>/dev/null || {
  osascript -e "display alert \"Stack monitor isn't at $root\" message \"Run mise run install-app from the checkout's new place.\"" >/dev/null
  exit 1
}
if ! "$mise_bin" run app >"$log" 2>&1; then
  osascript -e "display alert \"Stack monitor didn't start\" message \"The last lines of $log:

$(tail -n 8 "$log" | tr -d '"\\')\"" >/dev/null
  exit 1
fi
LAUNCHER
} >"$contents/MacOS/launcher"
chmod +x "$contents/MacOS/launcher"

# The Dock icon, at every size macOS asks an .icns for.
iconset=$(mktemp -d)/icon.iconset
mkdir -p "$iconset"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$root/public/icon-dock.png" --out "$iconset/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" "$root/public/icon-dock.png" --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$iconset" -o "$contents/Resources/icon.icns"
rm -rf "$(dirname "$iconset")"

# So Spotlight and Launchpad pick it up, and its new icon, at once.
lsregister=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
[ -x "$lsregister" ] && "$lsregister" -f "$app"

echo "Installed $app, opening this checkout ($root)."
echo "Open it from Spotlight or Launchpad, or drag it to the Dock. Its log: ~/Library/Logs/$name/app.log"
