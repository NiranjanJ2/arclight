#!/bin/sh
# Copies the built app into /Applications and opens it.
# Kept separate from the build so `npm run app:build` stays side-effect free.
set -e

APP=$(ls -d release/*/ArcLight.app 2>/dev/null | head -1)
if [ -z "$APP" ]; then
  echo "No built app found. Run: npm run app:build" >&2
  exit 1
fi

# The bundle cannot be replaced while it is running.
osascript -e 'quit app "ArcLight"' 2>/dev/null || true
sleep 1

rm -rf "/Applications/ArcLight.app"
cp -R "$APP" /Applications/
echo "Installed /Applications/ArcLight.app"
open -a /Applications/ArcLight.app
