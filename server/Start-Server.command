#!/bin/sh
set -eu
cd "$(dirname "$0")"
if ! docker info >/dev/null 2>&1; then
  echo 'Install and open Docker Desktop first, then run this file again.'
  read -r answer
  exit 1
fi
[ -f .env ] || cp .env.example .env
mkdir -p config cache media/Movies media/Shows 'media/Home Videos'
docker compose up -d jellyfin
printf '\nOpen http://localhost:8096 to create YOUR server account.\nKeep Docker Desktop running while watching.\n'
open http://localhost:8096
