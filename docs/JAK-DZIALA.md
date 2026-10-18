# Jak działa Tarcza danych

Ten dokument opisuje oba moduły: `redactor-pl` dla Claude Code i
`redactor-opencode` dla OpenCode. Wspólny jest silnik redakcji; różni się tylko
warstwa, która podpina go do zdarzeń danego narzędzia.

## 1. Cel

Model nigdy nie powinien zobaczyć prawdziwego hasła, klucza, numeru PESEL ani
domeny klienta. Zamiast wartości dostaje placeholder:

```
[REDACTED-HASLO-1a2b3c4d]
```

Placeholder jest **stabilny w obrębie procesu**: ta sama wartość zawsze dostaje
ten sam tag. Dzięki temu model nadal potrafi odróżnić „hasło do bazy” od „hasła
do panelu”, nie znając żadnego z nich.

Gdy wartość ma trafić do narzędzia, które wykonuje się na Twoim komputerze
(`shell`, `write`, `edit`, `patch`, w Claude Code `Bash`, `Write`, `Edit`),
placeholder jest zamieniany z powrotem na prawdziwą wartość. Po wykonaniu
narzędzia wynik jest ponownie skanowany.

## 2. Przepływ

```
                 ┌─────────────────────────────────────────────┐
 Twoja wiadomość │  prompt hook: scrubAll(text, files.opis)     │
 ───────────────►│  placeholdery zamiast wartości               │
                 └──────────────────────┬──────────────────────┘
                                        │
                 ┌──────────────────────▼──────────────────────┐
 Kontekst sesji  │  context hook:                              │
 (AGENTS.md,     │    system  → scrubQuiet (sekrety i hasła)   │
 historia,       │    messages → scrubAll (pełny skan)         │
 wyniki          │    compaction/generate/title → to samo      │
 narzędzi)       └──────────────────────┬──────────────────────┘
                                        │
                 ┌──────────────────────▼──────────────────────┐
                 │  MODEL: widzi tylko placeholdery             │
                 └──────────────────────┬──────────────────────┘
                                        │ tool call z placeholderem
                 ┌──────────────────────▼──────────────────────┐
                 │  execute.before: restore()                    │
                 │  tylko narzędzia lokalne, nie publishujące    │
                 └──────────────────────┬──────────────────────┘
                                        │ prawdziwa wartość
                 ┌──────────────────────▼──────────────────────┐
                 │  NARZĘDZIE NA TWOIM KOMPUTERZE               │
                 └──────────────────────┬──────────────────────┘
                                        │ wynik
                 ┌──────────────────────▼──────────────────────┐
                 │  execute.after: scrub + rehideHanded()       │
                 │  wartości przekazane w tym wywołaniu wracają │
                 │  ukryte, nawet jeśli są bardzo krótkie       │
                 └──────────────────────┬──────────────────────┘
                                        │
                                        ▼
                              MODEL: znowu placeholdery
```

Najważniejsza jest ostatnia warstwa: `context`. Nawet jeśli `prompt` albo
`execute.after` czegoś nie zauważy, **każdy request do modelu** jest skanowany
przed wysłaniem. To bezpiecznik, nie dodatek.

## 3. Placeholdery i sejf

Silnik (`detect.ts`) trzyma w pamięci dwie mapy:

- `byValue`: wartość → tag,
- `byTag`: tag → wartość.

`mint(kind, value)` tworzy tag i zapisuje obie strony. `restore(tag)` zwraca
wartość. Nic nie jest zapisywane na dysk; sejf żyje tyle, co proces.

Są dwa rodzaje tagów:

| Tag | Znaczenie |
| --- | --- |
| `[REDACTED-SECRET-…]`, `[REDACTED-HASLO-…]` | żywy sekret: można go przywrócić w narzędziu lokalnym |
| `[REDACTED-LITERAL-…]` | **cytat** placeholdera: przywraca sam tekst placeholdera, nigdy sekret |

