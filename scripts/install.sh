#!/bin/sh
# Install Tarcza danych on this computer. Needs Claude Code (`claude`) in PATH.
set -eu

REPO="${TARCZA_REPO:-hubsoapp-beep/tarcza-danych}"

command -v claude >/dev/null 2>&1 || { echo "Brak polecenia 'claude'. Zainstaluj Claude Code." >&2; exit 1; }

claude plugin marketplace add "$REPO"
claude plugin install redactor-pl@tarcza-danych --scope user

cat <<MSG

Gotowe. Zrestartuj Claude Code (albo wpisz /reload-plugins), potem sprawdź:
  /redact-demo

Ustawienia (notatki do nauki, słownik): /plugin configure redactor-pl@tarcza-danych
Słownik prywatny trzymaj poza repozytorium: ~/.claude/redactor-pl/slownik.txt
MSG
