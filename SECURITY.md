# Security policy

## What this tool is

A seat belt, not a vault. It lowers the chance that a password or personal datum reaches an AI
model by mistake. It does not replace good habits: do not paste secrets, do not reuse one password
in many places, rotate any secret that has already been sent.

## Known limits

- Images, screenshots and PDFs are not scanned.
- Old session files in `~/.claude/projects/` keep what was sent before the mod was installed.
- `Bash` gets real values back, in any command, including one that sends them to another host.
- `Write` and `Edit` can write a real value to disk.
- A password typed as a plain word, with no label, passes unless the vault or the glossary knows it.
- Names and addresses in free text are found only through the glossary.

## Reporting a vulnerability

Open a private security advisory on GitHub (Security tab, "Report a vulnerability"), or an issue
without any real secret in it. Never paste a real secret, key or personal datum in a report: use a
made-up value of the same shape.

A report is useful when it shows a value of a kind the tool claims to hide that reaches the model,
or a real value that leaves the machine through the tool.
