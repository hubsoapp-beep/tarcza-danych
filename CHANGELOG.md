# Changelog

## 0.2.1

Fix for local server links.

- `0.0.0.0`, `127.0.0.1`, `::1` and `localhost` are never hidden: they are bind
  and loopback addresses, not infrastructure secrets.
- A private IP used as a URL host (`http://<ip>:8096`) stays readable by default
  (`allowLocalUrls: true`), so the model can give a link that works. The same IP
  in prose is still hidden; set `allowLocalUrls: false` to hide it everywhere.
- New option in `plugins/redactor-pl/.claude-plugin/plugin.json` and
  `plugins/redactor-opencode/config.ts`; tests in both plugins.
- The failure mode was: a bind address was hidden, the tool output turned the
  placeholder into `LITERAL`, and the model repeated `http://[REDACTED-LITERAL-…]:8096`.

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
- Local server links stay usable: `0.0.0.0`, `127.0.0.1`, `::1` and `localhost`
  are never hidden; a private IP as a URL host is kept by default
  (`allowLocalUrls`), while the same IP in prose is still hidden.

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