`escapeLiteralTags()` zamienia żywy placeholder znaleziony w wyniku narzędzia na
`LITERAL`. Dzięki temu model, który przeczyta z pliku `[REDACTED-HASLO-…]`, nie
może przypadkiem wstawić tego tekstu do komendy i dostać prawdziwego hasła.
Narzędzia, które zwracają żywe placeholdery (`task`, `agent`), są wyłączone z
tego zabezpieczenia.

## 4. Co jest skanowane

### OpenCode (`redactor-opencode/index.ts`)

| Miejsce | Funkcja | Tryb |
| --- | --- | --- |
| `prompt` | tekst wiadomości, `description` i `mention.text` załączników | pełny |
| `context` | `system`, `messages` (tekst, tool-call input, tool-result) | system: sekrety; messages: pełny |
| `compaction` | wiadomości i `result.summary` | pełny |
| `generate` | `system` i `messages` | system: sekrety; messages: pełny |
| `title` | wiadomości i `result` | pełny |
| `tool.execute.before` | wejście narzędzia lokalnego | restore |
| `tool.execute.after` | `content`, `output`, błąd i metadane błędu | pełny + rehide |

### Claude Code (`redactor-pl/hooks/redact.ts`)

| Zdarzenie | Co robi |
| --- | --- |
| `session.start` | ładuje sejf z notatek i otwiera panel |
| `prompt.submit` | skanuje prompt i kontekst dołączony do promptu |
| `tool.call` | restore wejścia, skan wyjścia, `deny` przy błędzie skanu |
| `prompt.context` | skanuje bloki typu `CLAUDE.md` (tylko sekrety) |
| `prompt.attachment` | skanuje załączniki i diffy |
| `prompt.mention` | blokuje plik, który zawiera sekret, zanim zostanie wklejony |
| `agent.spawn` | skanuje prompt subagenta; prompt workflow z sekretem odrzuca |

## 5. Co jest wykrywane

### Klucze i tokeny

Około 70 formatów dostawców (Anthropic, OpenAI, Stripe, GitHub, AWS, Google,
JWT, klucze prywatne PEM), wysokie entropie, tokeny po nazwach (`API_KEY=`,
`Bearer`, `token:`), sekrety w URL-ach, cookies i nagłówki poczty.

### Warstwa polska (`pl.ts`)

- **Hasła po etykiecie**: `Hasło:`, `**Password:**`, `Pwd=`, komórki tabel,
  backticki, cudzysłowy. Także hasła niskiej entropii, jeśli wyglądają jak
  hasło (cyfra, symbol, mieszana wielkość liter).
- **Dane osobowe z sumą kontrolną**: PESEL, NIP, REGON, dowód, IBAN, karta
  (Luhn), telefon. Losowy ciąg cyfr nie jest ukrywany.
- **Infrastruktura**: loginy (`Użytkownik:`, `user@host`, `--user=`), domeny
  (`Domena:`, `--domain=`), adresy IP. `0.0.0.0`, `127.0.0.1`, `::1` i
  `localhost` są zawsze zostawiane: to adresy bind/loopback, nie sekrety.
  Prywatny adres IP w roli hosta URL-a (`http://<ip>:8096`) też zostaje, gdy
  `allowLocalUrls` jest włączone (domyślnie); ten sam adres w prozie nadal jest
  ukrywany.
- **Link lokalnego serwera**: `0.0.0.0` to adres bind („wszystkie interfejsy”),
  nie adres do przeglądarki. W przeglądarce wpisz `http://localhost:<port>`.
  Plugin zostawia `localhost`, `127.0.0.1` i `0.0.0.0`, żeby model mógł podać
  działający link.
- **Słownik**: `KLIENT: Kancelaria Nowak`, `OSOBA: Jan* Kowalsk*`. Gwiazdka
  podstawia polskie końcówki.
