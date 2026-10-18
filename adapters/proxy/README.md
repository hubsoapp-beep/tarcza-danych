# Generic proxy

Lokalny proxy OpenAI-compatible dla agentów, które nie mają hooka modelu:
Qwen Code (przez `modelProviders`), Codex CLI, Cline/Roo/Kilo, Continue,
Aider, Goose, Crush, OpenHands i inne.

> **Redaction only.** Proxy chroni request do modelu. Jeśli agent nie ma hooka
> `PreToolUse`, nie ma restore w narzędziach lokalnych. To świadomy kompromis,
> nie pełny parytet.

## Uruchomienie

```sh
export TARCZA_UPSTREAM_KEY="prawdziwy klucz providera"
cd adapters/proxy
node --experimental-strip-types run.ts
```

Daemon tworzy `~/.tarcza/token` (0600). Token jest lokalnym kluczem, który
agent wysyła do proxy; proxy zamienia go na `TARCZA_UPSTREAM_KEY`.

| Zmienna | Domyślnie | Znaczenie |
| --- | --- | --- |
| `TARCZA_PORT` | `8787` | port proxy |
| `TARCZA_UPSTREAM` | `https://api.x.ai/v1` | upstream OpenAI-compatible |
| `TARCZA_UPSTREAM_KEY` | `XAI_API_KEY` | prawdziwy klucz upstreamu |
| `TARCZA_TOKEN` | plik `~/.tarcza/token` | token lokalny |
| `TARCZA_VAULT` | puste | notatki do nauki |
| `TARCZA_GLOSSARY` | `~/.claude/redactor-pl/slownik.txt` | słownik |

## Konfiguracja agenta

Wspólny wzór:

```
base_url = http://127.0.0.1:8787/v1
api_key  = token z ~/.tarcza/token
model    = dowolny model obsługiwany przez upstream
```

Przykłady:

- **Qwen Code**: `adapters/qwen/README.md` (`modelProviders.openai`),
- **Aider**: `--openai-api-base http://127.0.0.1:8787/v1`,
- **Cline/Roo/Continue**: własny provider „OpenAI Compatible”,
- **Codex CLI**: `model_providers` z `base_url` (sprawdź, czy używa
  `chat_completions`, czy `responses`; proxy na razie obsługuje pierwsze).

## Co chroni

- prompt i historię wiadomości w requestcie,
- wyniki narzędzi, które agent dokleja do kolejnego requestu,
- sekrety w `tool_calls.function.arguments` (jeśli model je wygenerował).

## Czego nie chroni

- lokalnego transkryptu agenta (może zapisać oryginał przed proxy),
- wejścia narzędzi lokalnych (brak restore bez hooka),
- odpowiedzi streamowanej (proxy przekazuje ją bez modyfikacji),
- `responses` i `messages` (na razie tylko `chat_completions`).

## Test

Proxy jest pokryty testem adaptera Grok:

```sh
cd adapters/grok
node --experimental-strip-types test/proxy.test.mts
```

Ten sam daemon obsługuje Qwen i Grok; test sprawdza redakcję requestu,
wspólne restore, auth i kontrakt hooków.
