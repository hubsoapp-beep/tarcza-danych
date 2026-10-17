// What the pane shows: one row per value hidden, with the placeholder, the
// kind, where it was hidden, a little text around it and a masked preview of
// the value. The value itself never goes in the ledger.
import { atom, update } from 'claude-code'

import { valueOf } from './detect.ts'
import { mask } from './pl.ts'
import type { Seen } from '../types'

export const seen = atom({ plugin: 'redactor-pl', key: 'seen' } as const, [])

const TAG = /\[REDACTED-([A-Z]+)-([0-9a-f]{8})\]/g
const KEEP = 150

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

export const state = { projector: false }

export function scan(text: string, source: string): Seen[] {
  const found: Seen[] = []
  const at = new Date().toLocaleTimeString('pl-PL')
  for (const m of text.matchAll(TAG)) {
    if (m[1] === 'LITERAL') continue
    const i = m.index ?? 0
    const around = text.slice(Math.max(0, i - 36), i + m[0].length + 36).replace(/\s+/g, ' ')
    const value = valueOf(m[0])
    found.push({ id: m[0], kind: m[1]!, source, at, around, masked: value === undefined ? '' : mask(value) })
  }
  return found
}

// Never throws: the ledger is a display, and a hook that broke on it would
// stop the redaction it only reports.
export async function report($: any, text: string | undefined, source: string): Promise<void> {
  try {
    if (!text) return
    const items = scan(text.length > 400_000 ? text.slice(0, 400_000) : text, source)
    if (items.length === 0) return
    await update($, seen, (list: Seen[]) => {
      const fresh = items.filter((one) => !list.some((o) => o.id === one.id && o.source === one.source && o.around === one.around))
      return [...list, ...fresh].slice(-KEEP)
    })
  } catch {}
}
