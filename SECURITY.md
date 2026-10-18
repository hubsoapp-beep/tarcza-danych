# Security policy

## What this tool is

A seat belt, not a vault. It lowers the chance that a password or personal datum reaches an AI
model by mistake. It does not replace good habits: do not paste secrets, do not reuse one password
in many places, rotate any secret that has already been sent.

## Known limits

- Images, screenshots and PDFs are not scanned.
- Old session files in `~/.claude/projects/` and `~/.local/share/opencode/` keep what was sent before the mod was installed.
- `Bash` (Claude Code) and `shell` (OpenCode) get real values back, in any command, including one that sends them to another host.
- `Write`/`Edit` (Claude Code) and `write`/`edit`/`patch` (OpenCode) can write a real value to disk.
- A password typed as a plain word, with no label, passes unless the vault or the glossary knows it.
- Names and addresses in free text are found only through the glossary.
- Loopback and wildcard addresses (`0.0.0.0`, `127.0.0.1`, `::1`, `localhost`) are never hidden. A private address used as a URL host (`http://<ip>:8096`) is kept by default so a local server link stays usable; the same address in prose is still hidden. Set `allowLocalUrls: false` to hide it everywhere.
- The OpenCode port has no pane; counts are available through `/redactions`. OpenCode also does not dispatch plugin slash commands in `opencode run`, only in the TUI.
- OpenCode plugin hooks are the API of a specific OpenCode version. A hook that OpenCode renames or removes stops redacting; keep OpenCode and the plugin in step.

## Reporting a vulnerability

Open a private security advisory on GitHub (Security tab, "Report a vulnerability"), or an issue
without any real secret in it. Never paste a real secret, key or personal datum in a report: use a
made-up value of the same shape.

A report is useful when it shows a value of a kind the tool claims to hide that reaches the model,
or a real value that leaves the machine through the tool.
