// Counters for /redactions. Only placeholders are stored: never a value, never
// a masked preview that could be turned back into one. One tag is one value,
// however many times it was hidden.
export type Stat = { kind: string; count: number; hits: number }

const TAG = /\[REDACTED-([A-Z]+)-[0-9a-f]{8}\]/g

export const LABELS: Record<string, string> = {
  SECRET: 'Klucze API',
  HASLO: 'Hasła',
  EMAIL: 'E-maile',
  IP: 'Adresy IP',
  PESEL: 'PESEL',
  NIP: 'NIP',
  REGON: 'REGON',
  DOWOD: 'Dowody',
  IBAN: 'Konta',
  KARTA: 'Karty',
  TEL: 'Telefony',
  LOGIN: 'Loginy',
  DOMENA: 'Domeny',
  KLIENT: 'Klienci',
  OSOBA: 'Osoby',
}

type Entry = { kind: string; hits: number }
const seen = new Map<string, Entry>()
let total = 0

function tags(text: string): string[] {
  if (!text.includes('[REDACTED-')) return []
  return [...text.matchAll(TAG)].map((m) => m[0])
}

// `before` is the text entering the scan; a placeholder already in it is not
// something this scan hid, so it is not counted again.
export function record(before: string, after: string): void {
  if (!after.includes('[REDACTED-')) return
  const already = new Set(tags(before))
  for (const tag of tags(after)) {
    if (already.has(tag)) continue
    if (tag.startsWith('[REDACTED-LITERAL-')) continue
    const kind = tag.slice(10, tag.indexOf('-', 10))
    const entry = seen.get(tag)
    if (entry) entry.hits++
    else {
      seen.set(tag, { kind, hits: 1 })
      total++
    }
  }
}

export function stats(): Stat[] {
  const byKind = new Map<string, Stat>()
  for (const { kind, hits } of seen.values()) {
    const stat = byKind.get(kind)
    if (stat) {
      stat.count++
      stat.hits += hits
    } else byKind.set(kind, { kind, count: 1, hits })
  }
  return [...byKind.values()].sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind))
}

export function hiddenTotal(): number {
  return total
}

export function resetStats(): void {
  seen.clear()
  total = 0
}

const label = (kind: string): string => LABELS[kind] ?? kind

export function statsReport(): string {
  if (total === 0) return 'Tarcza danych: nic jeszcze nie ukryto od startu OpenCode.'
  const rows = stats()
  const hits = rows.reduce((sum, row) => sum + row.hits, 0)
  const lines = [`Tarcza danych: ukryto ${total} ${total === 1 ? 'wartość' : 'wartości'} (${hits} podmian) od startu OpenCode.`]
  for (const row of rows) lines.push(`  ${label(row.kind)}: ${row.count}${row.hits > row.count ? ` (×${row.hits})` : ''}`)
  return lines.join('\n')
}
