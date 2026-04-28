#!/usr/bin/env bash
set -euo pipefail

mkdir -p web/public/data

if git fetch --depth=1 origin data 2>/dev/null; then
  git --work-tree=web/public/data checkout origin/data -- .
else
  echo "no data branch yet, building with empty data dir"
fi

pnpm --filter web build

rm -rf dist
cp -R web/dist dist
