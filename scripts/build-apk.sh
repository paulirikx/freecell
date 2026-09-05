#!/usr/bin/env bash
# Bouwt een APK en legt hem in apk/.
#
#   bun run apk          -> debug-build, om zelf te testen
#   bun run apk:release  -> ondertekende release-build, om te delen
#
# LET OP: wat je deelt moet een release-build zijn. Een debug-build is met een
# andere sleutel ondertekend en weigert te installeren over een bestaande app.
set -euo pipefail

cd "$(dirname "$0")/.."

export ANDROID_HOME="${ANDROID_HOME:-$HOME/AppData/Local/Android/Sdk}"
export JAVA_HOME="${JAVA_HOME:-/c/Program Files/Eclipse Adoptium/jdk-21.0.12.8-hotspot}"

SOORT="${1:-debug}"
VERSIE=$(node -p "require('./package.json').version")

if [ "$SOORT" = "release" ] && [ ! -f android/keystore.properties ]; then
  echo "FOUT: android/keystore.properties ontbreekt."
  echo "Zonder sleutel kan er geen deelbare release-build gemaakt worden."
  exit 1
fi

cd android
if [ "$SOORT" = "release" ]; then
  echo "== Gradle assembleRelease (v$VERSIE) =="
  ./gradlew assembleRelease --console=plain -q
  BRON="app/build/outputs/apk/release/app-release.apk"
  DOEL="apk/FreeCell-$VERSIE.apk"
else
  echo "== Gradle assembleDebug (v$VERSIE) =="
  ./gradlew assembleDebug --console=plain -q
  BRON="app/build/outputs/apk/debug/app-debug.apk"
  DOEL="apk/FreeCell-$VERSIE-debug.apk"
fi
cd ..

mkdir -p apk
cp "android/$BRON" "$DOEL"

echo
echo "APK klaar: $DOEL"
ls -la "$DOEL"