- **Nauka z notatek**: przy starcie sesji hasła, loginy i domeny z wybranych
  plików są zapamiętywane i ukrywane wszędzie, także bez etykiety.

## 6. Sejf z notatek

`vault.ts`:

1. czyta `glossaryFile` i ładuje słownik,
2. przechodzi `vaultSources` (pliki i foldery, maks. 300 plików, głębokość 3),
3. dla każdego pliku tekstowego uruchamia detektory i `learnFrom()`,
4. zapamiętuje wartości w pamięci procesu.

Raport zawiera tylko liczby: pliki, wartości, wpisy słownika. Wartości nie
trafiają do logów. Foldery `node_modules`, `dist`, `build`, `vendor` i ukryte
są pomijane.

## 7. Fail-closed

Redaktor ma zawodzić bezpiecznie:

- tekst dłuższy niż `SCAN_CAP` (16 MB) nie jest przepuszczany — dostaje
  `[tarcza-danych: treść wstrzymana…]`,
- wyjątek w skanie nie przepuszcza oryginału — `safeScrub()` zwraca tekst
  wstrzymany,
- błąd `walk()` na obiekcie narzędzia usuwa `output` i wstawia tekst
  wstrzymany,
- jeśli prawdziwa wartość zawiera znaki powłoki (spacja, cudzysłów, `$`, `;`,
  `|`, backtick…), `shell` **nie** dostaje tej wartości. Trzeba zapisać ją
  narzędziem `write` do pliku i kazać poleceniu przeczytać plik,
- polecenia publikujące (`git commit`, `git tag`, `gh issue`, `gh pr`,
  `gh release`…) nie dostają prawdziwych wartości, żeby sekret nie wyjechał
  w historii gita.

## 7a. Wyjątki

Kolejność jest stała: `allow` > `allowPrefixes` > `allowEmails` > detektory.
Wyjątek działa też na warstwę polską i sejf: wartość z `allow` nie zostanie
ukryta jako `HASLO`, `LOGIN`, `DOMENA`, numer ani wpis słownika. Wartość
dozwolona nie jest też uczona z notatek, więc nie wróci jako ukryta później.

- `allow`: dokładne wartości, po przecinku (`sellso.pl,Kancelaria Nowak`).
- `allowPrefixes`: prefiksy (`price_,prod_`).
- `allowEmails`: adresy albo domeny (`@sellso.pl`).
- `allowLocalUrls`: prywatny IP jako host URL-a (domyślnie `true`).
- `0.0.0.0`, `127.0.0.1`, `::1`, `localhost`: zawsze poza skanem.

Nie dodawaj do `allow` haseł, kluczy ani numerów, których naprawdę nie chcesz
pokazywać. Wyjątek jest obejściem detektora, nie sejfem.

## 8. Lokalne a zdalne narzędzia

`restoreTools` domyślnie: `shell,write,edit,patch` (OpenCode) oraz
`Bash,Write,Edit,MultiEdit,NotebookEdit` (Claude Code). Tylko te narzędzia
dostają prawdziwe wartości.

Narzędzia, które wysyłają dane do sieci albo do innego modelu (`webfetch`,
`websearch`, `task`, MCP), dostają placeholder. Nic nie jest przywracane.
W Claude Code `Agent`/`Task` są wyjątkiem tylko dlatego, że ich odpowiedź może
zawierać żywe placeholdery; ich wejście nadal nie jest przywracane.

## 9. Claude Code i OpenCode — różnice

| Obszar | Claude Code | OpenCode |
| --- | --- | --- |
| Wejście | `prompt.submit` | `session.hook("prompt")` |
| Kontekst | `prompt.context`, `prompt.attachment` | `session.hook("context")` |
| Narzędzia | `tool.call` (before/after w jednym) | `tool.hook("execute.before/after")` |
| Subagenci | `agent.spawn` | brak odpowiednika; `task`/`agent` tylko nie escapują tagów |
| Panel | pane z licznikami i maskami | brak; `/redactions` pokazuje liczniki |
| Komendy | `command.register` | `command.transform` (TUI) |
| Sejf | `$.fs` | `node:fs` |
| Projektor | tak | nie |

