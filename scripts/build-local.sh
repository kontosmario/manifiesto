#!/usr/bin/env bash
# Build de PRODUCCIÓN local — el mismo pipeline de EAS pero en esta Mac.
# NO consume el quota de builds del free tier (verificado 2026-06-12:
# los builds locales no crean un job en los workers de EAS; las únicas
# llamadas a EAS son verificar el proyecto y bajar las credenciales
# managed — incluidos los provisioning profiles per-target de la
# Share Extension que ya existen de las builds cloud).
#
# Uso (desde el root del repo):
#   ./scripts/build-local.sh                 # build → dist/ios/manifiesto-local.ipa
#   SUBMIT=1 ./scripts/build-local.sh        # build + submit a TestFlight (gratis)
#
# Requisitos (one-time, ya instalados 2026-06-12):
#   brew install fastlane          # toolchain de archive/export
#   cocoapods                       # ya estaba (1.16.1)
#   eas login                       # sesión activa (markon07)
#   ~15 GB de disco libre
#
# Recordatorios:
#   - BUMP el ios.buildNumber en app.config.ts ANTES (ASC rechaza
#     números repetidos dentro de la versión).
#   - Los EAS env vars con visibilidad "Secret" NO bajan a builds
#     locales; los Plain/Sensitive se materializan con env:pull.
#   - Para iteración DIARIA de JS no uses esto: con un dev client
#     instalado (npx expo run:ios --device) los cambios de JS se
#     recargan por Metro sin build alguna.

set -euo pipefail
cd "$(dirname "$0")/.."

# Node (nvm) + brew en PATH para shells no interactivas.
if [ -d "$HOME/.nvm/versions/node" ]; then
  NODE_BIN="$(ls -d "$HOME"/.nvm/versions/node/v*/bin 2>/dev/null | sort -V | tail -1)"
  [ -n "$NODE_BIN" ] && export PATH="$NODE_BIN:$PATH"
fi
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export LANG="${LANG:-en_US.UTF-8}"   # CocoaPods revienta sin UTF-8

command -v fastlane >/dev/null || { echo "❌ fastlane no está (brew install fastlane)"; exit 1; }
command -v pod >/dev/null || { echo "❌ cocoapods no está"; exit 1; }

# Espacio mínimo: el archive local necesita ~10 GB de scratch.
FREE_GB=$(df -g /System/Volumes/Data | tail -1 | awk '{print $4}')
if [ "${FREE_GB:-0}" -lt 12 ]; then
  echo "❌ Solo ${FREE_GB} GB libres (<12). Liberá disco: rm -rf ~/Library/Developer/Xcode/DerivedData/*"
  exit 1
fi

# Materializar los env vars de EAS (Plain + Sensitive) en .env.local —
# los builds locales NO los bajan solos (expo/expo#36288). EXPO_PUBLIC_*
# se hornean al bundle desde acá (p. ej. la site key de hCaptcha).
echo "→ eas env:pull --environment production"
npx eas-cli env:pull --environment production --non-interactive

mkdir -p dist/ios
OUT="dist/ios/manifiesto-local.ipa"

echo "→ eas build --local (esto tarda 10-25 min; no consume quota)"
npx eas-cli build --platform ios --profile production --local \
  --non-interactive \
  --output "$OUT"

echo ""
echo "✓ Build local: $(pwd)/$OUT"
ls -lh "$OUT"

if [ "${SUBMIT:-0}" = "1" ]; then
  echo "→ eas submit (gratis, no consume builds)"
  npx eas-cli submit --platform ios --path "$OUT" --non-interactive
  echo "✓ Subido a App Store Connect — TestFlight lo procesa en ~5-15 min"
else
  echo "Para subirlo a TestFlight:"
  echo "  npx eas-cli submit --platform ios --path $OUT"
fi
