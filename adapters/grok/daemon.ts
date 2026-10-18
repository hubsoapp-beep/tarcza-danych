// Tarcza for Grok Build: one local process that is both an OpenAI-compatible
// proxy and the shared state for the PreToolUse/PostToolUse hooks.
//
//   Grok  --/v1/chat/completions-->  this daemon  -->  xAI / any compatible API
//
// The proxy scrubs the outbound request. The hooks call /restore and /scrub on
// the same process, so a placeholder minted for the prompt is the same one a
// tool gets restored from. Values live in memory only.
import http from 'node:http'
import { pathToFileURL } from 'node:url'
import { makeConfig, restore } from '../../plugins/redactor-opencode/detect.ts'
import { pluginOptions } from '../../plugins/redactor-opencode/config.ts'
import { scrubAll } from '../../plugins/redactor-opencode/scrub.ts'
import { loadVault } from '../../plugins/redactor-opencode/vault.ts'
import { statsReport } from '../../plugins/redactor-opencode/stats.ts'
import { ensureToken } from './token.ts'

export type DaemonOptions = {
  host?: string
  port?: number
  upstream?: string
  upstreamKey?: string
  token?: string
  options?: Record<string, unknown>
  quiet?: boolean
}

export type Daemon = {
  server: http.Server
  port: number
  token: string
  close: () => Promise<void>
}

const MAX_BODY = 60 * 1024 * 1024
const SKIP_KEY = new Set([
  'role', 'id', 'tool_call_id', 'tool_use_id', 'type', 'name', 'model', 'object',
  'finish_reason', 'created', 'index', 'stream', 'temperature', 'top_p', 'max_tokens',
])

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(text)
}

function scrubJson(value: unknown, key = ''): unknown {
  if (typeof value === 'string') return SKIP_KEY.has(key) ? value : scrubAll(value, cfg)
  if (Array.isArray(value)) return value.map((item) => scrubJson(item, key))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = scrubJson(v, k)
    return out
  }
  return value
}

function restoreJson(value: unknown, restored: string[] = []): unknown {
  if (typeof value === 'string') {
    const out = restore(value)
    if (out !== value) restored.push(out)
    return out
  }
  if (Array.isArray(value)) return value.map((item) => restoreJson(item, restored))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = restoreJson(v, restored)
    return out
  }
  return value
}

let cfg: ReturnType<typeof makeConfig>

function scrubRequest(body: any): any {
  const out = { ...body }
  if (out.messages) out.messages = scrubJson(out.messages)
  if (out.system) out.system = scrubJson(out.system)
  if (out.instructions) out.instructions = scrubJson(out.instructions)
  if (out.input) out.input = scrubJson(out.input)
  if (out.prompt) out.prompt = scrubJson(out.prompt)
  return out
}

function auth(req: http.IncomingMessage, token: string): boolean {
  const header = req.headers['x-tarcza-token']
  if (typeof header === 'string' && header === token) return true
  const bearer = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  return bearer === token
}

function upstreamHeaders(upstreamKey: string, accept: string | undefined): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (accept) headers.accept = accept
  if (upstreamKey) headers.authorization = `Bearer ${upstreamKey}`
  return headers
}

function copyHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of headers) {
    if (['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) continue
    out[key] = value
  }
  return out
}

export async function startDaemon(opts: DaemonOptions = {}): Promise<Daemon> {
  const host = opts.host ?? '127.0.0.1'
  const upstream = (opts.upstream ?? process.env.TARCZA_UPSTREAM ?? 'https://api.x.ai/v1').replace(/\/$/, '')
  const upstreamKey = opts.upstreamKey ?? process.env.TARCZA_UPSTREAM_KEY ?? process.env.XAI_API_KEY ?? ''
  const token = opts.token ?? ensureToken()
  const options = opts.options ?? {
    vaultSources: process.env.TARCZA_VAULT ?? '',
    glossaryFile: process.env.TARCZA_GLOSSARY ?? undefined,
  }
  cfg = makeConfig(pluginOptions(options))

  if (!opts.quiet) {
    try {
      const report = await loadVault(cfg, options)
      console.log(`[tarcza-grok] vault: ${report.files} files, ${report.values} values, glossary ${report.glossary}`)
    } catch (error) {
      console.error('[tarcza-grok] vault failed to load', error)
    }
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${host}`)
      const path = url.pathname

      if (path === '/health') {
        return send(res, 200, { ok: true, service: 'tarcza-grok', version: '0.1.0' })
      }
      if (!auth(req, token)) return send(res, 401, { error: 'missing or wrong tarcza token' })

      if (path === '/scrub' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req))
        if (body.value !== undefined) return send(res, 200, { value: scrubJson(body.value) })
        return send(res, 200, { text: scrubAll(String(body.text ?? ''), cfg) })
      }
      if (path === '/restore' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req))
        const restored: string[] = []
        return send(res, 200, { value: restoreJson(body.value ?? body.text ?? '', restored), restored })
      }
      if (path === '/stats') return send(res, 200, { text: statsReport() })

      if (!path.startsWith('/v1/')) return send(res, 404, { error: 'not found' })
      if (!upstreamKey) return send(res, 500, { error: 'TARCZA_UPSTREAM_KEY is not set' })

      const target = upstream + path.slice(4) + url.search
      let payload: string | undefined
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const raw = await readBody(req)
        if (raw) {
          const type = String(req.headers['content-type'] ?? '')
          if (!type.includes('application/json')) {
            return send(res, 415, { error: 'tarcza-grok: only JSON request bodies are proxied' })
          }
          try {
            payload = JSON.stringify(scrubRequest(JSON.parse(raw)))
          } catch {
            return send(res, 400, { error: 'tarcza-grok: invalid JSON, refusing to forward it unscanned' })
          }
        }
      }
      const response = await fetch(target, {
        method: req.method,
        headers: upstreamHeaders(upstreamKey, req.headers.accept),
        body: payload,
      })
      res.writeHead(response.status, copyHeaders(response.headers))
      if (response.body) for await (const chunk of response.body) res.write(chunk)
      res.end()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'proxy failed'
      console.error('[tarcza-grok]', message)
      if (!res.headersSent) send(res, 502, { error: message })
      else res.end()
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(opts.port ?? Number(process.env.TARCZA_PORT ?? 8787), host, () => resolve())
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : Number(process.env.TARCZA_PORT ?? 8787)
  if (!opts.quiet) console.log(`[tarcza-grok] listening on http://${host}:${port}; upstream ${upstream}`)

  return {
    server,
    port,
    token,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const daemon = await startDaemon()
  const stop = async () => {
    await daemon.close()
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}
