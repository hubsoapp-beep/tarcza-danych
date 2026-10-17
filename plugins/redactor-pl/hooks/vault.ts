// The vault from notes. At session start the mod reads the files and folders
// the user named (`vaultSources`) and the glossary, and remembers every
// password, login and domain in them. From then on a value taken from a note is
// hidden wherever it turns up, labelled or bare, in a prompt or in a tool result.
//
// The values stay in this process's memory. Nothing is written, and nothing
// is logged: the report holds counts only.
import { scrubSecrets, type Config } from './detect.ts'
import { learnFrom, loadGlossary } from './pl.ts'

const TEXT_FILE = /\.(?:md|markdown|txt|sh|bash|zsh|env|json|ya?ml|toml|ini|conf|cfg|js|mjs|ts|py|php)$/i
const SKIP_DIR = /^(?:\.|node_modules$|dist$|build$|vendor$)/
const MAX_FILES = 300
const MAX_DEPTH = 3
const MAX_CHARS = 1_000_000

export type VaultReport = { files: number; values: number; glossary: number; skipped: number }

const split = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : []

// `$` is passed whole and each call is spelled out on it (`$.fs.read(...)`):
// the engine checks the call sites, not a `$.fs` handed around as a value.
async function expand($: any, p: string): Promise<string> {
  if (p !== '~' && !p.startsWith('~/')) return p
  const home = await $.env.get('HOME')
  return home ? home + p.slice(1) : p
}

async function gather($: any, path: string, out: string[], depth: number): Promise<void> {
  if (out.length >= MAX_FILES) return
  let entries: { name: string; kind: string }[] | null = null
  try {
    entries = await $.fs.list(path)
  } catch {
    // not a directory: a file, or missing
  }
  if (!entries) {
    out.push(path)
    return
  }
  if (depth > MAX_DEPTH) return
  for (const e of entries) {
    if (out.length >= MAX_FILES) return
    const child = path.replace(/\/$/, '') + '/' + e.name
    if (e.kind === 'dir' && !SKIP_DIR.test(e.name)) await gather($, child, out, depth + 1)
    else if (e.kind === 'file' && TEXT_FILE.test(e.name) && !e.name.startsWith('.')) out.push(child)
  }
}

export async function loadVault($: any, cfg: Config, options: Record<string, unknown>): Promise<VaultReport> {
  const report: VaultReport = { files: 0, values: 0, glossary: 0, skipped: 0 }

  const glossaryPath = await expand($, String(options.glossaryFile || '~/.claude/redactor-pl/slownik.txt'))
  try {
    if (await $.fs.exists(glossaryPath)) report.glossary = loadGlossary(String(await $.fs.read(glossaryPath)))
  } catch {
    report.skipped++
  }

  const files: string[] = []
  for (const source of split(options.vaultSources)) await gather($, await expand($, source), files, 0)

  for (const file of files) {
    try {
      const text = await $.fs.read(file)
      if (typeof text !== 'string' || text.length > MAX_CHARS || text.includes('\u0000')) {
        report.skipped++
        continue
      }
      scrubSecrets(text, cfg)
      report.values += learnFrom(text, cfg)
      report.files++
    } catch {
      report.skipped++
    }
  }
  return report
}
