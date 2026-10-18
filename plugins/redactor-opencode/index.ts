import { Plugin } from '@opencode/plugin'
import { makeConfig, restore, mint, walk, escapeLiteralTags } from './detect.ts'
import { pluginOptions } from './config.ts'
import { scrubAll, scrubQuiet } from './scrub.ts'
import { loadVault } from './vault.ts'
import { statsReport } from './stats.ts'
import { demoNote } from './demo.ts'

// A tool whose answer carries live placeholders: the value under the tag is
// still known, so it may be used again by the model. Any other tool output is
// quoted text: its placeholders become LITERAL, which restore to themselves
// and never to the secret.
export const LIVE_TAG_TOOLS = new Set(['task', 'agent'])

// A string past this size could run past the hook budget. It is withheld
// rather than handed on unscanned.
const SCAN_CAP = 16_000_000
export const WITHHELD = '[tarcza-danych: treść wstrzymana — nie udało się jej przeskanować]'

// Tools that write text into git history or post it to GitHub. Their
// placeholders stay placeholders: a commit message must not carry the secret
// off the machine.
const PUBLISHES =
  /\bgit\b(?:[ \t]+-[cC][ \t]+\S+|[ \t]+--?[\w-]+(?:=\S+)?)*[ \t]+(?:commit|tag|notes|send-email)\b|\bgh[ \t]+(?:issue|pr|release|gist|discussion|api|repo[ \t]+(?:create|edit))\b/

