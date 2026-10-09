#!/usr/bin/env bash
# cloudflare pages build: the bundle is built from the sibling qinit monorepo, which pages does not check out,
# so fetch it into the repo first, then install and build as ci does. QINIT_REPO / QINIT_REF pin it like the ci vars.
set -euo pipefail
cd "$(dirname "$0")/.."

qinit="$PWD/.qinit"
rm -rf "$qinit"
git init -q "$qinit"
git -C "$qinit" fetch -q --depth 1 "https://github.com/${QINIT_REPO:-hackerby888/qinit}" "${QINIT_REF:-main}"
git -C "$qinit" checkout -q FETCH_HEAD
(cd "$qinit" && bun install)

cd frontend
bun install --frozen-lockfile
QINIT_LOCAL="$qinit" bun run build
