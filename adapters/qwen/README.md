# Tarcza danych dla Qwen Code

Adapter do [Qwen Code](https://github.com/QwenLM/qwen-code). Qwen ma hooki w
stylu Claude (`PreToolUse`, `UserPromptSubmit`), ale **nie ma hooka
`BeforeModel`**, więc prompt i wyniki narzędzi redaguje lokalne proxy, a hook
`PreToolUse` przywraca wartości w narzędziach lokalnych.

> **Status: MVP.** Wymaga Node 22+ i wspólnego proxy/daemona Tarczy.

## Jak to działa

```
prompt → Qwen (baseUrl = 127.0.0.1:8787/v1) → proxy → provider
tool   → PreToolUse hook → /restore → narzędzie lokalne
       → wynik w kolejnym requestcie → proxy scrubuje messages
```

Qwen nie pozwala `PostToolUse` podmienić wyniku (może tylko dodać kontekst),
dlatego wynik narzędzia jest czyszczony w **następnym requestcie** przez proxy.

## Instalacja

```sh
# 1. Prawdziwy klucz providera.
export TARCZA_UPSTREAM_KEY="..."
# Dla DashScope: export TARCZA_UPSTREAM="https://dashscope.aliyuncs.com/compatible-mode/v1"

# 2. Proxy + daemon.
cd tarcza-danych/adapters/proxy
node --experimental-strip-types run.ts
```

Daemon utworzy `~/.tarcza/token` (0600).

```sh
# 3. Qwen czyta klucz z envKey.
export TARCZA_LOCAL_KEY="$(cat ~/.tarcza/token)"
```

```sh
# 4. Połącz settings.example.json z ~/.qwen/settings.json
mkdir -p ~/.qwen
# modelProviders + hooks; podmień /ABS/PATH/TO/tarcza-danych
```

Zrestartuj Qwen Code, wybierz model `Qwen via Tarcza` (`/model`).

## Konfiguracja

| Zmienna | Domyślnie | Znaczenie |
| --- | --- | --- |
| `TARCZA_UPSTREAM` | `https://api.x.ai/v1` | endpoint OpenAI-compatible providera |
| `TARCZA_UPSTREAM_KEY` | `XAI_API_KEY` | prawdziwy klucz providera |
| `TARCZA_LOCAL_KEY` | — | token z `~/.tarcza/token`, czytany przez Qwen |
| `TARCZA_DAEMON` | `http://127.0.0.1:8787` | adres proxy/daemona |
| `TARCZA_VAULT` | puste | notatki do nauki |
| `TARCZA_GLOSSARY` | `~/.claude/redactor-pl/slownik.txt` | słownik |
| `TARCZA_RESTORE_TOOLS` | `run_shell_command,write_file,replace,read_file` | narzędzia lokalne |
| `TARCZA_BLOCK_PROMPTS` | `0` | `1` = `UserPromptSubmit` blokuje prompt z sekretem |

## Ograniczenia

- **Prompt chroni proxy, nie hook.** `UserPromptSubmit` w Qwen tylko blokuje.
- **Lokalny transkrypt** może zachować oryginał; proxy chroni request do modelu.
- **Brak restore dla narzędzi sieciowych** (`web_search`, MCP, subagenci).
- **`PostToolUse` nie podmienia wyniku**; robi to proxy w następnym requestcie.
- **Tylko `chat-completions`**; `responses` w planach.
- **Znaki powłoki**: wartość ze spacją, `$`, `;` itp. nie trafi do
  `run_shell_command`; zapisz ją do pliku.

## Testy

```sh
cd adapters/qwen
node --experimental-strip-types test/hooks.test.mts
```

Test sprawdza `PreToolUse`, blokadę narzędzi sieciowych i opcjonalny
`UserPromptSubmit`. Proxy jest pokryte testem Groka (`adapters/grok/test`) —
to ten sam wspólny daemon.
