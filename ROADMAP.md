# Roadmapa Tarczy danych

Roadmapa jest pisana pod **kolejnych agentów**: każdy punkt ma zakres, pliki,
kryteria akceptacji i testy, żeby dało się go wykonać bez czytania całej
historii projektu. Stan na dziś: `0.2.0`, OpenCode i Claude Code działają,
testy przechodzą.

Legenda: ✅ zrobione · 🟡 następne · ⬜ później · 🧪 wymaga decyzji

## Zasady, których nie łamiemy

1. **Żadnych prawdziwych danych** w repo, testach, issue i screenshotach.
   Numery z sumą kontrolną budujemy w runtime.
2. **Fail-closed**: brak skanu = tekst wstrzymany, nie „przepuszczony, bo się
   nie udało”.
3. **Wartości zostają w pamięci.** Liczniki mogą iść na dysk, wartości nie.
4. **Zmiana detektora = dwie listy w testach**: `HIDE` i `KEEP`. Fałszywy
   alarm w zwykłym kodzie jest takim samym błędem jak wyciek.
5. **Nie dodajemy narzędzia do `restoreTools`**, jeśli wysyła dane do sieci
   albo do innego modelu.
6. Każdy agent kończy pracę testem, dokumentacją i commitem. Bez „działa u
   mnie”.

---

## Faza 1 — fundament ✅

| Zadanie | Stan | Dowód |
| --- | --- | --- |
| Silnik redakcji i warstwa PL | ✅ | `plugins/redactor-pl/hooks/detect.ts`, `pl.ts` |
| Sejf z notatek i słownik | ✅ | `vault.ts`, `test/vault.test.mts` |
| Claude Code: hooki, panel, komendy | ✅ | `plugins/redactor-pl/hooks/*` |
| OpenCode: hooki, restore, komendy | ✅ | `plugins/redactor-opencode/index.ts` |
| Wspólne testy silnika | ✅ | `plugins/redactor-opencode/test/*` |
| CI dla obu pluginów | ✅ | `.github/workflows/ci.yml` |
| Instalacja OpenCode | ✅ | `scripts/install-opencode.sh` |
| Dokumentacja „jak działa” | ✅ | [docs/JAK-DZIALA.md](docs/JAK-DZIALA.md) |

---

## Faza 2 — parytet z Claude Code 🟡

### Agent A — panel TUI dla OpenCode

**Cel:** `/redactions` otwiera panel z licznikami, a nie tylko wypisuje tekst.

**Kontekst:** OpenCode ma TUI plugin (`@opencode/plugin/tui`) i slot
`session.panel`. Serwer i TUI to osobne konteksty; nie ma wspólnej pamięci.
Panel nie może dostać prawdziwych wartości — tylko liczniki i ewentualnie
maski.

**Zakres:**
- `tui.tsx` (albo `tui.ts`) eksportowany jako `./tui` w `package.json`,
- plik stanu np. `~/.local/share/opencode/tarcza-danych/stats.json` z
  licznikami per kategoria i **bez wartości**,
- serwer (`index.ts`/`stats.ts`) zapisuje stan po każdym skanie (throttle,
  np. 500 ms),
- panel: suma, kategorie, „ostatnio ukryto”, tryb projektora (maski on/off),
- `/redactions` otwiera panel; `Esc` zamyka,
- brak panelu nie może wywalić redakcji.

**Pliki:** `plugins/redactor-opencode/tui.tsx`, `stats.ts`, `index.ts`,
`package.json`, `README.md`.

**Akceptacja:**
- panel otwiera się w TUI i pokazuje liczby zgodne z `/redactions`,
- po restarcie TUI liczby się nie gubią,
- w pliku stanu nie ma żadnej wartości ani maski,
- testy silnika nadal przechodzą.

**Ryzyka:** TUI API może się zmienić między 2.x; wersjonować i degradować do
komendy tekstowej.

