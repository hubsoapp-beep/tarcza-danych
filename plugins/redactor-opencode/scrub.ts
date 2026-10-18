// One place that says what a scan is. index.ts, the /redact-test command and
// the tests all call it, so what the user is shown is what the model gets.
import { scrubSecrets, scrubPii, type Config } from './detect.ts'
import { scrubPl } from './pl.ts'
import { record } from './stats.ts'

// Everything: keys, then the Polish layer, then email and IP. The Polish layer
// goes before `scrubPii` so a login in `ssh user@10.0.0.1` is read before the
// address is swapped for a placeholder.
export function scrubAll(text: string, cfg: Config): string {
  if (text.length === 0) return text
  const before = text
  let out = text
  if (cfg.secrets) out = scrubSecrets(out, cfg)
  if (cfg.pl) out = scrubPl(out, cfg)
  if (cfg.pii) out = scrubPii(out, cfg)
  record(before, out)
  return out
}

// Text the model needs to work with (AGENTS.md, a changed file): keys and
// passwords only. Emails, IPs, logins, domains and numbers stay readable.
export function scrubQuiet(text: string, cfg: Config): string {
  if (text.length === 0) return text
  const before = text
  let out = text
  if (cfg.secrets) out = scrubSecrets(out, cfg)
  if (cfg.pl && cfg.secrets) out = scrubPl(out, cfg, true)
  record(before, out)
  return out
}
