# Tarcza danych dla Grok Build

Adapter do oficjalnego [Grok Build](https://github.com/xai-org/grok-build)
(`grok`). Silnik redakcji jest ten sam co w `redactor-pl` i
`redactor-opencode`; ten katalog dodaje tylko warstwę Groka.

> **Status: MVP.** Działa lokalnie i ma testy, ale nie jest jeszcze paczką npm.
> Wymaga Node 22+ i Grok Build z obsługą własnych modeli.

## Jak to działa

Grok nie pozwala hookowi `UserPromptSubmit` przepisać promptu — potrafi go
tylko zablokować. Dlatego prompt jest redagowany w **lokalnym proxy**, a hooki
obsługują narzędzia:

```
Twoja wiadomość
  → Grok (base_url = 127.0.0.1:8787)
  → proxy: scrub promptu i kontekstu
  → model widzi placeholdery

tool call
  → PreToolUse hook: /restore w daemonie
  → narzędzie lokalne (shell, search_replace, …)
  → PostToolUse hook: /scrub wyniku dla modelu
```

Proxy i hooki dzielą jeden proces (daemon), więc tag utworzony dla promptu jest
tym samym tagiem, który hook przywraca w narzędziu. Wartości żyją tylko w
pamięci procesu. Daemon jest wspólny z adapterem Gemini (`adapters/shared`).

## Instalacja

```sh
# 1. Prawdziwy klucz xAI zostaje w środowisku, nie w configu.
export TARCZA_UPSTREAM_KEY="$(cat ~/.xai-key)"
# albo: export TARCZA_UPSTREAM_KEY="$XAI_API_KEY"

# 2. Uruchom daemon (terminal albo usługa systemd/launchd).
cd tarcza-danych/adapters/grok
node --experimental-strip-types run.ts
```

Daemon wypisze adres i utworzy `~/.tarcza/token` (0600). Token wklej do
`~/.grok/config.toml`:

```toml
[model.tarcza-grok]
model = "grok-4.5"
name = "Grok via Tarcza"
base_url = "http://127.0.0.1:8787/v1"
api_backend = "chat_completions"
api_key = "<token z ~/.tarcza/token>"
context_window = 256000
```

Następnie hooki:

```sh
mkdir -p ~/.grok/hooks
cp hooks.example.json ~/.grok/hooks/tarcza.json
# podmień /ABS/PATH/TO/tarcza-danych na prawdziwą ścieżkę
```

Zrestartuj Groka, sprawdź `/hooks` i wybierz model `tarcza-grok`
(`/model tarcza-grok`).

## Konfiguracja

| Zmienna | Domyślnie | Znaczenie |
| --- | --- | --- |
| `TARCZA_PORT` | `8787` | port proxy/daemona |
| `TARCZA_UPSTREAM` | `https://api.x.ai/v1` | upstream OpenAI-compatible |
| `TARCZA_UPSTREAM_KEY` | `XAI_API_KEY` | prawdziwy klucz upstreamu |
| `TARCZA_TOKEN` | plik `~/.tarcza/token` | token lokalny |
| `TARCZA_VAULT` | puste | notatki do nauki, po przecinku |
| `TARCZA_GLOSSARY` | `~/.claude/redactor-pl/slownik.txt` | słownik |
| `TARCZA_RESTORE_TOOLS` | `run_terminal_command,search_replace,write_file,create_file` | narzędzia, które dostają prawdziwe wartości |
| `TARCZA_BLOCK_PROMPTS` | `0` | `1` = hook blokuje prompt z sekretem, zamiast polegać tylko na proxy |

## Ograniczenia

- **Prompt chroni proxy, nie hook.** Jeśli wyłączysz proxy, Grok nie ma jak
  przepisać promptu; hook może go tylko zablokować.
- **Lokalny transkrypt Groka może zachować oryginał.** `PostToolUse` podmienia
  wynik tylko modelowi; scrollback i zapis sesji mogą mieć prawdziwą wartość.
  Proxy chroni egress do modelu, nie lokalny dysk.
- **Restore tylko dla lokalnych narzędzi.** Domyślnie shell, edycja i zapis
  plików. `web_search`, `web_fetch`, MCP i subagenci dostają placeholder.
- **`PostToolUseFailure`** może tylko dodać kontekst; nie podmienia wyniku.
- **Tylko `chat_completions`.** `responses` i `messages` są w planach.
- **Streaming** jest przekazywany bez modyfikacji; redagowany jest request, nie
  każdy chunk odpowiedzi.
- **Daemon musi działać.** Gdy go nie ma, `PreToolUse` odmawia uruchomienia
  narzędzia (fail-closed), a proxy nie przyjmie requestu.

## Bezpieczeństwo

- Daemon słucha tylko `127.0.0.1`.
- Każdy request do `/v1/*`, `/scrub`, `/restore` i `/stats` wymaga tokenu.
- Token jest w `~/.tarcza/token` (0600), ale trafia też do `api_key` w
  `~/.grok/config.toml`; traktuj ten plik jak sekret.
- Prawdziwy klucz upstreamu jest w `TARCZA_UPSTREAM_KEY`, nie w repo.
- Wartości nie są logowane i nie są zapisywane na dysk.
- Hook `PreToolUse` nie przywraca wartości, jeśli zawiera znaki powłoki.

## Testy

```sh
cd adapters/grok
node --experimental-strip-types test/proxy.test.mts
```

Test stawia fałszywy upstream, sprawdza redakcję requestu, wspólne restore,
scrub obiektu, auth i kontrakt hooków. Nie używa prawdziwego klucza.

## Roadmapa

- `responses` i `messages` w proxy,
- redakcja chunków streamu,
- pakiet npm `@tarcza/grok`,
- wspólny `@tarcza/core` zamiast importu z `plugins/redactor-opencode`,
- Gemini CLI i Codex: [ROADMAP.md](../../ROADMAP.md).
