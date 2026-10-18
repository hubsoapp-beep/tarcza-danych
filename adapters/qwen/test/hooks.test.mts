// Qwen Code hooks: PreToolUse restore, network-tool guard, optional prompt block.
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
  token: 'qwen-test-token',
  options: { vaultSources: '', glossaryFile: '/nonexistent/tarcza/slownik.txt' },
  quiet: true,
})
const base = `http://127.0.0.1:${daemon.port}`

function run(event: unknown, arg: string, extraEnv: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', hook, arg], {
      env: { ...process.env, TARCZA_DAEMON: base, TARCZA_TOKEN: 'qwen-test-token', ...extraEnv },
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
  const scrubbed = await (
    await fetch(`${base}/scrub`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-tarcza-token': 'qwen-test-token' },
      body: JSON.stringify({ text: `Hasło: ${password}` }),
    })
  ).json()
  const tag = scrubbed.text.match(/\[REDACTED-HASLO-[0-9a-f]{8}\]/)![0]

  const pre = JSON.parse(
    await run(
      { hook_event_name: 'PreToolUse', tool_name: 'run_shell_command', tool_input: { command: `echo Hasło: ${tag}` } },
      'pre-tool',
    ),
  )
  assert.equal(pre.hookSpecificOutput.hookEventName, 'PreToolUse')
  assert.ok(pre.hookSpecificOutput.updatedInput.command.includes(password), 'PreToolUse restores the local tool')

  const network = await run(
    { hook_event_name: 'PreToolUse', tool_name: 'web_search', tool_input: { query: `Hasło: ${tag}` } },
    'pre-tool',
  )
  assert.equal(network.trim(), '', 'network tool is never restored')

  const blocked = JSON.parse(
    await run(
      { hook_event_name: 'UserPromptSubmit', prompt: `Hasło: ${password}` },
      'user-prompt',
      { TARCZA_BLOCK_PROMPTS: '1' },
    ),
  )
  assert.equal(blocked.decision, 'block', 'UserPromptSubmit blocks a prompt with a secret when asked')

  console.log('ok  qwen: PreToolUse restore, network guard, optional prompt block')
} finally {
  await daemon.close()
}