## 10. Czego nie ma

- Obrazy, zrzuty ekranu, PDF-y i inne media nie są skanowane. Model dostaje je
  jako media, nie jako tekst.
- Bloki `reasoning` nie są przepisywane: provider może je podpisywać. Model
  nigdy nie widział prawdziwej wartości, więc nie ma jej tam z definicji.
- Stare sesje w `~/.claude/projects/` i `~/.local/share/opencode/` zawierają
  to, co wysłano przed instalacją.
- Hasło bez etykiety i bez wpisu w sejfie przejdzie, jeśli nie wygląda jak
  sekret.
- Imiona i adresy w wolnym tekście są łapane tylko przez słownik.
- `opencode run` nie dispatchuje komend pluginów; działają w TUI.

## 11. Mapa plików

```
plugins/redactor-pl/               Claude Code
  hooks/detect.ts                  silnik: config, mint/restore, detektory, walk
  hooks/pl.ts                      warstwa polska
  hooks/scrub.ts                   scrubAll / scrubQuiet
  hooks/vault.ts                   sejf z notatek
  hooks/redact.ts                  hooki Claude Code
  hooks/pane.tsx, ledger.ts        panel i liczniki
  test/                            testy silnika

plugins/redactor-opencode/         OpenCode
  detect.ts, pl.ts                 ten sam silnik (kopia)
  scrub.ts                         scrubAll / scrubQuiet + liczniki
  vault.ts                         sejf na node:fs
  config.ts                        domyślne opcje jak w plugin.json
  stats.ts                         liczniki bez wartości
  demo.ts                          fałszywa notatka do /redact-demo
  index.ts                         hooki OpenCode i komendy
  test/                            silnik + podpięcie + sejf

adapters/shared/                   wspólny daemon i token
  daemon.ts                        /v1 proxy + /scrub + /restore + /stats
  token.ts                         ~/.tarcza/token (0600)

adapters/grok/                     Grok Build (MVP)
  run.ts                           start wspólnego daemona
  hook.ts                          PreToolUse / PostToolUse

adapters/gemini/                   Gemini CLI (MVP)
  run.ts                           start wspólnego daemona
  hook.ts                          BeforeModel / BeforeTool / AfterTool / AfterModel

scripts/install.sh                 instalacja Claude Code
scripts/install-opencode.sh        wpis do ~/.config/opencode/opencode.json
docs/AGENCI.md                     macierz agentów i adapterów
```

## 12. Testy

```sh
cd plugins/redactor-pl
node --experimental-strip-types test/detect.test.mts
node --experimental-strip-types test/pl.test.mts
node --experimental-strip-types test/random-tags.test.mts
node --experimental-strip-types test/session-privacy.test.mts
node --experimental-strip-types test/pii-options.test.mts
```

```sh
cd plugins/redactor-opencode
npm install
npm test
```

Testy silnika są wspólne. `test/opencode.test.mts` sprawdza podpięcie hooków na
fałszywym kontekście: prompt, kontekst, restore, wynik narzędzia, komendy i
domyślne opcje. `test/vault.test.mts` sprawdza sejf i słownik.

## 13. Ręczna weryfikacja w OpenCode

W TUI:

```
/redact-demo
```

Zobaczysz fałszywą notatkę przed i po podmianie. Potem:

```
/redact-test Hasło: Test123!
/redactions
```

`/redact-test` nie wysyła tekstu do modelu. `/redactions` pokazuje liczniki.

Test „czy model widzi sekret” zrób na wartościach, które nie wyglądają jak
prawdziwe dane, i nie używaj do tego prawdziwych haseł.
