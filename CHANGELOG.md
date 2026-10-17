# Changelog

## 0.1.0

First public release. Fork of transcript-redactor 0.4.1.

- Polish and English password labels, including Markdown bold, tables and backticks.
- Polish personal data with checksums: PESEL, NIP, REGON, ID card, IBAN, card (Luhn), phone.
- Infrastructure: IP addresses, logins, domains.
- Vault: reads chosen notes at session start and hides every password, login and domain found there.
- Glossary file with inflection (`Kowalsk*`).
- Pane "Tarcza danych" with counts per category and masked values, projector mode.
- Commands `/redactions`, `/redact-demo`, `/redact-test`.
- Fix: a command that exits non-zero and prints a secret no longer fails with `output shape`.
