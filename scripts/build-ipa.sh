#!/usr/bin/env bash
# Build an unsigned arm64 iOS .ipa for distribution / sideloading.
#
# This wrapper exists because `xcodebuild archive` (run directly, not
# via `expo run:ios`) does NOT load `.env` automatically — and the
# Metro bundling phase reads `process.env.EXPO_PUBLIC_*` to bake them
# into the JS bundle. Without `.env` sourced, the bundle ships with
# `EXPO_PUBLIC_EAS_PROJECT_ID === undefined`, which breaks push token
# registration at runtime ("Falta EXPO_PUBLIC_EAS_PROJECT_ID …").
#
# Run from the project root:
#   ./scripts/build-ipa.sh
#
# Output:
#   dist/ios/Manifiesto-unsigned.ipa
#
# Install via Sideloadly / AltStore / Xcode device window. The IPA is
# arm64 only (iPhone physical devices) and not signed; the install
# tool will re-sign it with your free Apple ID.

set -euo pipefail

cd "$(dirname "$0")/.."

# Ensure node + cocoapods are on PATH. nvm-managed node lives outside
# the default shell PATH when this script is invoked from cron, CI,
# or non-interactive tasks. Resolve once, then prepend.
if [ -d "$HOME/.nvm/versions/node" ]; then
  NODE_BIN="$(ls -d "$HOME"/.nvm/versions/node/v*/bin 2>/dev/null | sort -V | tail -1)"
  if [ -n "$NODE_BIN" ]; then
    export PATH="$NODE_BIN:$PATH"
  fi
fi
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
export LANG="${LANG:-en_US.UTF-8}"

# Source .env so EXPO_PUBLIC_* vars are exported into xcodebuild's
# child processes (the bundling script reads them).
if [ ! -f .env ]; then
  echo "❌ .env not found at project root. Aborting."
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env
set +a

# NOTE: The projectId is now hardcoded in `app.config.ts`
# (`extra.eas.projectId`), so an empty `EXPO_PUBLIC_EAS_PROJECT_ID`
# in .env is no longer fatal. We keep `.env` sourced for the other
# EXPO_PUBLIC_* vars (Supabase URL/key, OAuth scheme) which still
# need to land in the bundle via Metro.

# Regenerate icons (in case the SVG changed). Idempotent if not.
echo "→ Regenerating iOS app icons…"
node scripts/generate-ios-app-icons.mjs

ARCHIVE=/tmp/Manifiesto.xcarchive
STAGING=/tmp/ipa-staging
rm -rf "$ARCHIVE" "$STAGING"

echo "→ Archiving (Release, iphoneos, unsigned)…"
PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" LANG=en_US.UTF-8 \
  xcodebuild \
    -workspace ios/Manifiesto.xcworkspace \
    -scheme Manifiesto \
    -configuration Release \
    -sdk iphoneos \
    -archivePath "$ARCHIVE" \
    -destination "generic/platform=iOS" \
    archive \
    CODE_SIGN_IDENTITY="" \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGNING_ALLOWED=NO \
  | tee /tmp/ios-archive.log

echo "→ Packaging .ipa…"
mkdir -p "$STAGING/Payload"
cp -R "$ARCHIVE/Products/Applications/Manifiesto.app" "$STAGING/Payload/"
mkdir -p dist/ios
( cd "$STAGING" && zip -qr "$PWD/Manifiesto-unsigned.ipa" Payload )
mv "$STAGING/Manifiesto-unsigned.ipa" dist/ios/

echo ""
echo "✓ Built: $(pwd)/dist/ios/Manifiesto-unsigned.ipa"
ls -lh dist/ios/Manifiesto-unsigned.ipa