### Agent B — załączniki i media

**Cel:** domknąć to, czego `context` nie widzi: pliki dodane do promptu i
metadane mediów.

**Zakres:**
- skanować `name`, `description`, `mention.text` (już częściowo jest),
- dla plików tekstowych: treść, jeśli OpenCode ją udostępnia w prompcie,
- dla PDF/DOCX: opcjonalny ekstraktor tekstu (osobny, jawny krok; bez OCR na
  start),
- dla obrazów: **nie** wysyłać do modelu, jeśli polityka tego zabrania; albo
  zostawić jawnie poza zakresem i opisać,
- test: plik z hasłem w opisie i w treści nie przechodzi.

**Pliki:** `index.ts`, nowy `attachments.ts`, testy.

**Akceptacja:** brak regresji; jeśli funkcja nie jest dostępna w API, agent
zapisuje to w `SECURITY.md` zamiast udawać, że działa.

### Agent C — liczniki per sesja i reset

**Cel:** `/redactions` pokazuje liczby dla **bieżącej sesji**, nie całego
procesu.

**Zakres:**
- przekazać `sessionID` do warstwy liczników (hooki `prompt`/`context`/`tool`
  mają `sessionID`),
- `Map<sessionID, Stats>` z limitem (np. 50 sesji LRU),
- `/redactions reset` czyści bieżącą sesję,
- `statsReport(sessionID)`.

**Pliki:** `stats.ts`, `index.ts`, test `opencode.test.mts`.

**Akceptacja:** dwie sesje mają niezależne liczniki; restart procesu zeruje
liczniki (albo czyta plik z Agenta A).

### Agent D — hooki `model.request` i `http.request`

**Cel:** ostatnia linia obrony przed wysłaniem requestu, niezależna od
`context`.

**Zakres:**
- zbadać, czy `model.request`/`http.request` pozwalają bezpiecznie podmienić
  body,
- jeśli tak: skanować body i nagłówki (bez psucia podpisów),
- jeśli nie: **nie** implementować na siłę; opisać ograniczenie.

**Pliki:** `index.ts`, `SECURITY.md`, testy integracyjne.

**Akceptacja:** test z fałszywym providerem pokazuje, że sekret nie wychodzi;
brak zmian w podpisach providera.

---

## Faza 3 — twardzenie 🟡

### Agent E — macierz zgodności OpenCode

**Cel:** wiedzieć, na jakich wersjach OpenCode plugin działa.

**Zakres:**
- tabela wersji OpenCode vs `@opencode/plugin` vs plugin,
- guard przy starcie: ostrzeżenie, jeśli API hooka nie istnieje,
- CI matrix: 2.0.32 + najnowsza 2.x,
- test ładujący plugin na każdej wersji.

**Pliki:** `package.json`, CI, `README.md`.

**Akceptacja:** CI czerwone przy braku hooka, z czytelnym komunikatem.

### Agent F — fuzz i wydajność

**Cel:** redaktor nie może się wywrócić ani zwolnić na prawdziwych tekstach.

**Zakres:**
- fuzz na losowych bajtach, Unicode, bardzo długich liniach, JSON-ach,
- budżet: 16 MB poniżej 10 s (już jest test),
- test pamięci: 120k unikalnych wartości nie może zjeść RAM-u,
- profilowanie `pl.ts` na tekstach z dużą liczbą etykiet.

**Pliki:** `test/fuzz.test.mts`, `test/perf.test.mts`.

**Akceptacja:** brak wyjątków, czasy w budżecie, brak liniowego wzrostu
kosztu skanu od liczby wartości w sejfie.

### Agent G — audyt bezpieczeństwa

**Cel:** niezależny przegląd granic, nie tylko testów.

**Zakres:**
- przejść `SECURITY.md` punkt po punkcie i sprawdzić, czy kod faktycznie tak
  działa,
