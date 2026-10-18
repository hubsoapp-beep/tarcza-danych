// Grok adapter tests: proxy scrubbing, shared restore state, and the hook JSON
// contract. No real key, no real personal data.
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { startDaemon } from '../daemon.ts'

const here = dirname(fileURLToPath(import.meta.url))
const hook = join(here, '..', 'hook.ts')
const password = 'Test123!'
const domain = 'sellso.pl'

let seen: any = null
const upstream = http.createServer((req, res) => {
  const chunks: Buffer[] = []
  req.on('data', (chunk: Buffer) => chunks.push(chunk))
  req.on('end', () => {
    seen = { auth: req.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
  })
})
await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
const upstreamPort = (upstream.address() as any).port

const daemon = await startDaemon({
  port: 0,
  upstream: `http://127.0.0.1:${upstreamPort}/v1`,
  upstreamKey: 'real-upstream-key',
  token: 'test-token',
  options: { vaultSources: '', glossaryFile: '/nonexistent/tarcza/slownik.txt' },
  quiet: true,
})
const base = `http://127.0.0.1:${daemon.port}`

try {
  // 1. The proxy scrubs the outbound request and swaps in the real upstream key.
  const response = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
    body: JSON.stringify({ model: 'grok-4.5', messages: [{ role: 'user', content: `Hasło: ${password}` }] }),
  })
  assert.equal(response.status, 200)
  const sent = JSON.stringify(seen.body)
  assert.ok(!sent.includes(password), 'proxy: the password did not reach the upstream')
  assert.match(sent, /\[REDACTED-HASLO-[0-9a-f]{8}\]/)
  assert.equal(seen.auth, 'Bearer real-upstream-key', 'proxy: the upstream key replaces the local token')

  const tag = sent.match(/\[REDACTED-HASLO-[0-9a-f]{8}\]/)![0]

  // 2. The hook and the proxy share one mapping: the tag restores to the real value.
  const restored = await fetch(`${base}/restore`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tarcza-token': 'test-token' },
    body: JSON.stringify({ value: { content: `Hasło: ${tag}` } }),
  })
  const restoredBody = await restored.json()
  assert.ok(JSON.stringify(restoredBody.value).includes(password), 'restore: shared state gives the real value')
  assert.ok(restoredBody.restored.some((value: string) => value.includes(password)), 'restore: the handed value is reported')

  // 3. /scrub on plain text and on a tool result object.
  const scrub = await fetch(`${base}/scrub`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tarcza-token': 'test-token' },
    body: JSON.stringify({ text: `Domena: ${domain}` }),
  })
  assert.match((await scrub.json()).text, /\[REDACTED-DOMENA-[0-9a-f]{8}\]/)
  const scrubValue = await fetch(`${base}/scrub`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tarcza-token': 'test-token' },
    body: JSON.stringify({ value: { type: 'ReadFile', content: `Hasło: ${password}` } }),
  })
  assert.ok(!JSON.stringify(await scrubValue.json()).includes(password), 'scrub: object strings are hidden')

  // 4. Auth is required.
  const unauth = await fetch(`${base}/scrub`, { method: 'POST', body: '{"text":"x"}' })
  assert.equal(unauth.status, 401)

  // 5. The hook contract: PreToolUse restores a local tool, PostToolUse scrubs.
  const runHook = (event: unknown, arg: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--experimental-strip-types', hook, arg], {
        env: { ...process.env, TARCZA_DAEMON: base, TARCZA_TOKEN: 'test-token' },
      })
      let out = ''
      let err = ''
      child.stdout.on('data', (chunk) => (out += chunk))
      child.stderr.on('data', (chunk) => (err += chunk))
      child.on('error', reject)
      child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err || `hook exit ${code}`))))
      child.stdin.end(JSON.stringify(event))
    })

  const pre = JSON.parse(
    await runHook({ hook_event_name: 'PreToolUse', tool_name: 'search_replace', tool_input: { content: `Hasło: ${tag}` } }, 'pre-tool'),
  )
  assert.ok(pre.hookSpecificOutput.updatedInput.content.includes(password), 'hook: PreToolUse restores the value')
  assert.equal(pre.hookSpecificOutput.hookEventName, 'PreToolUse')

  const post = JSON.parse(
    await runHook({ hook_event_name: 'PostToolUse', tool_name: 'read_file', toolResult: { type: 'ReadFile', content: `Hasło: ${password}` } }, 'post-tool'),
  )
  assert.ok(!JSON.stringify(post).includes(password), 'hook: PostToolUse hides the value from the model')
  assert.match(JSON.stringify(post), /\[REDACTED-HASLO-[0-9a-f]{8}\]/)

  const network = await runHook({ hook_event_name: 'PreToolUse', tool_name: 'web_search', tool_input: { query: `Hasło: ${tag}` } }, 'pre-tool')
  assert.equal(network.trim(), '', 'hook: a network tool is never restored')

  console.log('ok  grok: proxy, shared restore, scrub, auth, hook contract')
} finally {
  await daemon.close()
  await new Promise<void>((resolve) => upstream.close(() => resolve()))
}
