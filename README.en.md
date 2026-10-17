# Tarcza danych ("Data Shield")

A [Claude Code](https://claude.com/claude-code) mod that **hides passwords and confidential data from the AI**. Before text reaches the model, the mod swaps each value for a placeholder (`[REDACTED-HASLO-1a2b3c4d]`). The model works on placeholders. When a command has to run on your machine, the mod puts the real value back.

It extends Ray Amjad's [`transcript-redactor`](https://github.com/ray-amjad/claude-code-mods) (MIT) with Polish data formats, a vault that learns from your notes, and a pane. Most labels and docs are in Polish, because it was built for a Polish training course.

> **A seat belt, not a vault.** See [SECURITY.md](SECURITY.md) for the known limits.

## Install

```
claude plugin marketplace add hubsoapp-beep/tarcza-danych
claude plugin install redactor-pl@tarcza-danych --scope user
```

Restart Claude Code and run `/redact-demo`.

## What it hides

Vendor keys and tokens (about 70 formats), passwords after Polish or English labels (including low-entropy ones), Polish personal data with checksums (PESEL, NIP, REGON, ID card, IBAN, card, phone), IP addresses, logins, domains, emails, a glossary of your own clients and people, and every password, login and domain found in notes you point it at.

## License

MIT, © 2026 Miłosz Zając. Contains code from `transcript-redactor` (MIT, © 2026 Ray Amjad). See [NOTICE.md](NOTICE.md).
