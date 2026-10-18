// Gemini CLI hook adapter. Reads one event from stdin, asks the shared daemon,
// and writes one JSON object to stdout.
//
//   BeforeModel  -> scrub llm_request.messages
//   BeforeTool   -> restore a local tool input
//   AfterTool    -> hide the real tool_response from the model
//   AfterModel   -> scrub response chunks
//   SessionStart -> /health
import { readToken } from '../shared/token.ts'

const DAEMON = (process.env.TARCZA_DAEMON ?? 'http://127.0.0.1:8787').replace(/\/$/, '')
const WITHHELD = '[tarcza: treść wstrzymana — nie udało się jej przeskanować]'
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
  'before-model': 'BeforeModel',
  'before-tool': 'BeforeTool',
  'after-tool': 'AfterTool',
  'after-model': 'AfterModel',
  'before-agent': 'BeforeAgent',
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
      console.error('[tarcza-gemini] daemon not reachable', error)
    }
    return undefined
  }

  if (name === 'BeforeModel') {
    try {
      const clean = await call('/scrub', { value: event.llm_request ?? {} })
      return { hookSpecificOutput: { llm_request: clean.value } }
    } catch (error) {
      console.error('[tarcza-gemini] scrub failed', error)
      return { decision: 'deny', reason: '[tarcza] nie mogę przeskanować requestu; nie wysyłam go.' }
    }
  }

  if (name === 'BeforeTool') {
    const tool = String(event.tool_name ?? '')
    if (!RESTORE_TOOLS.has(tool)) return undefined
    try {
      const restored = await call('/restore', { value: event.tool_input ?? {} })
      if (tool === 'run_shell_command' && Array.isArray(restored.values) && restored.values.some((value: string) => SHELL_ACTIVE.test(value))) {
        return { decision: 'deny', reason: '[tarcza] wartość ma znaki powłoki; zapisz ją do pliku i pozwól poleceniu przeczytać plik.' }
      }
      return { hookSpecificOutput: { tool_input: restored.value } }
    } catch (error) {
      console.error('[tarcza-gemini] restore failed', error)
      return { decision: 'deny', reason: '[tarcza] nie mogę przywrócić wartości; narzędzie nie zostało uruchomione.' }
    }
  }

  if (name === 'AfterTool') {
    try {
      const before = JSON.stringify(event.tool_response ?? '')
      const clean = await call('/scrub', { value: event.tool_response ?? '' })
      const after = JSON.stringify(clean.value)
      if (after === before) return undefined
      return { decision: 'deny', reason: typeof clean.value === 'string' ? clean.value : JSON.stringify(clean.value) }
    } catch (error) {
      console.error('[tarcza-gemini] scrub failed', error)
      return { decision: 'deny', reason: WITHHELD }
    }
  }

  if (name === 'AfterModel') {
    try {
      const before = JSON.stringify(event.llm_response ?? '')
      const clean = await call('/scrub', { value: event.llm_response ?? '' })
      const after = JSON.stringify(clean.value)
      if (after === before) return undefined
      return { hookSpecificOutput: { llm_response: clean.value } }
    } catch (error) {
      console.error('[tarcza-gemini] response scrub failed', error)
      return { decision: 'deny', reason: '[tarcza] nie mogę przeskanować odpowiedzi; odrzucam chunk.' }
    }
  }

  if (name === 'BeforeAgent' && process.env.TARCZA_BLOCK_PROMPTS === '1') {
    const text = String(event.prompt ?? '')
    try {
      const clean = await call('/scrub', { text })
      if (clean.text !== text) {
        return { decision: 'deny', reason: '[tarcza] prompt zawiera sekret. Użyj placeholdera albo hooka BeforeModel.' }
      }
    } catch {
      return { decision: 'deny', reason: '[tarcza] nie mogę przeskanować promptu; nie wysyłam go.' }
    }
  }

  return undefined
}

const raw = await readStdin()
let event: any = {}
try {
  event = raw.trim() ? JSON.parse(raw) : {}
} catch (error) {
  console.error('[tarcza-gemini] invalid hook JSON', error)
  process.exit(0)
}
const result = await handle(event)
if (result !== undefined) process.stdout.write(JSON.stringify(result))
