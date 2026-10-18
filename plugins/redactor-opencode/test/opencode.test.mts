// Wiring tests for the OpenCode plugin: the same callbacks OpenCode would
// call, with a fake context. No provider, no network, no real value.
import assert from 'node:assert/strict'
import plugin from '../index.ts'
import { DEFAULT_OPTIONS, pluginOptions } from '../config.ts'
import { mint } from '../detect.ts'
import { resetStats, statsReport } from '../stats.ts'

resetStats()

const sessionHooks = new Map<string, (event: any) => Promise<void> | void>()
const toolHooks = new Map<string, (event: any) => Promise<void> | void>()
const commands = new Map<string, any>()
const synthetic: string[] = []

const registration = { dispose: async () => {} }
const ctx = {
  options: { vaultSources: '', glossaryFile: '/nonexistent/tarcza-danych/slownik.txt' },
  session: {
    hook: async (name: string, callback: any) => {
      sessionHooks.set(name, callback)
      return registration
    },
    synthetic: async ({ text }: { text: string }) => {
      synthetic.push(text)
    },
  },
  tool: {
    hook: async (name: string, callback: any) => {
      toolHooks.set(name, callback)
      return registration
    },
  },
  command: {
    transform: async (callback: any) => {
      callback({ add: (definition: any) => commands.set(definition.name, definition) })
      return registration
    },
  },
}

const cleanup = await plugin.setup(ctx)
assert.equal(typeof cleanup, 'function', 'setup returns a cleanup function')

const session = (name: string) => {
  const hook = sessionHooks.get(name)
  assert.ok(hook, `session hook ${name} is registered`)
  return hook
}
const tool = (name: string) => {
  const hook = toolHooks.get(name)
  assert.ok(hook, `tool hook ${name} is registered`)
  return hook
}

const SECRET = 'sk-ant-api03-' + 'FakeFakeFakeFakeFakeFakeFakeFakeFake'
const PASSWORD = 'tajneHaslo123'
const promptEvent = { prompt: { text: `Hasło: ${PASSWORD}\nKlucz: ${SECRET}\nDomena: firma-przyklad.pl` } }
await session('prompt')(promptEvent)
assert.ok(!promptEvent.prompt.text.includes(PASSWORD), 'prompt: password is gone')
assert.ok(!promptEvent.prompt.text.includes(SECRET), 'prompt: key is gone')
assert.match(promptEvent.prompt.text, /\[REDACTED-HASLO-[0-9a-f]{8}\]/)
const keyTag = promptEvent.prompt.text.match(/\[REDACTED-SECRET-[0-9a-f]{8}\]/)![0]

// A local server link is not a secret. The model has to be able to repeat it.
const zero = ['0', '0', '0', '0'].join('.')
const loop = ['127', '0', '0', '1'].join('.')
const lan = ['192', '168', '1', '10'].join('.')
for (const url of [`http://${zero}:8096`, `http://${loop}:8096`, `http://${lan}:8096`]) {
  const event = { prompt: { text: `Otwórz ${url}` } }
  await session('prompt')(event)
  assert.equal(event.prompt.text, `Otwórz ${url}`, `prompt keeps ${url}`)
}

// The context hook is the last line before the provider: a message the prompt
// hook never saw is still scanned, and a tool result is scanned too.
const contextEvent = {
  system: [{ type: 'text', text: `API_KEY=${SECRET}` }],
  messages: [
    {
      role: 'user',
      content: [{ type: 'text', text: `moje hasło: ${PASSWORD}` }],
    },
    {
      role: 'assistant',
      content: [
        { type: 'tool-call', id: 'c1', name: 'read', input: { path: 'notatki.txt', token: SECRET } },
        { type: 'tool-result', id: 'c1', name: 'read', result: { type: 'text', value: `Hasło: ${PASSWORD}` } },
      ],
    },
  ],
}
await session('context')(contextEvent)
const contextText = JSON.stringify(contextEvent.messages)
assert.ok(!contextText.includes(PASSWORD), 'context: a password in a tool result is gone')
assert.ok(!contextText.includes(SECRET), 'context: a key in a tool call input is gone')
assert.ok(!JSON.stringify(contextEvent.system).includes(SECRET), 'context: the system prompt is scanned')

// A placeholder handed to a local tool becomes the real value again.
const before = { id: 'call-1', tool: 'write', input: { path: 'x.txt', content: `key=${keyTag}` } }
await tool('execute.before')(before)
assert.ok(before.input.content.includes(SECRET), 'restore: write gets the real value')

// What that tool printed comes back hidden, including a short value that no
// detector would notice on its own.
const after = {
  id: 'call-1',
  tool: 'write',
  status: 'completed',
  result: { content: `created with ${SECRET}`, output: { ok: true, printed: SECRET } },
}
await tool('execute.after')(after)
assert.ok(!JSON.stringify(after).includes(SECRET), 'tool output: the handed value is hidden again')
assert.match(JSON.stringify(after), /\[REDACTED-SECRET-[0-9a-f]{8}\]/)

// A value with shell characters is never put into `shell`.
const dangerous = mint('HASLO', 'dwa slowa')
const shell = { id: 'call-2', tool: 'shell', input: { command: `echo ${dangerous}` } }
await assert.rejects(() => tool('execute.before')(shell), /znaki powłoki/)

// Commands shown in the TUI.
const testCommand = commands.get('redact-test')
assert.ok(testCommand, '/redact-test is registered')
await testCommand.execute({ sessionID: 's1', prompt: { text: `/redact-test Hasło: ${PASSWORD}` } })
assert.match(synthetic.at(-1)!, /\[REDACTED-HASLO-[0-9a-f]{8}\]/)
assert.ok(!synthetic.at(-1)!.includes(PASSWORD))
assert.match(statsReport(), /Hasła/)

const demoCommand = commands.get('redact-demo')
assert.ok(demoCommand, '/redact-demo is registered')
await demoCommand.execute({ sessionID: 's1' })
const demo = synthetic.at(-1)!
assert.match(demo, /PRZED/)
assert.match(demo, /PO/)
assert.match(demo, /\[REDACTED-/)
assert.ok(!demo.slice(demo.indexOf('PO (to dostaje AI):')).includes('Zimowa13!@Zimowa13!@'), 'demo: the after half hides the password')

const redactions = commands.get('redactions')
assert.ok(redactions, '/redactions is registered')
await redactions.execute({ sessionID: 's1' })
assert.match(synthetic.at(-1)!, /Tarcza danych/)

assert.equal(pluginOptions({ pii: false }).pii, false)
assert.equal(pluginOptions({}).pii, DEFAULT_OPTIONS.pii)
assert.equal(DEFAULT_OPTIONS.pii, true, 'the OpenCode port keeps the Claude default')
assert.equal(DEFAULT_OPTIONS.redactPrivateIps, true)

await cleanup()
console.log('ok  opencode: hooks, restore, tool output, commands and defaults')
