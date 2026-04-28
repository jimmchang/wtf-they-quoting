#!/usr/bin/env bash
set -euo pipefail

mkdir -p web/public/data

OWNER="${VERCEL_GIT_REPO_OWNER:-}"
SLUG="${VERCEL_GIT_REPO_SLUG:-}"

if [[ -n "$OWNER" && -n "$SLUG" ]]; then
  URL="https://github.com/${OWNER}/${SLUG}/archive/refs/heads/data.tar.gz"
  echo "fetching data branch tarball: $URL"
  if curl -sfL "$URL" | tar -xz --strip-components=1 -C web/public/data; then
    echo "data branch fetched, files:"
    ls -1 web/public/data
  else
    echo "WARN: failed to fetch data branch, building with empty data dir"
  fi
else
  echo "VERCEL_GIT_REPO_OWNER/SLUG not set, building with empty data dir"
fi

pnpm --filter web build

rm -rf dist
cp -R web/dist dist
