// The defaults are the ones in redactor-pl's plugin.json, not the older
// makeConfig() fallbacks. A plugin option the user leaves out must behave the
// same way it does in Claude Code.
export const DEFAULT_OPTIONS = {
  secrets: true,
  pii: true,
  hideEmails: true,
  redactPrivateIps: true,
  restoreInToolInputs: true,
  restoreTools: 'shell,write,edit,patch',
  notify: true,
  minEntropy: 3.6,
  minLength: 24,
  contextMinEntropy: 3,
  allow: '',
  allowEmails: '',
  allowPrefixes: '',
  denyPrefixes: '',
  pl: true,
  personalData: true,
  infrastructure: true,
  domains: true,
  logins: true,
  vaultSources: '',
  glossaryFile: '~/.claude/redactor-pl/slownik.txt',
} as const

export type Options = Record<string, unknown>

// Explicit `undefined` from a JSON config or a caller must not erase a default.
export function pluginOptions(options: Options | undefined): Options {
  const out: Options = { ...DEFAULT_OPTIONS }
  for (const [key, value] of Object.entries(options ?? {})) if (value !== undefined) out[key] = value
  return out
}
