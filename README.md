# Tarcza danych

[![ci](https://github.com/hubsoapp-beep/tarcza-danych/actions/workflows/ci.yml/badge.svg)](https://github.com/hubsoapp-beep/tarcza-danych/actions/workflows/ci.yml)
[![licencja: MIT](https://img.shields.io/badge/licencja-MIT-blue.svg)](LICENSE)

Mod do [Claude Code](https://claude.com/claude-code) i [OpenCode](https://opencode.ai), który **ukrywa hasła i dane poufne przed AI**. Zanim tekst trafi do modelu, mod podmienia wartość na placeholder (`[REDACTED-HASLO-1a2b3c4d]`). Model pracuje na placeholderach. Gdy komenda ma się wykonać na Twoim komputerze, mod wraca do prawdziwej wartości.

*English: see [README.en.md](README.en.md).*

Powstał na szkolenie z AI i jest rozwinięciem [`transcript-redactor`](https://github.com/ray-amjad/claude-code-mods) Raya Amjada (MIT) o polskie dane, sejf z notatek i panel.

> **To pas bezpieczeństwa, nie sejf.** Zmniejsza ryzyko pomyłki. Nie zastępuje nawyków: nie wklejaj haseł, nie używaj jednego hasła w wielu miejscach. Lista granic jest w [SECURITY.md](SECURITY.md).

## Jak to wygląda

`/redact-demo` pokazuje fałszywą notatkę serwera przed i po podmianie, a panel „Tarcza danych” liczy, co zostało ukryte (kategorie, maski wartości, źródło). Wszystkie dane na zrzutach są zmyślone.

![Pokaz /redact-demo: tekst przed i po podmianie, pod spodem panel z licznikami](docs/img/demo-przed-po.png)

Panel zaraz po starcie sesji, zanim cokolwiek zostanie ukryte:

![Panel Tarcza danych tuż po starcie](docs/img/panel.png)

## Co ukrywa

- **Klucze i tokeny** (około 70 formatów, JWT, klucze prywatne): silnik upstream.
- **Hasła po polsku i angielsku**: `Hasło:`, `**Password:**`, komórki tabel, backticki, także niskiej entropii („ludzkie”).
- **Dane osobowe PL z sumą kontrolną**: PESEL, NIP, REGON, dowód, IBAN, karta, telefon +48. Losowe numery zostają nietknięte.
- **Infrastruktura**: adresy IP (także lokalne), loginy, domeny, e-maile.
- **Sejf z notatek**: przy starcie sesji mod czyta wskazany folder i ukrywa każde hasło, login i domenę stamtąd wszędzie, także gdy wpiszesz je z pamięci, bez etykiety.
- **Słownik własny**: `KLIENT: Kancelaria Nowak`, `OSOBA: Jan* Kowalsk*` (gwiazdka łapie polskie końcówki).
- **Panel „Tarcza danych”** z licznikami na kategorię i maskami wartości, tryb projektora na czas pokazu.

Pełny opis, ustawienia i różnice względem upstream: [plugins/redactor-pl/README.md](plugins/redactor-pl/README.md).

## Jak działa

Tekst przechodzi przez trzy warstwy: prompt → kontekst sesji → request do modelu. Każda wartość dostaje stabilny placeholder (`[REDACTED-HASLO-1a2b3c4d]`). Przed narzędziem lokalnym placeholder wraca do prawdziwej wartości, a wynik narzędzia jest skanowany ponownie. Ostatnia warstwa (`context`) skanuje **każdy** request, więc nawet tekst z nieznanego źródła nie wychodzi bez sprawdzenia.

Diagram przepływu, mapa plików, detektory, fail-closed i różnice Claude Code vs OpenCode: [docs/JAK-DZIALA.md](docs/JAK-DZIALA.md).

## Instalacja (na każdym komputerze)

Potrzebujesz Claude Code. Dwie komendy:

```
claude plugin marketplace add hubsoapp-beep/tarcza-danych
claude plugin install redactor-pl@tarcza-danych --scope user
```

Albo jednym skryptem:

```
curl -fsSL https://raw.githubusercontent.com/hubsoapp-beep/tarcza-danych/main/scripts/install.sh | sh
```

Zrestartuj Claude Code i wpisz `/redact-demo`. Aktualizacja: `claude plugin marketplace update tarcza-danych`.

> Jeśli używasz `transcript-redactor` albo `redaction-pane`, wyłącz je. Ta wersja zawiera oba i dwa redaktory naraz mogłyby się pokłócić.

## OpenCode

Ta sama tarcza działa też w [OpenCode](https://opencode.ai) 2.0.32+. Silnik redakcji i warstwa polska są te same; różnią się hooki i brakuje panelu (jest licznik `/redactions`).

```sh
git clone https://github.com/hubsoapp-beep/tarcza-danych.git
cd tarcza-danych
./scripts/install-opencode.sh
```

Skrypt dopisuje plugin do `~/.config/opencode/opencode.json`. Ręcznie wygląda to tak:

```jsonc
{
  "plugins": [
    {
      "package": "/pełna/ścieżka/do/tarcza-danych/plugins/redactor-opencode",
      "options": {
        "vaultSources": "~/Notatki/serwery",
        "glossaryFile": "~/.claude/redactor-pl/slownik.txt"
      }
    }
  ]
}
```

Zrestartuj OpenCode. Szczegóły, opcje i ograniczenia: [plugins/redactor-opencode/README.md](plugins/redactor-opencode/README.md).

## Inni agenci

- **Grok Build** — MVP: lokalny proxy + hooki `PreToolUse`/`PostToolUse`:
  [adapters/grok/README.md](adapters/grok/README.md).
- **Gemini CLI / Qwen Code** — następne, najlepsze hooki do pełnego parytetu.
- **Codex CLI / Cline / Aider / Continue** — generic proxy, redaction only.

Macierz możliwości i różnice: [docs/AGENCI.md](docs/AGENCI.md). Kolejność:
[ROADMAP.md](ROADMAP.md).

## Komendy (Claude Code)

| Komenda | Co robi |
| --- | --- |
| `/redact-demo` | Fałszywa notatka serwera przed i po podmianie. Do pokazu. |
| `/redact-test <tekst>` | Sprawdza, co zobaczy AI, bez wysyłania. |
| `/redactions` | Otwiera panel. `projector on` / `projector off` chowa i pokazuje maski. |

W OpenCode te same trzy komendy działają w TUI; `/redactions` pokazuje licznik zamiast panelu. `opencode run` nie dispatchuje komend pluginów.

## Dane prywatne zostają u Ciebie

W repozytorium nie ma żadnych prawdziwych danych. Twoje notatki (sejf) i słownik czyta mod lokalnie, z miejsc, które sam wskażesz: `/plugin configure redactor-pl@tarcza-danych` w Claude Code, opcje `vaultSources` i `glossaryFile` w `opencode.json` w OpenCode. Słownik trzymaj w `~/.claude/redactor-pl/slownik.txt`, poza repozytorium. Wzór: [plugins/redactor-pl/slownik.example.txt](plugins/redactor-pl/slownik.example.txt). Wartości z notatek żyją tylko w pamięci procesu i nie trafiają na dysk ani do logów.

## Rozwój

Zasady i uruchamianie testów: [CONTRIBUTING.md](CONTRIBUTING.md). Zmiany: [CHANGELOG.md](CHANGELOG.md).

## Roadmapa

Co dalej, w podziale na agentów i z kryteriami akceptacji: [ROADMAP.md](ROADMAP.md). Najbliższe zadania to panel TUI, liczniki per sesja, załączniki, macierz zgodności OpenCode, fuzz/audyt i publikacja npm.

## Licencja

MIT, © 2026 Miłosz Zając. Część kodu pochodzi z `transcript-redactor` (MIT, © 2026 Ray Amjad), patrz [NOTICE.md](NOTICE.md).
