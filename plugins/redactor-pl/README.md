# redactor-pl (Tarcza danych)

Mod do Claude Code. Zanim tekst trafi do AI, podmienia hasła, klucze, dane osobowe i dane serwerów na placeholdery `[REDACTED-HASLO-1a2b3c4d]`. AI pracuje na placeholderach. Gdy komenda ma się wykonać na twoim komputerze, mod wraca do prawdziwej wartości.

Powstał na szkolenie z AI. To fork [`transcript-redactor` 0.4.1](https://github.com/ray-amjad/claude-code-mods) (Ray Amjad, licencja MIT, patrz `LICENSE.upstream`) z warstwą polską, sejfem z notatek i panelem.

## Instalacja

```
claude plugin marketplace add hubsoapp-beep/tarcza-danych
claude plugin install redactor-pl@tarcza-danych --scope user
```

Wyłącz `transcript-redactor` i stary `redaction-pane`: ta wersja zawiera oba. Po edycji plików: `/reload-plugins`.

## Co mod ukrywa

| Kategoria | Przykład | Jak wykrywa |
| --- | --- | --- |
| Klucze (`SECRET`) | `sk_live_…`, `ghp_…`, tokeny, JWT, klucze prywatne | silnik upstream: ok. 70 formatów, entropia, nazwa pola |
| Hasła (`HASLO`) | `Hasło: …`, `**Password:** …`, komórka tabeli, hasło w backtickach | etykieta PL lub EN, niezależnie od entropii |
| PESEL | `85071420489` | 11 cyfr, suma kontrolna i data |
| NIP, REGON | `525-224-84-81` | suma kontrolna, etykieta albo format z myślnikami |
| Dowód | `ABC 123456` | suma kontrolna, etykieta „dowód/seria” |
| Konto (`IBAN`) | `PL61 1090 …` | mod 97 |
| Karta | `4111 1111 1111 1111` | Luhn i format |
| Telefon | `+48 601 234 567` | formaty PL i międzynarodowe |
| E-mail, IP | `jan@firma.pl`, `10.0.0.5` | silnik upstream, włączone domyślnie, razem z IP z sieci lokalnej |
| Login | `Użytkownik: …`, `ssh user@host`, `--user=…`, nazwa bazy | etykieta lub wzorzec komendy |
| Domena | `Domena: firma.pl`, `--domain=…` | tylko po etykiecie, znane TLD |
| Klient, osoba | wpisy ze słownika | słownik `KLIENT: …`, `OSOBA: …` |

Wartość, którą mod raz ukryje po etykiecie, jest ukrywana wszędzie dalej w sesji, także bez etykiety.

## Sejf z notatek

W ustawieniu `vaultSources` podajesz pliki i foldery (po przecinku). Przy starcie sesji mod czyta je i zapamiętuje każde hasło, login i domenę. Od tej chwili ta wartość nie dojdzie do AI, nawet gdy wpiszesz ją z pamięci bez etykiety. Wartości zostają w pamięci procesu. Nic nie jest zapisywane ani logowane, mod pokazuje tylko liczby.

## Słownik

Plik `~/.claude/redactor-pl/slownik.txt`, wzór w `slownik.example.txt`. Gwiazdka po słowie zastępuje końcówkę fleksyjną (`Kowalsk*`). Dwie odmiany nazwiska to dwie wartości i dwa placeholdery. Wpisz obie odmiany albo użyj gwiazdki.

## Komendy

- `/redactions`: panel „Tarcza danych”. Nagłówek podaje, ile wartości ukryto, i rozbija je na kategorie (kolorowy pasek i liczba). Niżej leży lista, od najnowszej: kategoria, maska (dwa pierwsze znaki), liczba powtórzeń, godzina, źródło (Twoja wiadomość, narzędzie, kontekst, załącznik) i oczyszczony fragment tekstu z zakrytą wartością. `/redactions projector on` chowa maski na czas pokazu, `projector off` je przywraca.
- `/redact-demo`: fałszywa notatka serwera przed i po podmianie. Bezpieczna na ekran, bez wysyłania do AI.
- `/redact-test <tekst>`: pokazuje, co zobaczy AI, bez wysyłania.

Fałszywa notatka do wklejenia w prompt: `node --experimental-strip-types test/demo-serwery.mts > /tmp/demo-serwer.md`.

## Ustawienia

`/plugin configure redactor-pl@tarcza-danych`. Najważniejsze:

| Opcja | Domyślnie | Co robi |
| --- | --- | --- |
| `pl` | tak | cała warstwa polska |
| `personalData` | tak | PESEL, NIP, REGON, dowód, IBAN, karta, telefon |
| `infrastructure`, `logins`, `domains` | tak | loginy i domeny |
| `pii` | tak | e-maile i adresy IP |
| `redactPrivateIps` | tak | także IP z sieci lokalnej |
| `vaultSources` | puste | notatki do nauki przy starcie |
| `glossaryFile` | `~/.claude/redactor-pl/slownik.txt` | słownik |
| `restoreTools` | `Bash,Write,Edit,MultiEdit,NotebookEdit` | narzędzia, które dostają prawdziwe wartości |

Pozostałe opcje (`minEntropy`, `allow`, `allowEmails` i inne) działają jak w upstream.

## Prawdziwe wartości wracają tylko lokalnie

Placeholdery `SECRET`, `HASLO`, `IP`, `LOGIN` i `DOMENA` wracają do prawdziwej wartości w `Bash`, `Write` i `Edit`, więc `ssh [LOGIN]@[IP]` działa. PESEL, telefon, karta, konto i klient zostają placeholderem. Narzędzia, które wysyłają dane dalej (`WebFetch`, MCP, subagent), dostają zawsze placeholder.

## Czego mod nie robi

- **Obrazy, zrzuty ekranu i PDF nie są skanowane.** Hasło widoczne na screenie dojdzie do AI.
- **Nie czyści starych sesji.** `~/.claude/projects/*.jsonl` trzyma wszystko, co weszło do rozmowy przed instalacją moda.
- **`Bash` przywraca wartości w dowolnej komendzie**, także w `curl` na obcy host. Usuń `Bash` z `restoreTools`, jeśli tego nie chcesz.
- **`Write` i `Edit` zapisują prawdziwą wartość na dysk**, jeśli model wstawi placeholder do pliku. Plik w git trzyma wtedy hasło.
- **Hasło bez etykiety i bez kształtu klucza** (zwykłe słowo w zdaniu) przejdzie, chyba że jest w sejfie albo w słowniku.
- **Ścieżki `/Users/<nazwa>` zostają.** Narzędzia `Read` i `Grep` nie dostają prawdziwych wartości, więc ukryta ścieżka przestałaby działać.
- **Adresy (ulica, miasto) i imiona w zwykłym tekście** wykrywa tylko słownik.
- To pas bezpieczeństwa, nie sejf. Model, który chce wyciec wartość, może ją przekształcić komendą (`base64`, `rev`).

## Różnice względem upstream

Wszystkie zmiany są oznaczone w kodzie słowem `redactor-pl`.

- `hooks/detect.ts`: nowe rodzaje placeholderów, `HASLO` liczy się jak `SECRET`, nowe przełączniki, `valueOf()`.
- `hooks/redact.ts`: skan przez `scrubAll()`, sejf przy starcie, raporty do panelu, wracanie IP/loginów/domen do komend.
- **Naprawa błędu:** komenda zakończona błędem, której wynik zawiera sekret, kończyła się komunikatem `tool.call step resolved Bash with a result that does not match its output shape`. Przyczyna (wniosek z typów silnika): wynik błędu to string, a silnik sprawdza przepisany wynik ze schematem Basha (obiektem). Teraz mod zwraca ukryty tekst błędu jako `deny`, a model dalej czyta wynik komendy z placeholderami.
- Nowe pliki: `pl.ts`, `scrub.ts`, `vault.ts`, `ledger.ts`, `pane.tsx`, `demo.ts`, `main.tsx`.

## Testy

```
node --experimental-strip-types test/pl.test.mts          # warstwa polska: 35 do ukrycia, 31 do zostawienia
node --experimental-strip-types test/detect.test.mts      # upstream: 174 do ukrycia, 114 do zostawienia
node --experimental-strip-types test/random-tags.test.mts
node --experimental-strip-types test/session-privacy.test.mts
node --experimental-strip-types test/pii-options.test.mts
claude plugin test .                                      # hooki, 41 testów
claude plugin validate .
```

Wszystkie numery z sumą kontrolną w testach i w demo są generowane w locie z fałszywych danych. W repozytorium nie ma prawdziwego PESEL-a, NIP-u ani karty. Wersja 0.1.0, 2026-10-16.
