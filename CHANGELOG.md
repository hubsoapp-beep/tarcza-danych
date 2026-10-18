# Changelog

## 0.2.0

OpenCode port.

- `plugins/redactor-opencode`: the same detection engine and Polish layer as `redactor-pl`,
  wired to OpenCode 2.0.32+ hooks: prompt, context, compaction, generate, title,
  tool `execute.before` / `execute.after`.
- Local tools (`shell`, `write`, `edit`, `patch`) get real values back; their output is
  scrubbed again, including values this call was handed.
- Vault from notes and the glossary work in OpenCode. Values stay in memory.
- Commands in the TUI: `/redact-demo`, `/redact-test`, `/redactions` (counts per category).
- Fail closed: a scan that fails or runs past its budget withholds the text instead of
  passing it on.
- Shared engine tests plus `test/opencode.test.mts` for the OpenCode wiring.
- `scripts/install-opencode.sh` adds the plugin to `~/.config/opencode/opencode.json`.
- `docs/JAK-DZIALA.md` (flow, hooks, fail-closed, file map) and `ROADMAP.md`
  (next tasks with agent briefs and acceptance criteria).

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
