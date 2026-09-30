#!/bin/bash
set -euo pipefail
app="${1:?Usage: verify-tv-bundle.sh /path/to/PrismTV.app}"
framework="$app/Frameworks/TVVLCKit.framework/TVVLCKit"
if [[ ! -f "$framework" ]]; then
  echo 'ERROR: TVVLCKit is linked dynamically but missing from the app bundle.' >&2
  exit 1
fi
/usr/bin/otool -hv "$framework" | /usr/bin/grep -q DYLIB || {
  echo 'ERROR: embedded TVVLCKit is not a dynamic library.' >&2
  exit 1
}
echo 'Verified: TVVLCKit dynamic framework is included in the app bundle.'
