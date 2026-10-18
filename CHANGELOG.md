# Changelog

Wersje dotyczą całego repozytorium; w nagłówku podano wersje obu pluginów.

## 0.2.2 — 2026-10-18

OpenCode `0.2.2` · Claude Code `0.1.2`

`allow` działa teraz wszędzie, nie tylko w silniku sekretów.

- `allow`, `allowPrefixes` i `allowEmails` są nadrzędne wobec warstwy polskiej:
  haseł, loginów, domen, numerów, słownika i wartości nauczonych z notatek.
  Wcześniej wartość oznaczona jako publiczna mogła nadal zostać podmieniona na
  `HASLO`, `DOMENA` albo `LOGIN`.
- Domena ze słownika wewnątrz dozwolonego adresu (`jan@example.com`) zostaje,
  gdy adres jest dozwolony przez `allowEmails` albo `allow`.
- Dozwolona wartość nie jest uczona z sejfu, więc później nie wraca jako ukryta.
- Testy: `plugins/redactor-opencode/test/allow.test.mts` oraz
  `plugins/redactor-pl/test/allow.test.mts`.

## 0.2.1 — 2026-10-18

OpenCode `0.2.1` · Claude Code `0.1.1`

Lokalne linki do serwera są użyteczne.

- `0.0.0.0`, `127.0.0.1`, `::1` i `localhost` nigdy nie są ukrywane: to adresy
  bind/loopback, nie sekrety infrastruktury.
- Prywatny IP użyty jako host URL-a (`http://<ip>:8096`) zostaje domyślnie
  widoczny (`allowLocalUrls: true`), żeby link dało się otworzyć. Ten sam IP w
  prozie nadal jest ukrywany; `allowLocalUrls: false` ukrywa go wszędzie.
- Nowa opcja w `plugins/redactor-pl/.claude-plugin/plugin.json` i
  `plugins/redactor-opencode/config.ts`.
- Testy `local-urls` w obu pluginach.
- Naprawiany tryb awarii: adres bind był ukrywany, wynik narzędzia zamieniał
  placeholder na `LITERAL`, a model powtarzał
  `http://[REDACTED-LITERAL-…]:8096`.

## 0.2.0 — 2026-10-18

OpenCode `0.2.0` · Claude Code `0.1.0` (bez zmian)

Port Tarczy danych na OpenCode.

- `plugins/redactor-opencode`: ten sam silnik detekcji i warstwa polska co
  `redactor-pl`, podpięte do hooków OpenCode 2.0.32+: prompt, context,
  compaction, generate, title, tool `execute.before` / `execute.after`.
- Narzędzia lokalne (`shell`, `write`, `edit`, `patch`) dostają prawdziwe
  wartości; ich wynik jest skanowany ponownie, także wartości przekazane w tym
  wywołaniu.
- Sejf z notatek i słownik działają w OpenCode. Wartości zostają w pamięci.
- Komendy w TUI: `/redact-demo`, `/redact-test`, `/redactions` (liczniki wg
  kategorii).
- Fail-closed: błąd skanu albo przekroczenie budżetu wstrzymuje tekst zamiast
  przepuszczać oryginał.
- Wspólne testy silnika oraz `test/opencode.test.mts` dla podpięcia OpenCode.
- `scripts/install-opencode.sh` dopisuje plugin do
  `~/.config/opencode/opencode.json`.
- Dokumentacja: `docs/JAK-DZIALA.md` (przepływ, hooki, fail-closed, mapa
  plików) i `ROADMAP.md` (kolejni agenci, kryteria akceptacji).

## 0.1.0 — 2026-10-17

Claude Code `0.1.0`

Pierwsze publiczne wydanie. Fork transcript-redactor 0.4.1.

- Polskie i angielskie etykiety haseł, w tym Markdown bold, tabele i backticki.
- Polskie dane osobowe z sumami kontrolnymi: PESEL, NIP, REGON, dowód, IBAN,
  karta (Luhn), telefon.
- Infrastruktura: adresy IP, loginy, domeny.
- Sejf: czyta wybrane notatki przy starcie sesji i ukrywa każde hasło, login i
  domenę znalezione w notatkach.
- Słownik z odmianą (`Kowalsk*`).
- Panel „Tarcza danych” z licznikami na kategorię, maskami wartości i trybem
  projektora.
- Komendy `/redactions`, `/redact-demo`, `/redact-test`.
- Poprawka: komenda, która kończy się błędem i wypisuje sekret, nie wywraca się
  już na kształcie wyniku.
