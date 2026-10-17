import { atom, read } from 'claude-code'
import type { Register } from 'claude-code'

import type { Seen } from '../types'

import { makeConfig } from './detect.ts'
import { scrubAll } from './scrub.ts'
import { demoNote } from './demo.ts'
import { LABELS, report, state } from './ledger.ts'

// Same plugin and key as the ledger's atom: one state, written there, read here.
// The engine reads the atom from the file that uses it, so it is spelled out twice.
const seen = atom({ plugin: 'redactor-pl', key: 'seen' } as const, [])

const PANE = 'redactor-pl'
const TITLE = 'Tarcza danych'

const RULE = '─'.repeat(44)

type Row = { n: number; last: Seen }

const label = (kind: string): string => LABELS[kind] ?? kind

// Theme keys, so the pane follows the person's theme: secrets red, personal
// data yellow, infrastructure blue, the glossary purple.
const color = (kind: string): string => {
  if (kind === 'SECRET' || kind === 'HASLO' || kind === 'KARTA' || kind === 'IBAN') return 'error'
  if (kind === 'PESEL' || kind === 'NIP' || kind === 'REGON' || kind === 'DOWOD' || kind === 'TEL' || kind === 'EMAIL') return 'warning'
  if (kind === 'KLIENT' || kind === 'OSOBA') return 'remember'
  return 'suggestion'
}

const where = (source: string): string => {
  if (source === 'prompt') return 'Twoja wiadomość'
  if (source === 'context') return 'kontekst sesji'
  if (source === 'attachment') return 'załącznik'
  if (source === 'demo') return 'pokaz /redact-demo'
  if (source === 'test') return 'próba /redact-test'
  if (source.startsWith('tool ')) return `narzędzie ${source.slice(5)}`

  return source
}

// The text around a value, made readable: JSON escapes undone, the other
// placeholders and this one shortened to a block, whitespace squeezed.
const snippet = (one: Seen): string => {
  const flat = one.around
    .replace(/\\[nrt]/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\s+/g, ' ')
  const marked = flat.split(one.id).join('▮▮▮').replace(/\[REDACTED-[A-Z]+-[0-9a-f]+\]/g, '▯▯▯')

  return `…${marked.trim()}…`
}

// Called from the one session.start hook (redact.ts): a plugin may register
// that event once.
export async function startPane($: any): Promise<void> {
  await $.command.register({ name: 'redactions', description: 'Tarcza danych: panel z tym, co zostało podmienione (projector on|off)' })
  await $.command.register({ name: 'redact-demo', description: 'Tarcza danych: pokaż fałszywą notatkę przed i po podmianie' })
  await $.command.register({ name: 'redact-test', description: 'Tarcza danych: sprawdź, co zobaczy AI (bez wysyłania). /redact-test <tekst>' })
  void $.ui.open({ id: PANE, title: TITLE, columns: 48 })
}

export const register: Register = (on, options) => {
  const cfg = makeConfig(options as Record<string, unknown>)

  on('command.run', { command: 'redactions' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'projector on' || arg === 'projector') state.projector = true
    if (arg === 'projector off') state.projector = false
    await $.ui.open({ id: PANE, title: TITLE, columns: 48 })

    return { text: state.projector ? 'Panel otwarty. Tryb projektora: wartości ukryte.' : 'Panel otwarty.' }
  })

  on('command.run', { command: 'redact-demo' }, async ($) => {
    const note = demoNote()
    const after = scrubAll(note, cfg)
    // The demo fills the pane too, so the audience sees the counts at once.
    await report($, after, 'demo')

    return { text: ['PRZED (to wpisujesz):', note, '', 'PO (to dostaje AI):', after].join('\n') }
  })

  on('command.run', { command: 'redact-test' }, async ($, e) => {
    const text = e.args
    if (!text.trim()) return { text: 'Użycie: /redact-test <tekst do sprawdzenia>' }
    const after = scrubAll(text, cfg)
    await report($, after, 'test')

    return { text: `AI zobaczy:\n${after}` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, seen)
    if (list.length === 0) {
      return (
        <Box flexDirection="column">
          <Text bold color="success">Tarcza danych działa</Text>
          <Text dimColor>Nic jeszcze nie podmieniono. Wpisz /redact-demo, żeby zobaczyć pokaz.</Text>
        </Box>
      )
    }

    // One row per placeholder, newest first, with how many times it was seen.
    const rows = new Map<string, Row>()
    for (const one of list) {
      const row = rows.get(one.id)
      if (row) {
        row.n += 1
        row.last = one
      } else rows.set(one.id, { n: 1, last: one })
    }
    const unique = [...rows.values()].reverse()
    const perKind = new Map<string, number>()
    for (const { last } of unique) perKind.set(last.kind, (perKind.get(last.kind) ?? 0) + 1)
    const kinds = [...perKind].sort((a, b) => b[1] - a[1])
    const rowsFree = (e.viewport?.rows ?? 24) - 6 - kinds.length
    const room = Math.max(1, Math.floor(rowsFree / 4))

    return (
      <Box flexDirection="column">
        <Text bold color="success">
          Ukryto {unique.length} {unique.length === 1 ? 'wartość' : 'wartości'} przed AI
        </Text>
        {kinds.map(([kind, n]) => (
          <Text>
            <Text color={color(kind)}>{'▮'.repeat(Math.min(n, 12))}</Text> {label(kind)} <Text bold>{n}</Text>
          </Text>
        ))}
        <Text dimColor>{RULE}</Text>
        {unique.slice(0, room).map(({ n, last }) => (
          <Box flexDirection="column" marginBottom={1}>
            <Text>
              <Text bold color={color(last.kind)}>{label(last.kind)}</Text>
              {!state.projector && last.masked ? <Text>  {last.masked}</Text> : null}
              {n > 1 ? <Text dimColor>  ×{n}</Text> : null}
            </Text>
            <Text dimColor>{last.at} · {where(last.source)}</Text>
            <Text dimColor italic wrap="truncate-end">{snippet(last)}</Text>
          </Box>
        ))}
        {unique.length > room && <Text dimColor>… i {unique.length - room} starszych</Text>}
      </Box>
    )
  })
}
