# Tarcza danych dla Gemini CLI

Adapter do [Gemini CLI](https://github.com/google-gemini/gemini-cli). Silnik
redakcji jest ten sam co w `redactor-pl`, `redactor-opencode` i
`adapters/grok`; ten katalog dodaje hooki Gemini.

> **Status: MVP.** Wymaga Node 22+ i wspólnego daemona Tarczy.

## Hooki

| Hook Gemini | Co robi Tarcza |
| --- | --- |
| `SessionStart` | sprawdza daemon i ładuje sejf (daemon robi to przy starcie) |
| `BeforeModel` | redaguje `llm_request.messages` przed wysłaniem |
| `BeforeTool` | przywraca wartości tylko w lokalnych narzędziach |
| `AfterTool` | ukrywa prawdziwy `tool_response` przed modelem |
| `AfterModel` | redaguje chunk odpowiedzi |
| `BeforeAgent` | opcjonalnie blokuje prompt z sekretem (`TARCZA_BLOCK_PROMPTS=1`) |

`BeforeModel` dostaje całą historię wiadomości, więc obejmuje prompt, wyniki
narzędzi i kontekst. To ta sama warstwa co `context` w OpenCode.

## Instalacja

```sh
# 1. Wspólny daemon (ten sam co dla Groka).
cd tarcza-danych/adapters/gemini
node --experimental-strip-types run.ts
```

Daemon utworzy `~/.tarcza/token` (0600). Hooki czytają go same; nie musisz go
nigdzie wpisywać.

```sh
# 2. Hooki w ~/.gemini/settings.json.
mkdir -p ~/.gemini
# połącz "hooks" z settings.example.json z własnym settings.json
# i podmień /ABS/PATH/TO/tarcza-danych na prawdziwą ścieżkę
```

Zrestartuj Gemini CLI. Sprawdź `/hooks`, jeśli Twoja wersja ma tę komendę.

## Konfiguracja

| Zmienna | Domyślnie | Znaczenie |
| --- | --- | --- |
| `TARCZA_DAEMON` | `http://127.0.0.1:8787` | adres wspólnego daemona |
| `TARCZA_TOKEN` | plik `~/.tarcza/token` | token lokalny |
| `TARCZA_VAULT` | puste | notatki do nauki, po przecinku |
| `TARCZA_GLOSSARY` | `~/.claude/redactor-pl/slownik.txt` | słownik |
| `TARCZA_RESTORE_TOOLS` | `run_shell_command,write_file,replace,read_file` | narzędzia lokalne, które dostają prawdziwe wartości |
| `TARCZA_BLOCK_PROMPTS` | `0` | `1` = `BeforeAgent` blokuje prompt z sekretem |

## Ograniczenia

- **`AfterTool` używa `decision: "deny"` + `reason`.** To zastępuje wynik
  tekstem; dla narzędzi zwracających bogatą strukturę może być mniej wygodne.
  Gemini na razie nie daje w tym hooku prostego „podmień wynik na obiekt”.
- **Lokalny transkrypt.** `BeforeModel` chroni request do modelu; sprawdź, czy
  Gemini zapisuje prompt przed hookiem. Jeśli tak, sam hook nie ochroni dysku.
- **Daemon musi działać.** Bez niego hooki odmawiają (`deny`), a nie
  przepuszczają tekstu.
- **Tylko narzędzia lokalne** dostają restore. `web_search`, MCP i subagenci
  zostają na placeholderach.
- **Znaki powłoki.** Wartość ze spacją, cudzysłowem, `$`, `;` itp. nie trafi do
  `run_shell_command`; zapisz ją do pliku i przeczytaj w poleceniu.
- **Limit skanu.** Pojedynczy string powyżej 16 MB jest wstrzymywany, nie przepuszczany.
- **Timeout.** Hook, który nie zdąży, jest fail-open po stronie Gemini; dlatego `BeforeModel` i `AfterTool` mają 30 s, a `AfterModel` 15 s.
- **Brak proxy.** Gemini ma pełne hooki modelu, więc proxy nie jest potrzebne.

## Testy

```sh
cd adapters/gemini
node --experimental-strip-types test/hooks.test.mts
```

Test sprawdza `BeforeModel`, `BeforeTool`, `AfterTool` i `AfterModel` na
fałszywym daemonie; bez prawdziwego klucza i prawdziwych danych.

## Qwen Code

Qwen Code jest forkiem Gemini CLI. Jeśli ma te same hooki, adapter powinien
działać po podmianie ścieżki w `settings.json`. To następny krok w
[ROADMAP.md](../../ROADMAP.md).
