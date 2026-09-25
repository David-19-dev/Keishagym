#!/usr/bin/env bash
# Manually download the exercise photos into ./media/ex.
# You normally DON'T need this — `docker compose up` fetches them automatically.
# Source: yuhonas/free-exercise-db (Unlicense / public domain), two photos per exercise.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
git clone --depth 1 https://github.com/yuhonas/free-exercise-db "$tmp"
mkdir -p media/ex
cp -r "$tmp"/exercises/. media/ex/
echo "✓ $(ls media/ex | wc -l) exercises"