const RESTORABLE = /\[REDACTED-(?:SECRET|HASLO|IP|LOGIN|DOMENA)-[0-9a-f]{8}\]/g
const SHELL_ACTIVE = /[\s$`"'\\;&|<>()*?[\]{}#~]|[\x00-\x1f\x7f]/

type Cfg = ReturnType<typeof makeConfig>

function safeScrub(text: string, cfg: Cfg, fn: (text: string, cfg: Cfg) => string = scrubAll): string {
  if (text.length === 0) return text
  if (text.length > SCAN_CAP) return WITHHELD
  try {
    return fn(text, cfg)
  } catch (error) {
    console.error('[tarcza-danych] scan failed, text withheld', error)
    return WITHHELD
  }
}

function safeWalk(value: unknown, cfg: Cfg, live = false): unknown {
  try {
    return walk(value, (text) => safeScrub(live ? text : escapeLiteralTags(text), cfg))
  } catch (error) {
    console.error('[tarcza-danych] walk failed, value withheld', error)
    return WITHHELD
  }
}

function scrubContentArray(content: unknown, cfg: Cfg, live: boolean): unknown {
  if (!Array.isArray(content)) return content
  return content.map((part: any) => {
    if (!part || typeof part !== 'object') return part
    if (part.type === 'text' && typeof part.text === 'string') {
      return { ...part, text: safeScrub(live ? part.text : escapeLiteralTags(part.text), cfg) }
    }
    return part
  })
}

export function scrubMessage(message: any, cfg: Cfg): any {
  if (!message || !Array.isArray(message.content)) return message
  const content = message.content.map((part: any) => {
    if (!part || typeof part !== 'object') return part
    if (part.type === 'text' && typeof part.text === 'string') {
      return { ...part, text: safeScrub(part.text, cfg) }
    }
    if (part.type === 'tool-call' && part.input !== undefined) {
      return { ...part, input: safeWalk(part.input, cfg, true) }
    }
    if (part.type === 'tool-result' && part.result) {
      const live = typeof part.name === 'string' && LIVE_TAG_TOOLS.has(part.name)
      let value = part.result.value
      if (typeof value === 'string') value = safeScrub(live ? value : escapeLiteralTags(value), cfg)
      else if (Array.isArray(value)) value = scrubContentArray(value, cfg, live)
      else if (value && typeof value === 'object') value = safeWalk(value, cfg, live)
      return { ...part, result: { ...part.result, value } }
    }
    // A plain reasoning part stays as the provider signed it: rewriting it can
    // invalidate a signature. It never held a real value, because the model
    // only ever saw placeholders.
    return part
  })
  return { ...message, content }
}

export function scrubMessages(messages: unknown, cfg: Cfg): unknown {
  return Array.isArray(messages) ? messages.map((message) => scrubMessage(message, cfg)) : messages
}

function rehideHanded(text: string, handed: Set<string>): string {
  let out = text
  for (const value of [...handed].sort((a, b) => b.length - a.length)) {
    if (value.length >= 4 && out.includes(value)) out = out.split(value).join(mint('SECRET', value))
  }
  return out
}

function cleanToolText(text: string, cfg: Cfg, handed: Set<string>, live: boolean): string {
  const escaped = live ? text : escapeLiteralTags(text)
  return rehideHanded(safeScrub(escaped, cfg), handed)
}

function cleanToolError(message: unknown, cfg: Cfg): unknown {
  if (typeof message !== 'string') return message
  return safeScrub(message, cfg)
}

export default Plugin.define({
  id: 'redactor-opencode',
  async setup(ctx: any) {
    const options = pluginOptions(ctx?.options)
    const cfg = makeConfig(options)

    const handedByCall = new Map<string, Set<string>>()

    let vaultReport: any = null
    try {
      vaultReport = await loadVault(cfg, options)
    } catch (error) {
      console.error('[tarcza-danych] vault failed to load', error)
    }
    if (vaultReport && cfg.notify) {
      console.log(`[tarcza-danych] vault: ${vaultReport.files} files, ${vaultReport.values} values, glossary ${vaultReport.glossary}`)
    }

    // The user's message, and the text a file mention carries. The scan runs
    // before the model request, so a pasted key never reaches the provider.
    await ctx.session.hook('prompt', async (event: any) => {
      const prompt = event?.prompt
      if (!prompt) return
      if (typeof prompt.text === 'string') prompt.text = safeScrub(prompt.text, cfg)
      if (Array.isArray(prompt.files)) {
        prompt.files = prompt.files.map((file: any) => {
          if (!file || typeof file !== 'object') return file
          const next = { ...file }
          if (typeof next.description === 'string') next.description = safeScrub(next.description, cfg)
          if (next.mention && typeof next.mention.text === 'string') next.mention = { ...next.mention, text: safeScrub(next.mention.text, cfg) }
          return next
        })
      }
    })

    // Everything sent to the model. This is the safety net: even if a prompt
    // hook missed something, the request that leaves the process is scanned.
    await ctx.session.hook('context', async (event: any) => {
      if (!event) return
      if (Array.isArray(event.system)) {
        event.system = event.system.map((part: any) =>
          part && typeof part.text === 'string' ? { ...part, text: safeScrub(part.text, cfg, scrubQuiet) } : part,
        )
      }
      if (Array.isArray(event.messages)) event.messages = scrubMessages(event.messages, cfg)
    })

    await ctx.session.hook('compaction', async (event: any) => {
      if (!event) return
      if (Array.isArray(event.system)) {
        event.system = event.system.map((part: any) =>
          part && typeof part.text === 'string' ? { ...part, text: safeScrub(part.text, cfg, scrubQuiet) } : part,
        )
      }
      if (Array.isArray(event.messages)) event.messages = scrubMessages(event.messages, cfg)
      if (event.result && typeof event.result.summary === 'string') event.result.summary = safeScrub(event.result.summary, cfg)
    })

    await ctx.session.hook('generate', async (event: any) => {
      if (!event) return
      if (Array.isArray(event.system)) {
        event.system = event.system.map((part: any) =>
          part && typeof part.text === 'string' ? { ...part, text: safeScrub(part.text, cfg, scrubQuiet) } : part,
        )
      }
      if (Array.isArray(event.messages)) event.messages = scrubMessages(event.messages, cfg)
    })

    await ctx.session.hook('title', async (event: any) => {
      if (!event) return
      if (Array.isArray(event.messages)) event.messages = scrubMessages(event.messages, cfg)
      if (typeof event.result === 'string') event.result = safeScrub(event.result, cfg)
    })

    // A placeholder becomes its real value only for a tool that runs on this
    // machine, and only when the value is safe to put in a shell.
    await ctx.tool.hook('execute.before', async (event: any) => {
      if (!event) return
      const handed = new Set<string>()
      handedByCall.set(event.id, handed)
      const tool = String(event.tool ?? '')
      const command = event.input && typeof event.input.command === 'string' ? event.input.command : ''
      const publishes = tool === 'shell' && PUBLISHES.test(command)
      const local = cfg.restore && cfg.restoreTools.has(tool) && !publishes
      if (!local) return

      const restoreTracked = (text: string): string => {
        const restored = restore(text)
        if (restored === text) return text
        return text.replace(RESTORABLE, (tag) => {
          const value = restore(tag)
          if (value !== tag) handed.add(value)
          return value
        })
      }
      const input = walk(event.input, restoreTracked)
      if (tool === 'shell' && [...handed].some((value) => SHELL_ACTIVE.test(value))) {
        handedByCall.delete(event.id)
        throw new Error(
          '[tarcza-danych] wartość trzymana w tym poleceniu ma znaki powłoki, więc nie wstawiono jej do shella. ' +
            'Zapisz ją narzędziem write do pliku i pozwól poleceniu przeczytać ten plik.',
        )
      }
      event.input = input
    })

    // The result, the text the model reads and any object it carries are all
    // scanned. Values this call was handed are re-hidden even when they are
    // too short for a detector.
    await ctx.tool.hook('execute.after', async (event: any) => {
      if (!event) return
      const handed = handedByCall.get(event.id) ?? new Set<string>()
      handedByCall.delete(event.id)
      if (event.status !== 'completed') {
        if (event.error && typeof event.error.message === 'string') event.error.message = cleanToolError(event.error.message, cfg)
        if (event.error && event.error.metadata) event.error.metadata = safeWalk(event.error.metadata, cfg)
        return
      }
      const result = event.result
      if (!result) return
      const live = LIVE_TAG_TOOLS.has(String(event.tool ?? ''))
      if (typeof result.content === 'string') result.content = cleanToolText(result.content, cfg, handed, live)
      else if (Array.isArray(result.content)) {
        result.content = result.content.map((part: any) =>
          part && part.type === 'text' && typeof part.text === 'string'
            ? { ...part, text: cleanToolText(part.text, cfg, handed, live) }
            : part,
        )
      }
      if (typeof result.output === 'string') result.output = cleanToolText(result.output, cfg, handed, live)
      else if (result.output && typeof result.output === 'object') {
        try {
          result.output = walk(result.output, (text) => cleanToolText(text, cfg, handed, live))
        } catch (error) {
          console.error('[tarcza-danych] tool output could not be walked, withheld', error)
          result.output = undefined
          result.content = WITHHELD
        }
      }
    })

    // Commands are registered in the TUI. `opencode run` treats a slash as
    // text and does not dispatch plugin commands, so the README says so.
    await ctx.command.transform((editor: any) => {
      editor.add({
        name: 'redact-test',
        description: 'Tarcza danych: pokaż, co zobaczy AI (bez wysyłania)',
        execute: async ({ sessionID, prompt }: any) => {
          const text = typeof prompt?.text === 'string' ? prompt.text : ''
          const arg = text.replace(/^\/redact-test\b[ \t]*/i, '').trim()
          const body = arg
            ? `AI zobaczy:\n${safeScrub(arg, cfg)}`
            : 'Użycie: /redact-test <tekst do sprawdzenia>'
          await ctx.session.synthetic({ sessionID, text: body })
        },
      })
      editor.add({
        name: 'redact-demo',
        description: 'Tarcza danych: fałszywa notatka przed i po podmianie',
        execute: async ({ sessionID }: any) => {
          const note = demoNote()
          const after = safeScrub(note, cfg)
          await ctx.session.synthetic({ sessionID, text: ['PRZED (to wpisujesz):', note, '', 'PO (to dostaje AI):', after].join('\n') })
        },
      })
      editor.add({
        name: 'redactions',
        description: 'Tarcza danych: licznik ukrytych wartości od startu OpenCode',
        execute: async ({ sessionID }: any) => {
          await ctx.session.synthetic({ sessionID, text: statsReport() })
        },
      })
    })

    return () => {
      handedByCall.clear()
    }
  },
})
