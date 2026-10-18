// Grok Build hook adapter. Reads the event JSON from stdin, asks the daemon,
// and writes one JSON object to stdout. Nothing else goes to stdout.
//
//   PreToolUse   -> /restore, returns updatedInput
//   PostToolUse  -> /scrub,   returns updatedToolOutput
//   PostToolUseFailure -> /scrub, returns additionalContext
//   SessionStart -> /health
import { readToken } from './token.ts'

const DAEMON = (process.env.TARCZA_DAEMON ?? 'http://127.0.0.1:8787').replace(/\/$/, '')
const WITHHELD = '[tarcza: treść wstrzymana — nie udało się jej przeskanować]'
const RESTORE_TOOLS = new Set(
  (process.env.TARCZA_RESTORE_TOOLS ?? 'run_terminal_command,search_replace,write_file,create_file')
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

function withheld(value: unknown): unknown {
  if (typeof value === 'string') return WITHHELD
  if (Array.isArray(value)) return value.map(withheld)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) out[key] = withheld(item)
    return out
  }
  return value
}

const CLI_ALIASES: Record<string, string> = {
  'session-start': 'SessionStart',
  'pre-tool': 'PreToolUse',
  'post-tool': 'PostToolUse',
  'post-tool-failure': 'PostToolUseFailure',
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
      console.error('[tarcza-grok] daemon not reachable', error)
    }
    return undefined
  }

  if (name === 'PreToolUse') {
    const tool = String(event.tool_name ?? event.toolName ?? '')
    if (!RESTORE_TOOLS.has(tool)) return undefined
    const input = event.tool_input ?? event.toolInput ?? {}
    try {
      const restored = await call('/restore', { value: input })
      if (tool === 'run_terminal_command' && Array.isArray(restored.values) && restored.values.some((value: string) => SHELL_ACTIVE.test(value))) {
        return {
          decision: 'deny',
          reason: '[tarcza] wartość ma znaki powłoki; zapisz ją do pliku i pozwól poleceniu przeczytać plik.',
        }
      }
      return { hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput: restored.value } }
    } catch (error) {
      console.error('[tarcza-grok] restore failed', error)
      return { decision: 'deny', reason: '[tarcza] nie mogę przywrócić wartości; narzędzie nie zostało uruchomione' }
    }
  }

  if (name === 'PostToolUse') {
    const result = event.toolResult ?? event.tool_result ?? event.tool_response ?? event.toolResultOld ?? ''
    try {
      const clean = await call('/scrub', { value: result })
      return { hookSpecificOutput: { hookEventName: 'PostToolUse', updatedToolOutput: clean.value ?? clean.text } }
    } catch (error) {
      console.error('[tarcza-grok] scrub failed', error)
      return {
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          updatedToolOutput: withheld(result),
        },
      }
    }
  }

  if (name === 'PostToolUseFailure') {
    const result = event.error ?? event.toolResult ?? event.tool_response ?? ''
    try {
      const clean = await call('/scrub', { value: result })
      const context = typeof clean.value === 'string' ? clean.value : JSON.stringify(clean.value ?? clean.text ?? '')
      return { hookSpecificOutput: { hookEventName: 'PostToolUseFailure', additionalContext: context } }
    } catch {
      return { hookSpecificOutput: { hookEventName: 'PostToolUseFailure', additionalContext: WITHHELD } }
    }
  }

  if (name === 'UserPromptSubmit' && process.env.TARCZA_BLOCK_PROMPTS === '1') {
    const text = String(event.prompt ?? '')
    try {
      const clean = await call('/scrub', { text })
      if (clean.text !== text) {
        return { decision: 'block', reason: '[tarcza] prompt zawiera sekret. Użyj placeholdera albo lokalnego proxy.' }
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
  console.error('[tarcza-grok] invalid hook JSON', error)
  process.exit(0)
}
const result = await handle(event)
if (result !== undefined) process.stdout.write(JSON.stringify(result))
