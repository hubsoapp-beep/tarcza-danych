// One token, one file, 0600. The daemon creates it; hooks read it. An explicit
// TARCZA_TOKEN wins, which is what the tests and a service manager use.
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const tokenPath = (): string => process.env.TARCZA_TOKEN_FILE || join(homedir(), '.tarcza', 'token')

export function readToken(): string {
  const explicit = process.env.TARCZA_TOKEN
  if (explicit) return explicit
  try {
    return readFileSync(tokenPath(), 'utf8').trim()
  } catch {
    return ''
  }
}

export function ensureToken(): string {
  const explicit = process.env.TARCZA_TOKEN
  if (explicit) return explicit
  const file = tokenPath()
  try {
    const found = readFileSync(file, 'utf8').trim()
    if (found) return found
  } catch {
    // create it below
  }
  const token = randomBytes(24).toString('hex')
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, token + '\n', { mode: 0o600 })
  return token
}
