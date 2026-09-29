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
echo 'Waiting for the server to finish starting...'
ready=false
for attempt in $(seq 1 90); do
  if curl --max-time 3 --silent --fail http://localhost:8096/health >/dev/null; then ready=true; break; fi
  sleep 2
done
if [ "$ready" != true ]; then echo 'Startup is taking longer than expected. Check Docker Desktop logs and retry.'; exit 1; fi
open http://localhost:8096
