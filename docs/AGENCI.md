# Agenci i adaptery

Jeden silnik redakcji, wiele cienkich adapterów. Ten dokument mówi, co który
agent potrafi i czego mu brakuje. Stan na `0.4.0`.

## Macierz

| Agent | Prompt | Restore w narzędziach | Wynik narzędzia | Lokalny transkrypt | Status |
| --- | --- | --- | --- | --- | --- |
| **Claude Code** | hook `prompt.submit` | `tool.call` | `tool.call` | chroniony przed zapisem | ✅ `0.1.2` |
| **OpenCode** | hook `prompt` | `execute.before` | `execute.after` | chroniony przed zapisem | ✅ `0.2.2` |
| **Grok Build** | proxy `base_url` | `PreToolUse` | `PostToolUse` | **może zachować oryginał** | 🟡 MVP `0.1.0` |
| **Gemini CLI** | `BeforeModel` | `BeforeTool` | `AfterTool` / `AfterModel` | zależnie od hooka | 🟡 MVP `0.1.0` |
| **Qwen Code** | proxy `baseUrl` | `PreToolUse` | proxy (następny request) | może zachować oryginał | 🟡 MVP `0.1.0` |
| **Codex CLI** | proxy | ❌ | proxy (następny request) | może zachować oryginał | ⬜ |
| **Cline / Roo / Kilo** | proxy | ❌ | proxy | może zachować oryginał | ⬜ |
| **Continue.dev** | proxy | ❌ | proxy | może zachować oryginał | ⬜ |
| **Aider** | proxy | ❌ | proxy | może zachować oryginał | ⬜ |
| **Goose / Crush / OpenHands** | proxy | ❌/ograniczone | proxy | może zachować oryginał | ⬜ |
| **Cursor / Windsurf / Copilot / Warp** | brak pewnego hooka | ❌ | ❌ | ❌ | ⛔ |

Legenda: ✅ pełne, 🟡 częściowe, ⬜ do zrobienia, ⛔ poza zakresem.

## Co znaczą kolumny

- **Prompt** — czy prawdziwa wartość w wiadomości użytkownika jest podmieniana
  **przed** wysłaniem do modelu.
- **Restore** — czy placeholder wraca do prawdziwej wartości przed narzędziem
  lokalnym (`shell`, edycja plików).
- **Wynik narzędzia** — czy to, co narzędzie wypisało, jest ukrywane przed
  modelem.
- **Lokalny transkrypt** — czy harness zapisuje już zredagowany tekst, czy
  oryginał. To najczęściej pomijana różnica: proxy chroni model, ale nie
koniecznie dysk.

## Adapter Grok Build

Grok ma `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `SessionStart` i własne
modele (`base_url`, `api_backend`). Nie ma hooka, który przepisze prompt —
`UserPromptSubmit` tylko blokuje. Dlatego:

```
prompt → lokalne proxy (base_url) → xAI
tool   → PreToolUse (restore) → narzędzie → PostToolUse (scrub)
```

Proxy i hooki dzielą jeden daemon, więc tag z promptu jest tym samym tagiem,
który hook przywraca. Kod: [`adapters/grok`](../adapters/grok/README.md).

Ograniczenia:

- prompt chroni proxy, nie hook; bez proxy nie ma redakcji promptu,
- `PostToolUse` podmienia wynik tylko modelowi — scrollback/transkrypt może
  zachować oryginał,
- restore tylko dla lokalnych narzędzi (`TARCZA_RESTORE_TOOLS`),
- na razie `chat_completions`; `responses` i `messages` w planach.

## Adapter Gemini CLI

Gemini CLI ma najpełniejszy zestaw hooków:

| Hook | Co można zrobić |
| --- | --- |
| `BeforeModel` | podmienić `llm_request.messages` przed wysłaniem |
| `BeforeTool` | podmienić `tool_input` |
| `AfterTool` | ukryć/podmienić wynik narzędzia |
| `AfterModel` | zredagować chunk odpowiedzi |
| `SessionStart` | załadować sejf |

To pozwala zrobić pełny parytet bez proxy. Kod:
[`adapters/gemini`](../adapters/gemini/README.md). `AfterTool` używa
`decision: "deny"` + `reason`, więc wynik jest tekstem; to ograniczenie API.
Qwen Code jest forkiem Gemini CLI, ale ma hooki w stylu Claude i nie ma `BeforeModel`; dlatego korzysta z proxy (patrz niżej).

## Adapter Qwen Code

Qwen ma hooki w stylu Claude, ale **bez `BeforeModel`**. Dlatego:

- prompt i wyniki narzędzi redaguje proxy (`modelProviders.openai.baseUrl`),
- `PreToolUse` przywraca wartości w `run_shell_command`, `write_file`,
  `replace`, `read_file`,
- `PostToolUse` nie podmienia wyniku — proxy robi to w następnym requestcie,
- `UserPromptSubmit` może tylko zablokować prompt (`TARCZA_BLOCK_PROMPTS=1`).

Kod: [`adapters/qwen`](../adapters/qwen/README.md). Proxy:
[`adapters/proxy`](../adapters/proxy/README.md).

## Kontrakt adaptera

Każdy adapter powinien mapować te same operacje na hooki danego agenta:

```
onSessionStart()          -> load vault + glossary
onPrompt(text)            -> text | block
onContext(messages)       -> messages
onToolInput(tool, input)  -> input   (tylko narzędzia lokalne)
onToolOutput(tool, output)-> output  (model-facing)
onStats()                 -> counts, no values
```

Wspólne rzeczy, których nie wolno duplikować:

- detektory i suma kontrolna (`detect.ts`, `pl.ts`),
- `mint` / `restore` i mapa tagów,
- `allow` / `allowPrefixes` / `allowEmails` / `allowLocalUrls`,
- fail-closed i limit skanu,
- sejf i słownik.

## Kolejność

1. **`@tarcza/core`** — wspólny pakiet zamiast kopii w pluginach.
2. **`@tarcza/daemon`** — `/scrub`, `/restore`, `/stats`; jedno miejsce stanu.
3. **Gemini CLI** — pełny parytet hookami.
4. **Grok Build** — dopracować proxy (`responses`, `messages`, streaming).
5. **Generic proxy** — Codex, Cline/Roo, Continue, Aider, Goose/Crush/OpenHands.
6. **Enterprise** — managed config, wymuszone hooki, gateway.

## Czego nie robić

- Nie portować silnika po raz piąty. Nowy adapter importuje core.
- Nie dodawać agenta, który nie ma hooka ani konfigurowalnego `base_url`.
- Nie obiecywać ochrony lokalnego transkryptu, jeśli harness zapisuje przed
  hookiem.
- Nie przywracać wartości w narzędziach sieciowych (`web_search`, MCP,
  subagenci).

Szczegóły roadmapy: [ROADMAP.md](../ROADMAP.md).