- sprawdzić, czy `restore` nie trafia do narzędzi sieciowych,
- sprawdzić, czy `LITERAL` nie da się obejść,
- sprawdzić logi: czy nie zawierają wartości,
- dodać testy na obejścia (np. placeholder w URL, w cookie, w nazwie pliku).

**Pliki:** `SECURITY.md`, `test/security.test.mts`.

**Akceptacja:** każdy punkt ma test albo jawne „nie obejmujemy, bo…”.

---

## Faza 4 — dystrybucja i UX ⬜

### Agent H — paczka npm i instalacja z Git

**Cel:** `opencode plugin add redactor-opencode` zamiast ręcznej ścieżki.

**Zakres:**
- publikacja npm (nazwa do sprawdzenia),
- `opencode plugin add` działa bez lokalnego klona,
- wersjonowanie i changelog,
- instalacja z Git (`github:hubsoapp-beep/tarcza-danych#...`) jako alternatywa,
- dokumentacja dla obu ścieżek.

**Akceptacja:** świeży użytkownik bez repo instaluje jedną komendą.

### Agent I — onboarding i demo OpenCode

**Cel:** osoba nietechniczna ma jeden przycisk „pokaż, że działa”.

**Zakres:**
- `/redact-demo` z ładniejszym wyjściem (tabela PRZED/PO),
- skrypt `scripts/demo-opencode.sh` tworzący tymczasowy projekt z fałszywymi
  danymi,
- zrzuty ekranu TUI (bez prawdziwych danych),
- sekcja „5 minut” w README.

**Akceptacja:** demo działa po `git clone` bez konfiguracji.

### Agent J — polityki i allow/deny

**Cel:** dać użytkownikowi kontrolę bez pisania kodu.

**Zakres:**
- plik polityki (`tarcza.toml`/JSON) z regułami `allow`, `deny`, `kinds`,
- priorytety: `deny` > `allow` > detektor,
- podgląd „co by zostało ukryte” bez wysyłania,
- dokumentacja przykładów.

**Akceptacja:** polityka jest testowana na parze HIDE/KEEP.

---

## Faza 5 — inni agenci 🟡

Macierz możliwości: [docs/AGENCI.md](docs/AGENCI.md).

### Agent K — `@tarcza/core` i daemon

**Cel:** jeden silnik i jedno miejsce stanu zamiast kopii w każdym pluginie.

**Zakres:**
- wydzielić `detect.ts`, `pl.ts`, `scrub.ts`, `vault.ts`, `stats.ts` do
  `packages/core`,
- daemon HTTP na `127.0.0.1`: `/scrub`, `/restore`, `/stats`, `/health`,
- token z `~/.tarcza/token` (0600), żadnych wartości w logach,
- adaptery Claude/OpenCode/Grok importują core; żadnych trzecich kopii.

**Akceptacja:** testy obu pluginów przechodzą bez zmian zachowania; nowy adapter
nie kopiuje detektorów.

### Agent L — Grok Build 🟡 MVP

**Cel:** pełny adapter do oficjalnego `grok` (`xai-org/grok-build`).

**Zrobione:**
- lokalny proxy OpenAI-compatible (`chat_completions`) z redakcją requestu,
- `PreToolUse` restore + blokada znaków powłoki,
- `PostToolUse` scrub wyniku dla modelu,
- wspólny daemon, token, testy.

**Do zrobienia:**
- `responses` i `messages` w proxy,
- redakcja chunków streamu,
- pakiet npm `@tarcza/grok` zamiast importu z `plugins/redactor-opencode`,
- sprawdzić, czy Grok zapisuje prompt przed czy po proxy; jeśli przed —
  opisać ograniczenie albo dodać wrapper,
- pane/liczniki w TUI, jeśli Grok da slot.

**Pliki:** `adapters/grok/*`.

### Agent M — Gemini CLI

**Cel:** pełny parytet bez proxy.

