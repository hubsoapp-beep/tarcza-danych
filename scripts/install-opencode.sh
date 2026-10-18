#!/bin/sh
# Add the OpenCode half of Tarcza danych to the global configuration. Run from
# anywhere; it finds the plugin next to this script.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PKG="$ROOT/plugins/redactor-opencode"
CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/opencode/opencode.json"

command -v opencode >/dev/null 2>&1 || {
  echo "Brak polecenia 'opencode'. Zainstaluj OpenCode 2.0.32 lub nowszy." >&2
  exit 1
}
command -v node >/dev/null 2>&1 || {
  echo "Brak polecenia 'node'. Skrypt używa Node do edycji opencode.json." >&2
  exit 1
}
[ -f "$PKG/index.ts" ] || {
  echo "Nie znaleziono pluginu: $PKG" >&2
  exit 1
}

mkdir -p "$(dirname -- "$CONFIG")"
PKG="$PKG" CONFIG="$CONFIG" VAULT="${TARCZA_VAULT:-}" GLOSSARY="${TARCZA_GLOSSARY:-}" node - <<'NODE'
const fs = require('node:fs')
const config = process.env.CONFIG
const pkg = process.env.PKG
let data
try {
  data = JSON.parse(fs.readFileSync(config, 'utf8'))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  data = { $schema: 'https://opencode.ai/config.json', plugins: [] }
}
if (!Array.isArray(data.plugins)) data.plugins = []
data.plugins = data.plugins.filter((entry) => {
  if (typeof entry === 'string') return !entry.endsWith('/redactor-opencode')
  return !(entry && typeof entry === 'object' && String(entry.package || '').endsWith('/redactor-opencode'))
})
const options = {}
if (process.env.VAULT) options.vaultSources = process.env.VAULT
if (process.env.GLOSSARY) options.glossaryFile = process.env.GLOSSARY
data.plugins.push({ package: pkg, options })
fs.writeFileSync(config, JSON.stringify(data, null, 2) + '\n')
console.log('Dopisano plugin do ' + config)
NODE

cat <<MSG

Gotowe. Zrestartuj OpenCode i sprawdź w TUI:
  /redact-demo
  /redactions

Sejf z notatek (opcjonalnie):
  TARCZA_VAULT="~/Notatki/serwery" ./scripts/install-opencode.sh

Słownik trzymaj poza repozytorium, np. ~/.claude/redactor-pl/slownik.txt.
MSG
