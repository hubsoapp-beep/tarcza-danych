# Notice

Tarcza danych (`redactor-pl`) is a fork of **transcript-redactor 0.4.1** by Ray Amjad,
from <https://github.com/ray-amjad/claude-code-mods>, used under the MIT license.
The original copyright notice is kept in `plugins/redactor-pl/LICENSE.upstream`.

What comes from upstream: the detection engine in `hooks/detect.ts` (vendor key formats,
entropy, placeholders) and the hook structure in `hooks/redact.ts`.

What was added here: the Polish layer (`hooks/pl.ts`), the vault that learns from notes
(`hooks/vault.ts`), the glossary, the pane and commands (`hooks/pane.tsx`, `hooks/ledger.ts`),
the fix for the errored-command result shape, and the tests for them.
