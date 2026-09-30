#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
archive="$(mktemp -t prism-vlckit).tar.xz"
trap 'rm -f "$archive"' EXIT
curl --fail --location --proto '=https' --tlsv1.2 'https://download.videolan.org/cocoapods/prod/TVVLCKit-3.7.3-319ed2c0-79128878.tar.xz' -o "$archive"
printf '%s  %s\n' 'b5f90c226ed54d9dc1c03901c60dc7749b74a53caace2c3047e4c0b7a063e46c' "$archive" | shasum -a 256 -c -
mkdir -p Vendor
tar -xJf "$archive" -C Vendor