**Zakres:**
- `BeforeModel` → `scrubAll(messages)`,
- `BeforeTool` → `restore(tool_input)` tylko dla lokalnych narzędzi,
- `AfterTool` → scrub/replace `tool_response`,
- `AfterModel` → redakcja chunków odpowiedzi,
- `SessionStart` → sejf,
- Qwen Code po Gemini, jeśli hooki są te same.

**Akceptacja:** testy na fixture'ach hooków; brak regresji w Claude/OpenCode.

### Agent N — generic proxy

**Cel:** jedno proxy dla agentów bez hooków.

**Zakres:**
- OpenAI Chat Completions, Responses, Anthropic Messages, Gemini,
- Codex CLI, Cline/Roo/Kilo, Continue, Aider, Goose, Crush, OpenHands,
- streaming SSE i tool_calls,
- jasny komunikat: „redaction only, bez restore”, jeśli agent nie ma hooka,
- testy na nagranych requestach, bez prawdziwych kluczy.

**Akceptacja:** agent bez hooka nie wysyła sekretu w prompcie; dokument mówi
wprost, czego nie chroni.

## Kolejność i zależności

```
A (panel) ──┬── C (liczniki per sesja)
            └── I (demo/UX)
B (załączniki) ── D (http hooks)
E (macierz) ── H (npm/Git)
F (fuzz) ── G (audyt)
J (polityki) — po G
K (core + daemon) ──┬── L (Grok)
                    ├── M (Gemini / Qwen)
                    └── N (generic proxy: Codex, Cline, Aider, …)
```

Rekomendowana kolejność dla jednego agenta:

1. **K** — core + daemon, żeby nie było czwartej kopii silnika.
2. **M** — Gemini CLI (najpełniejsze hooki, najlepszy parytet).
3. **L** — dokończyć Grok (proxy `responses`/`messages`, streaming).
4. **N** — generic proxy dla Codex/Cline/Aider/Continue.
5. **E** — macierz zgodności i wersje.
6. **C**, **A**, **B** — liczniki, panel, załączniki.
7. **F**, **G**, **H** — fuzz, audyt, publikacja.
8. **I**, **J** — UX i polityki.

## Definition of Done dla każdego agenta

- [ ] testy: `cd plugins/redactor-opencode && npm test` zielone,
- [ ] jeśli zmieniono silnik: `cd plugins/redactor-pl && node --experimental-strip-types test/*.mts` zielone,
- [ ] `tsc --noEmit` dla zmienionych plików,
- [ ] brak prawdziwych danych w diffie,
- [ ] dokumentacja zaktualizowana (`README`, `SECURITY`, ten plik),
- [ ] commit z opisem „co i dlaczego”, bez pushowania bez zgody,
- [ ] jeśli funkcja jest niemożliwa: wpis w `SECURITY.md` zamiast atrapy.

## Szablon przekazania agentowi

```md
Zadanie: <nazwa>
Cel: <jedno zdanie>
Kontekst: <link do docs/JAK-DZIALA.md, sekcja>
Pliki: <lista>
Zakres: <3–6 punktów>
Poza zakresem: <czego nie ruszać>
Akceptacja: <obserwowalne kryteria>
Testy: <komendy>
Ryzyka: <API, wydajność, bezpieczeństwo>
```

## Otwarte pytania

- Czy OpenCode udostępnia treść załączonych plików przed requestem, czy tylko
  ścieżkę? Od tego zależy zakres Agenta B.
- Czy TUI plugin może dostać stan z serwera bez pliku na dysku (RPC/storage)?
  Jeśli tak, Agent A upraszcza się i nie zapisuje nic na dysk.
- Czy `model.request` pozwala podmienić body bez psucia podpisów providera?
  Jeśli nie, zostajemy przy `context` i mówimy to wprost.
- Czy publikować plugin na npm, czy wystarczy instalacja z Git? Decyzja
  produktowa, nie techniczna.
