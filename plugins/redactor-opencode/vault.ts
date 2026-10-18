// Vault from notes, ported to OpenCode (node fs). Values stay in memory.
import { scrubSecrets, type Config } from './detect.ts'
import { learnFrom, loadGlossary } from './pl.ts'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const TEXT_FILE = /\.(?:md|markdown|txt|sh|bash|zsh|env|json|ya?ml|toml|ini|conf|cfg|js|mjs|ts|py|php)$/i
const SKIP_DIR = /^(?:\.|node_modules$|dist$|build$|vendor$)/
const MAX_FILES = 300
const MAX_DEPTH = 3
const MAX_CHARS = 1_000_000

export type VaultReport = { files: number; values: number; glossary: number; skipped: number }

function split(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : []
}

function expand(p: string): string {
  if (p === '~') return os.homedir()
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2))
  return p
}

async function gather(dirPath: string, out: string[], depth: number): Promise<void> {
  if (out.length >= MAX_FILES) return
  let entries: import('node:fs').Dirent[] | null = null
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true })
  } catch {
    // not a directory: a file, or missing
  }
  if (!entries) {
    out.push(dirPath)
    return
  }
  if (depth > MAX_DEPTH) return
  for (const e of entries) {
    if (out.length >= MAX_FILES) return
    const child = path.join(dirPath, e.name)
    if (e.isDirectory() && !SKIP_DIR.test(e.name)) await gather(child, out, depth + 1)
    else if (e.isFile() && TEXT_FILE.test(e.name) && !e.name.startsWith('.')) out.push(child)
  }
}

export async function loadVault(cfg: Config, options: Record<string, unknown>): Promise<VaultReport> {
  const report: VaultReport = { files: 0, values: 0, glossary: 0, skipped: 0 }

  const glossaryPath = expand(String(options.glossaryFile || '~/.claude/redactor-pl/slownik.txt'))
  try {
    if (await exists(glossaryPath)) {
      const text = await fs.readFile(glossaryPath, 'utf8')
      report.glossary = loadGlossary(text)
    }
  } catch {
    report.skipped++
  }

  const files: string[] = []
  for (const source of split(options.vaultSources)) await gather(expand(source), files, 0)

  for (const file of files) {
    try {
      const text = await fs.readFile(file, 'utf8')
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

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}