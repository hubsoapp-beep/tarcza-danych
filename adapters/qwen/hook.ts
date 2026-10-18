// Qwen Code hook adapter. Qwen uses Claude-style tool events, not Gemini's
// BeforeModel: prompt redaction therefore happens in the proxy. The hook
// restores placeholders before local tools and can block a prompt explicitly.
import { readToken } from '../shared/token.ts'

const DAEMON = (process.env.TARCZA_DAEMON ?? 'http://127.0.0.1:8787').replace(/\/$/, '')
const RESTORE_TOOLS = new Set(
  (process.env.TARCZA_RESTORE_TOOLS ?? 'run_shell_command,write_file,replace,read_file')
    .split(',')
    .map((tool) => tool.trim())
    .filter(Boolean),
)
const SHELL_ACTIVE = /[\s$`"'\\;&|<>()*?[\]{}#~]|[\x00-\x1f\x7f]/

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk))
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    process.stdin.on('error', reject)
  })
}

async function call(path: string, body: unknown): Promise<any> {
  const token = readToken()
  if (!token) throw new Error('brak tokenu Tarczy (~/.tarcza/token)')
  const response = await fetch(DAEMON + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tarcza-token': token },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`daemon ${path}: HTTP ${response.status}`)
  return response.json()
}

const CLI_ALIASES: Record<string, string> = {
  'session-start': 'SessionStart',
  'pre-tool': 'PreToolUse',
  'post-tool': 'PostToolUse',
  'post-tool-failure': 'PostToolUseFailure',
  'user-prompt': 'UserPromptSubmit',
}

function eventName(event: any): string {
  const cli = String(process.argv[2] ?? '')
  return String(event?.hook_event_name ?? event?.hookEventName ?? CLI_ALIASES[cli] ?? cli)
}

async function handle(event: any): Promise<unknown | undefined> {
  const name = eventName(event)

  if (name === 'SessionStart') {
    try {
      await fetch(DAEMON + '/health')
    } catch (error) {
      console.error('[tarcza-qwen] daemon not reachable', error)
    }
    return undefined
  }

  if (name === 'PreToolUse') {
    const tool = String(event.tool_name ?? '')
    if (!RESTORE_TOOLS.has(tool)) return undefined
    try {
      const restored = await call('/restore', { value: event.tool_input ?? {} })
      if (tool === 'run_shell_command' && Array.isArray(restored.values) && restored.values.some((value: string) => SHELL_ACTIVE.test(value))) {
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: '[tarcza] wartość ma znaki powłoki; zapisz ją do pliku i pozwól poleceniu przeczytać plik.',
          },
        }
      }
      return { hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput: restored.value } }
    } catch (error) {
      console.error('[tarcza-qwen] restore failed', error)
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: '[tarcza] nie mogę przywrócić wartości; narzędzie nie zostało uruchomione.',
        },
      }
    }
  }

  // PostToolUse/PostToolUseFailure in Qwen can add context but cannot replace
  // the result. The proxy scrubs the result in the next model request, so the
  // hook intentionally does nothing here.

  if (name === 'UserPromptSubmit' && process.env.TARCZA_BLOCK_PROMPTS === '1') {
    const text = String(event.prompt ?? event.submitted_prompt ?? '')
    try {
      const clean = await call('/scrub', { text })
      if (clean.text !== text) {
        return { decision: 'block', reason: '[tarcza] prompt zawiera sekret. Użyj placeholdera albo proxy.' }
      }
    } catch {
      return { decision: 'block', reason: '[tarcza] nie mogę przeskanować promptu; nie wysyłam go.' }
    }
  }

  return undefined
}

const raw = await readStdin()
let event: any = {}
try {
  event = raw.trim() ? JSON.parse(raw) : {}
} catch (error) {
  console.error('[tarcza-qwen] invalid hook JSON', error)
  process.exit(0)
}
const result = await handle(event)
if (result !== undefined) process.stdout.write(JSON.stringify(result))
