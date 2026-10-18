// Gemini CLI hook tests: BeforeModel, BeforeTool, AfterTool, AfterModel.
// The daemon is the shared one; no real key and no real personal data.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { startDaemon } from '../../shared/daemon.ts'

const here = dirname(fileURLToPath(import.meta.url))
const hook = join(here, '..', 'hook.ts')
const password = String.fromCharCode(...[84, 101, 115, 116, 49, 50, 51, 33])

const daemon = await startDaemon({
  port: 0,
  token: 'gemini-test-token',
  options: { vaultSources: '', glossaryFile: '/nonexistent/tarcza/slownik.txt' },
  quiet: true,
})
const base = `http://127.0.0.1:${daemon.port}`

function run(event: unknown, arg: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', hook, arg], {
      env: { ...process.env, TARCZA_DAEMON: base, TARCZA_TOKEN: 'gemini-test-token' },
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (chunk) => (out += chunk))
    child.stderr.on('data', (chunk) => (err += chunk))
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err || `hook exit ${code}`))))
    child.stdin.end(JSON.stringify(event))
  })
}

try {
  const model = JSON.parse(
    await run(
      {
        hook_event_name: 'BeforeModel',
        llm_request: { model: 'gemini-test', messages: [{ role: 'user', content: `Hasło: ${password}` }] },
      },
      'before-model',
    ),
  )
  const sent = JSON.stringify(model.hookSpecificOutput.llm_request)
  assert.ok(!sent.includes(password), 'BeforeModel: the password is gone')
  assert.match(sent, /\[REDACTED-HASLO-[0-9a-f]{8}\]/)
  const tag = sent.match(/\[REDACTED-HASLO-[0-9a-f]{8}\]/)![0]

  const tool = JSON.parse(
    await run(
      { hook_event_name: 'BeforeTool', tool_name: 'run_shell_command', tool_input: { command: `echo Hasło: ${tag}` } },
      'before-tool',
    ),
  )
  assert.ok(tool.hookSpecificOutput.tool_input.command.includes(password), 'BeforeTool: the local tool gets the real value')

  const network = await run(
    { hook_event_name: 'BeforeTool', tool_name: 'web_search', tool_input: { query: `Hasło: ${tag}` } },
    'before-tool',
  )
  assert.equal(network.trim(), '', 'BeforeTool: a network tool is never restored')

  const after = JSON.parse(
    await run(
      { hook_event_name: 'AfterTool', tool_name: 'read_file', tool_response: { llmContent: `Hasło: ${password}`, returnDisplay: '' } },
      'after-tool',
    ),
  )
  assert.equal(after.decision, 'deny', 'AfterTool: the real result is replaced for the model')
  assert.ok(!JSON.stringify(after).includes(password), 'AfterTool: the password is gone')
  assert.match(after.reason, /\[REDACTED-HASLO-[0-9a-f]{8}\]/)

  const chunk = JSON.parse(
    await run(
      {
        hook_event_name: 'AfterModel',
        llm_response: { candidates: [{ content: { role: 'model', parts: [`Hasło: ${password}`] }, finishReason: 'STOP' }] },
      },
      'after-model',
    ),
  )
  const reply = JSON.stringify(chunk.hookSpecificOutput.llm_response)
  assert.ok(!reply.includes(password), 'AfterModel: a response chunk is scrubbed')
  assert.match(reply, /\[REDACTED-HASLO-[0-9a-f]{8}\]/)

  console.log('ok  gemini: BeforeModel, BeforeTool, AfterTool, AfterModel')
} finally {
  await daemon.close()
}
