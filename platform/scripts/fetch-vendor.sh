#!/usr/bin/env bash
# Download the WebAssembly engines into dist/vendor (not committed: ~14 MB).
set -euo pipefail
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
( cd "$TMP" && npm pack pyodide@0.27.7 sql.js@1.12.0 >/dev/null 2>&1 && for f in *.tgz; do mkdir -p "${f%.tgz}" && tar xzf "$f" -C "${f%.tgz}"; done )
mkdir -p dist/vendor/py dist/vendor/sql
for f in pyodide.js pyodide.asm.js pyodide.asm.wasm python_stdlib.zip pyodide-lock.json; do cp "$TMP/pyodide-0.27.7/package/$f" dist/vendor/py/; done
cp "$TMP/sql.js-1.12.0/package/dist/sql-wasm.js" "$TMP/sql.js-1.12.0/package/dist/sql-wasm.wasm" dist/vendor/sql/
rm -rf "$TMP"
du -sh dist/vendor/*
