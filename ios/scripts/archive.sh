#!/bin/bash
# Create a signed archive for Xcode Organizer validation and distribution.
set -euo pipefail
platform="${1:-}"
team="${2:-}"
build_number="${3:-}"
if [[ ! "$team" =~ ^[A-Z0-9]{10}$ || ! "$build_number" =~ ^[1-9][0-9]*$ ]]; then
  echo 'Usage: ios/scripts/archive.sh ios|tvos|macos APPLE_TEAM_ID BUILD_NUMBER' >&2
  exit 2
fi
case "$platform" in
  ios) scheme=Prism; destination='generic/platform=iOS' ;;
  tvos) scheme=PrismTV; destination='generic/platform=tvOS' ;;
  macos) scheme=PrismMac; destination='generic/platform=macOS' ;;
  *) echo 'Choose ios, tvos or macos.' >&2; exit 2 ;;
esac
repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
xcodebuild -version
command -v xcodegen >/dev/null || { echo 'Install XcodeGen: brew install xcodegen' >&2; exit 1; }
cd "$repo_root/ios"
bash scripts/bootstrap-vlc.sh
xcodegen generate
# Use a released/RC SDK accepted by Apple; Duo beta builds belong in TestFlight.
xcodebuild -project Prism.xcodeproj -scheme "$scheme" -configuration Release \
  -destination "$destination" -archivePath ".build/archives/$scheme-$build_number.xcarchive" \
  DEVELOPMENT_TEAM="$team" CURRENT_PROJECT_VERSION="$build_number" \
  -allowProvisioningUpdates archive
printf 'Archive ready for Organizer validation: %s\n' "$repo_root/ios/.build/archives/$scheme-$build_number.xcarchive"
