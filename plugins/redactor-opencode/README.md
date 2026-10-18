# redactor-opencode

Tarcza danych dla [OpenCode](https://opencode.ai): zanim tekst trafi do modelu,
hasła, klucze, dane osobowe i infrastruktura są podmieniane na placeholdery
(`[REDACTED-HASLO-1a2b3c4d]`). Model pracuje na placeholderach. Gdy narzędzie
ma wykonać się na Twoim komputerze (`shell`, `write`, `edit`, `patch`), plugin
wstawia prawdziwą wartość z powrotem.

To port [`redactor-pl`](../redactor-pl/README.md) z Claude Code. Silnik
redakcji (`detect.ts`, `pl.ts`) jest ten sam. Różnią się hooki, bo OpenCode ma
inny system pluginów.

Jak to działa (diagram, hooki, fail-closed): [docs/JAK-DZIALA.md](../../docs/JAK-DZIALA.md).
Co dalej: [ROADMAP.md](../../ROADMAP.md).

> **To pas bezpieczeństwa, nie sejf.** Zmniejsza ryzyko pomyłki. Nie zastępuje
> nawyków: nie wklejaj haseł, nie używaj jednego hasła w wielu miejscach.
> Granice opisuje [SECURITY.md](../../SECURITY.md).

## Co robi

- **Prompt i kontekst:** skanuje wiadomość użytkownika, wiadomości w kontekście,
  wyniki narzędzi, streszczenia kompaktowania i tytuły sesji. Ostatnia warstwa
  (`context`) skanuje każdy request do modelu, więc nawet tekst z nieznanego
  źródła nie wychodzi bez sprawdzenia.
- **Narzędzia lokalne:** przed `shell`, `write`, `edit`, `patch` zamienia
  placeholder na prawdziwą wartość. Po wykonaniu ponownie ukrywa to, co
  narzędzie wypisało, także wartości zbyt krótkie dla detektorów.
- **Sejf z notatek:** przy starcie sesji czyta wskazane pliki i foldery. Każde
  hasło, login i domena z notatek są ukrywane w sesji, także wpisane bez etykiety.
- **Słownik:** `KLIENT: Kancelaria Nowak`, `OSOBA: Jan* Kowalsk*` (gwiazdka
  łapie polskie końcówki).
- **Dane PL z sumą kontrolną:** PESEL, NIP, REGON, dowód, IBAN, karta (Luhn),
  telefon. Losowe numery zostają.
- **Liczniki:** `/redactions` pokazuje, ile wartości ukryto, w podziale na
  kategorie. Wartości nie są zapisywane.

## Instalacja

Wymagany OpenCode 2.0.32 lub nowszy. Plugin jest częścią repozytorium
`tarcza-danych`, więc najpierw pobierz repo:

```sh
git clone https://github.com/hubsoapp-beep/tarcza-danych.git
cd tarcza-danych
```

`opencode plugin add` przyjmuje tylko paczki z npm albo Git, nie ścieżkę lokalną.
Dopisz plugin do globalnego `~/.config/opencode/opencode.json`:

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

Albo uruchom skrypt, który robi to samo:

```sh
./scripts/install-opencode.sh
```

Zrestartuj OpenCode. W TUI wpisz `/redact-demo`, żeby zobaczyć podmianę, i
`/redactions`, żeby zobaczyć licznik.

### Tylko dla jednego projektu

Ten sam wpis możesz położyć w `opencode.json` w katalogu projektu. Wtedy plugin
działa tylko tam.

## Komendy (TUI)

| Komenda | Co robi |
| --- | --- |
| `/redact-demo` | Fałszywa notatka serwera przed i po podmianie. |
| `/redact-test <tekst>` | Pokazuje, co zobaczy AI, bez wysyłania. |
| `/redactions` | Licznik ukrytych wartości od startu OpenCode, według kategorii. |

`opencode run` nie dispatchuje komend pluginów: traktuje `/redact-test` jak
zwykły tekst i wysyła go do modelu. Komendy działają w TUI. Redakcja promptów,
kontekstu i narzędzi działa w obu trybach.

## Opcje

Wszystkie opcje są opcjonalne. Domyślne wartości są takie jak w `redactor-pl`.

| Opcja | Domyślnie | Znaczenie |
| --- | --- | --- |
| `secrets` | `true` | Klucze, tokeny, JWT, klucze prywatne, entropia. |
| `pii` | `true` | E-maile i adresy IP. |
| `hideEmails` | `true` | Z `pii`: ukrywaj też e-maile. |
| `redactPrivateIps` | `true` | Ukrywaj też IP z sieci lokalnej. |
| `allowLocalUrls` | `true` | Nie ukrywaj prywatnego IP, gdy jest hostem URL-a (`http://<ip>:8096`). Sam adres w prozie nadal jest ukrywany. `0.0.0.0`, `127.0.0.1`, `::1` i `localhost` są zawsze zostawiane. |
| `restoreInToolInputs` | `true` | Wstawiaj prawdziwe wartości do narzędzi lokalnych. |
| `restoreTools` | `shell,write,edit,patch` | Narzędzia, które dostają prawdziwą wartość. Nie dopisuj narzędzi wysyłających dane do sieci. |
| `notify` | `true` | Log przy starcie sejfu i przy ukryciu wartości. |
| `minEntropy` | `3.6` | Próg entropii dla tokenów. |
| `minLength` | `24` | Najkrótszy token objęty testem entropii. |
| `contextMinEntropy` | `3` | Próg obok nazwy klucza (`API_KEY=`, `Bearer`). |
| `allow` | `""` | Wartości, których nie ukrywać (po przecinku). |
| `allowEmails` | `""` | Adresy albo domeny (`@example.com`) do pozostawienia. |
| `allowPrefixes` | `""` | Prefiksy tokenów uznawanych za publiczne. |
| `denyPrefixes` | `""` | Prefiksy, które mimo wyglądu mają przejść test entropii. |
| `pl` | `true` | Cała warstwa polska. |
| `personalData` | `true` | PESEL, NIP, REGON, dowód, IBAN, karta, telefon. |
| `infrastructure` | `true` | Loginy i domeny po etykiecie. |
| `domains` | `true` | Domeny. |
| `logins` | `true` | Loginy. |
| `vaultSources` | `""` | Pliki i foldery oddzielone przecinkami. |
| `glossaryFile` | `~/.claude/redactor-pl/slownik.txt` | Słownik. |

## Ograniczenia

- **Obrazy, zrzuty ekranu i PDF-y nie są skanowane.** OpenCode przekazuje je
  jako media, nie jako tekst.
- **Nie ma panelu.** OpenCode nie ma odpowiednika panelu Claude Code; liczniki
  są w `/redactions`.
- **`shell` dostaje prawdziwe wartości**, w każdym poleceniu, także takim, które
  wysyła je na inny host. `write` i `edit` mogą zapisać prawdziwą wartość na dysk.
- **Wartość z powłoką nie trafi do shella.** Jeśli prawdziwa wartość zawiera
  spację, cudzysłów, `$`, `;` itp., plugin odmawia wstawienia jej do polecenia.
  Zapisz ją do pliku narzędziem `write` i pozwól poleceniu przeczytać plik.
- **Historia sesji** w `~/.local/share/opencode` zachowuje to, co zostało
  wysłane przed instalacją pluginu.
- **Hasło bez etykiety i bez wpisu w sejfie** przejdzie, jeśli nie wygląda jak
  sekret.
- **Reasoning** modelu nie jest przepisywany: provider może podpisywać te bloki.
  Model nigdy nie widział prawdziwej wartości, więc nie ma jej tam z definicji.

## Testy

```sh
cd plugins/redactor-opencode
npm install
CI=1 npm test
```

Testy silnika (`detect`, `pl`, `random-tags`, `session-privacy`, `pii-options`) są wspólne z `redactor-pl`. `test/vault.test.mts` sprawdza sejf, słownik i wartości bez etykiet. `test/opencode.test.mts` sprawdza podpięcie hooków: prompt, kontekst, restore, wynik narzędzia, komendy i domyślne opcje.

## Licencja

MIT, © 2026 Miłosz Zając. Silnik pochodzi z `transcript-redactor` (MIT, © 2026
Ray Amjad); patrz [NOTICE.md](../../NOTICE.md).
