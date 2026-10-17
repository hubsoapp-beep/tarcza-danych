// The Polish layer of redactor-pl. Pure: no `$`, no hooks, so the tests run it
// under plain node. It runs after the upstream scan (detect.ts), on text that
// may already hold `[REDACTED-...]` placeholders, and hides what upstream does
// not know:
//
//   - passwords written by a human behind a Polish or English label
//     (`Hasło:`, `**Password:**`, a table cell, a quoted value), whatever their
//     entropy;
//   - Polish personal data, each one checked by its own checksum so a random
//     number is left alone: PESEL, NIP, REGON, dowód, IBAN, a card (Luhn), a phone;
//   - infrastructure: logins, database accounts, domains named by a label;
//   - the glossary (`KLIENT: sklep-ala.pl`) and every value learned from notes.
//
// A value hidden once is hidden again wherever it turns up in the session.

import { mint, keepSecret, type Config, type Kind } from './detect.ts'

// ------------------------------------------------------------------- state

type Rule = { kind: Kind; source: string; re: RegExp }

const glossary: Rule[] = []
// value -> kind, for everything learned (labelled passwords, logins, domains)
const known = new Map<string, Kind>()
let knownRe: RegExp | null = null
const KNOWN_CAP = 600

const TAGS = /\[REDACTED-[A-Z]+-[0-9a-f]{8}\]/g

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// A value learned from a note: hidden everywhere from now on, even bare.
export function learn(kind: Kind, value: string): void {
  if (value.length < 4 || known.has(value) || known.size >= KNOWN_CAP) return
  known.set(value, kind)
  knownRe = null
}

export function knownCount(): number {
  return known.size
}

function knownRegex(): RegExp | null {
  if (known.size === 0) return null
  if (knownRe) return knownRe
  const values = [...known.keys()].sort((a, b) => b.length - a.length).map(esc)
  // A known domain right after `name@` takes the whole address with it.
  knownRe = new RegExp(`(?:(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@)?(?<![\\p{L}\\d])(?:${values.join('|')})(?![\\p{L}\\d])`, 'gu')
  return knownRe
}

// A glossary line is `KIND: value`. `*` after a word stands for any letters
// (`Kowalsk*` takes Kowalski, Kowalskiego, Kowalskim). `#` starts a comment.
const GLOSSARY_KINDS = new Set<string>(['KLIENT', 'OSOBA', 'DOMENA', 'LOGIN', 'HASLO', 'TEL', 'EMAIL', 'IP', 'SECRET'])

export function loadGlossary(text: string): number {
  glossary.length = 0
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/(^|\s)#.*$/, '').trim()
    const m = line.match(/^([A-Za-z]+)[ \t]*:[ \t]*(.+)$/)
    if (!m) continue
    const kind = m[1]!.toUpperCase()
    const value = m[2]!.trim()
    if (!GLOSSARY_KINDS.has(kind) || value.length < 3) continue
    const source = esc(value).replace(/\\\*/g, '\\p{L}*').replace(/[ \t]+/g, '[ \\t]+')
    glossary.push({ kind: kind as Kind, source, re: new RegExp(`(?<![\\p{L}\\d])${source}(?![\\p{L}\\d])`, 'giu') })
  }
  return glossary.length
}

export function glossaryCount(): number {
  return glossary.length
}

// -------------------------------------------------------------- validators

const digitsOf = (s: string): number[] => [...s.replace(/\D/g, '')].map(Number)

export function validPesel(s: string): boolean {
  if (!/^\d{11}$/.test(s)) return false
  const d = digitsOf(s)
  const w = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3]
  const sum = w.reduce((a, x, i) => a + x * d[i]!, 0)
  if ((10 - (sum % 10)) % 10 !== d[10]) return false
  const mm = d[2]! * 10 + d[3]!
  const dd = d[4]! * 10 + d[5]!
  const month = mm % 20
  return mm >= 1 && month >= 1 && month <= 12 && dd >= 1 && dd <= 31 && Math.floor(mm / 20) <= 4
}

export function validNip(s: string): boolean {
  const d = digitsOf(s)
  if (d.length !== 10) return false
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7]
  const sum = w.reduce((a, x, i) => a + x * d[i]!, 0) % 11
  return sum !== 10 && sum === d[9]
}

export function validRegon(s: string): boolean {
  const d = digitsOf(s)
  if (d.length === 9) {
    const w = [8, 9, 2, 3, 4, 5, 6, 7]
    return (w.reduce((a, x, i) => a + x * d[i]!, 0) % 11) % 10 === d[8]
  }
  if (d.length === 14) {
    const w = [2, 4, 8, 5, 0, 9, 7, 3, 6, 1, 2, 4, 8]
    return (w.reduce((a, x, i) => a + x * d[i]!, 0) % 11) % 10 === d[13]
  }
  return false
}

// Three letters, a check digit, five digits.
export function validDowod(s: string): boolean {
  const c = s.replace(/\s/g, '').toUpperCase()
  if (!/^[A-Z]{3}\d{6}$/.test(c)) return false
  const v = [...c].map((ch) => (/\d/.test(ch) ? Number(ch) : ch.charCodeAt(0) - 55))
  const w = [7, 3, 1, 0, 7, 3, 1, 7, 3]
  const sum = w.reduce((a, x, i) => a + x * v[i]!, 0)
  return sum % 10 === v[3]
}

export function validIban(s: string): boolean {
  const c = s.replace(/\s/g, '').toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(c)) return false
  if (c.startsWith('PL') && c.length !== 28) return false
  const moved = c.slice(4) + c.slice(0, 4)
  let rem = 0
  for (const ch of moved) {
    const n = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55)
    for (const digit of n) rem = (rem * 10 + Number(digit)) % 97
  }
  return rem === 1
}

export function validLuhn(s: string): boolean {
  const d = digitsOf(s)
  if (d.length < 13 || d.length > 19) return false
  let sum = 0
  for (let i = 0; i < d.length; i++) {
    let x = d[d.length - 1 - i]!
    if (i % 2 === 1) {
      x *= 2
      if (x > 9) x -= 9
    }
    sum += x
  }
  return sum % 10 === 0
}

// ----------------------------------------------------------------- helpers

const STAND_IN_WORDS =
  /^(?:x{2,}|\.{2,}|…|brak|puste|pusty|none|null|nil|tak|nie|jak|wy[żz]ej|powy[żz]ej|ukryte|ukryt[ae]|zmienione|zmie[ńn]|ustaw|wymagane|required|hidden|secret|password|has[łl]o|has[łl]a|your[-_ ]?\w*|nowe[-_ ]?has[łl]o|new[-_ ]?password|true|false|string|text|todo|tbd|n\/a)$/i

const GENERIC_LOGINS = new Set([
  'root', 'admin', 'administrator', 'ubuntu', 'debian', 'user', 'users', 'test', 'guest', 'postgres', 'mysql', 'git', 'pi', 'www-data',
  'username', 'login', 'ec2-user', 'opc', 'nobody', 'none', 'null', 'tak', 'nie', 'brak', 'mysql', 'mariadb', 'sqlite', 'mongodb', 'redis',
  'localhost', 'wordpress', 'wp', 'cpanel', 'whm', 'ssh', 'ftp', 'str', 'string', 'int', 'bool', 'boolean', 'any', 'object', 'number', 'optional', 'required', 'undefined', 'email', 'async', 'function', 'await', 'new', 'class', 'def', 'return', 'lambda', 'type', 'name', 'id', 'true', 'false', 'read', 'write', 'delete', 'list', 'info', 'all', 'self', 'current', 'npx', 'npm',
])

// Names that stand for a real one in a how-to: `uzytkownik_bazy`, `nazwa_bazy`.
const TUTORIAL_NAME = /^(?:nazwa|u[żz]ytkownik|username|user|login|dbuser|db[_-]?user|ftpuser|przyk[łl]ad|example|tw[oó]j|moj|m[oó]j|nowy|nowe|stary|twoja|moja)(?:[_-]|$)|^nazwa[a-z]+$|^[a-z]+(?:[_-]?)(?:bazy|uzytkownika|użytkownika)$/i
const TUTORIAL_DOMAIN = /^(?:www\.)?(?:example|domena|subdomena|twoja-?domena|moja-?domena|przyklad|domain|yourdomain|test)\./i

const PUBLIC_DOMAINS = new Set([
  'github.com', 'githubusercontent.com', 'google.com', 'npmjs.org', 'npmjs.com', 'anthropic.com', 'claude.ai', 'claude.com', 'openai.com',
  'localhost', 'example.com', 'example.org', 'example.net', 'wikipedia.org', 'cloudflare.com', 'docker.com', 'ubuntu.com', 'debian.org',
  'mozilla.org', 'microsoft.com', 'apple.com', 'amazon.com', 'amazonaws.com', 'stackoverflow.com', 'wordpress.org', 'nodejs.org',
])

const insideTag = (ranges: [number, number][], at: number, end: number): boolean => ranges.some(([a, b]) => at < b && end > a)

function isStandIn(v: string): boolean {
  if (v.includes('[REDACTED-')) return true
  if (/^[$<{%*~/]|^\.\.?\//.test(v) || v.includes('://')) return true
  if (STAND_IN_WORDS.test(v)) return true
  // an environment variable or a placeholder name: NOWE_HASLO, DB_PASSWORD
  if (/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(v) || /^[A-Z_]+$/.test(v)) return true
  if (/^<.*>$/.test(v) || /^\(.*\)$/.test(v)) return true
  // code: a call `readPin(x)`, a property `item.pin`, an arrow `=>`
  if (/^[A-Za-z_$][\w$.]*\(/.test(v) || /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(v) || v.includes('=>')) return true
  return false
}

// Bare values need some sign of being a password: a digit, a symbol, or mixed
// case. A plain lower-case word after `hasło:` is more often prose.
function humanSecret(v: string): boolean {
  return /\d/.test(v) || /[^\p{L}\d]/u.test(v) || (v.length >= 8 && /\p{Ll}/u.test(v) && /\p{Lu}/u.test(v.slice(1)))
}

function trimEnd(v: string): string {
  return v.replace(/[)\]},;.'"]+$/, '')
}

// -------------------------------------------------------------- detectors

type Hit = { start: number; end: number; kind: Kind }

const BT = '`'
const PW_LABEL = String.raw`(?:has[łl]o|has[łl]a|passw(?:or)?d|passphrase|password|pwd|pin|kod[ \t]+(?:pin|dost[eę]pu))`
// A pipe counts only as a table cell border, with a space before it.
const SEP = String.raw`\*{0,2}_?(?:[ \t]*[:=]|[ \t]+\|)\*{0,2}[ \t]*`
const LABEL_WORDS = String.raw`(?:[ \t]+[\p{L}\d_-]{1,20}){0,2}`
const PW_RE = new RegExp(
  String.raw`(?<![\p{L}\d_])\*{0,2}_?${PW_LABEL}${LABEL_WORDS}${SEP}(?:` +
    String.raw`${BT}([^${BT}\n]{3,200})${BT}|"([^"\n]{3,200})"|'([^'\n]{3,200})'|“([^”\n]{3,200})”|([^\s${BT}"'|“”]{3,200}))`,
  'giu',
)
const PW_HINT = /has[łl]|passw|pwd|pin|kod/i

function passwords(text: string, out: Hit[]): void {
  if (!PW_HINT.test(text)) return
  for (const m of text.matchAll(PW_RE)) {
    const quoted = m[1] ?? m[2] ?? m[3] ?? m[4]
    let value = quoted ?? m[5]
    if (value === undefined) continue
    // `pin=True),` is code: judge the value without the punctuation that closes it.
    if (quoted === undefined) value = trimEnd(value)
    if (value.length < 3 || isStandIn(value)) continue
    if (quoted === undefined && !humanSecret(value)) continue
    const start = (m.index ?? 0) + m[0].lastIndexOf(value)
    out.push({ start, end: start + value.length, kind: 'HASLO' })
  }
}

const PESEL_RE = /(?<![\d-])\d{11}(?![\d-])/g
const NIP_RAW = /(?<![\d-])(?:PL[ \t]?)?(\d{10})(?![\d-])/g
const NIP_DASHED = /(?<![\d-])(?:\d{3}-\d{3}-\d{2}-\d{2}|\d{3}-\d{2}-\d{2}-\d{3}|\d{3} \d{3} \d{2} \d{2})(?![\d-])/g
const REGON_RE = /(?<![\d-])(\d{9}|\d{14})(?![\d-])/g
const DOWOD_RE = /(?<![\p{L}\d])[A-Z]{3}[ ]?\d{6}(?![\d])/gu
const IBAN_RE = /(?<![A-Za-z0-9])[A-Z]{2}[ ]?\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?(?![A-Za-z0-9])/g
const PL_ACCOUNT = /(?<![\d-])\d{2}(?:[ ]?\d{4}){6}(?![\d-])/g
const CARD_RE = /(?<![\d-])(?:\d{4}[ -]){3}\d{3,4}(?![\d-])|(?<![\d-])\d{13,19}(?![\d-])/g
const PHONE_PL = /(?<![\w+])(?:\+48|0048)[ -]?(?:\d{3}[ -]?\d{3}[ -]?\d{3}|\d{2}[ -]?\d{3}[ -]?\d{2}[ -]?\d{2})(?![\d])/g
const PHONE_GROUPED = /(?<![\d+-])[4-9]\d{2}[ -]\d{3}[ -]\d{3}(?![\d-])/g
const PHONE_INTL = /(?<![\w+])\+(?!48)\d{1,3}[ -]?(?:\(?\d{1,4}\)?[ -]?){2,4}\d{2,4}(?![\d])/g
const PHONE_LABELLED =
  /(?:tel(?:efon)?\.?|kom(?:\.|[óo]rka)?|mobile|phone|whatsapp|fax)[ \t]*[:=]?[ \t]*(\d{9})(?![\d-])/gi

const before = (text: string, at: number, n = 28): string => text.slice(Math.max(0, at - n), at)

function personal(text: string, out: Hit[]): void {
  if (!/\d/.test(text)) return
  const has = (re: RegExp, at: number, n?: number): boolean => re.test(before(text, at, n))

  for (const m of text.matchAll(PESEL_RE)) {
    const at = m.index ?? 0
    if (validPesel(m[0]) || (has(/pesel/i, at) && /^\d{11}$/.test(m[0]))) out.push({ start: at, end: at + 11, kind: 'PESEL' })
  }
  for (const m of text.matchAll(NIP_DASHED)) {
    const at = m.index ?? 0
    if (validNip(m[0])) out.push({ start: at, end: at + m[0].length, kind: 'NIP' })
  }
  for (const m of text.matchAll(NIP_RAW)) {
    const at = m.index ?? 0
    if ((has(/nip|vat/i, at) || m[0].startsWith('PL')) && validNip(m[1]!)) out.push({ start: at, end: at + m[0].length, kind: 'NIP' })
  }
  for (const m of text.matchAll(REGON_RE)) {
    const at = m.index ?? 0
    if (has(/regon/i, at) && validRegon(m[0])) out.push({ start: at, end: at + m[0].length, kind: 'REGON' })
  }
  for (const m of text.matchAll(DOWOD_RE)) {
    const at = m.index ?? 0
    if (has(/dow[óo]d|dow\.|seria|id[ \t]*card|legitymacj/i, at, 40) && validDowod(m[0])) out.push({ start: at, end: at + m[0].length, kind: 'DOWOD' })
  }
  for (const m of text.matchAll(IBAN_RE)) {
    const at = m.index ?? 0
    if (validIban(m[0])) out.push({ start: at, end: at + m[0].length, kind: 'IBAN' })
  }
  for (const m of text.matchAll(PL_ACCOUNT)) {
    const at = m.index ?? 0
    if (validIban('PL' + m[0])) out.push({ start: at, end: at + m[0].length, kind: 'IBAN' })
  }
  for (const m of text.matchAll(CARD_RE)) {
    const at = m.index ?? 0
    const grouped = /[ -]/.test(m[0])
    const iin = /^(?:4\d{12}(?:\d{3})?(?:\d{3})?|5[1-5]\d{14}|2(?:2[2-9]|[3-6]\d|7[01])\d{12}|3[47]\d{13}|6(?:011|5\d{2})\d{12}|35\d{14}|62\d{14,17})$/.test(m[0])
    const labelled = has(/kart|card|visa|master|amex|\bcc\b|\bpan\b/i, at, 40)
    if ((grouped || iin || labelled) && validLuhn(m[0])) out.push({ start: at, end: at + m[0].length, kind: 'KARTA' })
  }
  for (const re of [PHONE_PL, PHONE_GROUPED, PHONE_INTL]) {
    for (const m of text.matchAll(re)) {
      const at = m.index ?? 0
      const digits = m[0].replace(/\D/g, '').length
      if (digits >= 9 && digits <= 14) out.push({ start: at, end: at + m[0].length, kind: 'TEL' })
    }
  }
  for (const m of text.matchAll(PHONE_LABELLED)) {
    const at = (m.index ?? 0) + m[0].lastIndexOf(m[1]!)
    out.push({ start: at, end: at + 9, kind: 'TEL' })
  }
}

// The value ends the phrase: `Login: npx surge login` is a command, not a login.
const LOGIN_VALUE = String.raw`${BT}?([A-Za-z0-9_.-]{3,64})(?:${BT}|(?=[ \t]*(?:$|[,;.)(|*])))`
// `Login: x` or `user=x` (no spaces): a colon or pipe, or an `=` that touches the
// label. `const login = async` and `user: str` are code.
const LOGIN_SEP = String.raw`\*{0,2}_?(?:[ \t]*:|[ \t]+\||=)\*{0,2}[ \t]*`
const LOGIN_LABEL = new RegExp(
  String.raw`(?<![\p{L}\d_])\*{0,2}(?:u[żz]ytkownik(?:[ \t]+(?:bazy|ssh|ftp|systemu))?|login|user(?:name)?|konto)${LOGIN_SEP}${LOGIN_VALUE}`,
  'gimu',
)
const LOGIN_SPACED = /(?<![\p{L}\d_])u[żz]ytkownik(?:[ \t]+(?:bazy|ssh|ftp))?[ \t]+`([^`\n]{2,64})`/giu
const DB_LABEL = new RegExp(
  String.raw`(?<![\p{L}\d_])\*{0,2}(?:baza(?:[ \t]+danych)?|database|db[_-]?name|dbname|db[_-]?user|dbuser)${LOGIN_SEP}${LOGIN_VALUE}`,
  'gimu',
)
const LOGIN_FLAG = /(?<![\w-])--(?:user|username|dbuser|db-user|db_user)(?:=|[ \t]+)["']?([A-Za-z0-9_.-]{3,64})/g
const LOGIN_AT_IP = /(?<![\w.@-])([A-Za-z_][\w.-]{1,31})@(?=(?:\d{1,3}\.){3}\d{1,3}(?![\d.]))/g
const LOGIN_SSH = /\b(?:ssh|scp|sftp|rsync|sshpass)\b[^\n]*?[ \t=]([A-Za-z_][\w.-]{1,31})@(?=(?:\d{1,3}\.){3}\d|[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}|[A-Za-z0-9-]+:)/g
const USER_HINT = /u[żz]ytkownik|login|user|konto|baza|database|db[_-]?name|dbname|dbuser|@|ssh|scp|sftp|rsync/i

function logins(text: string, out: Hit[]): void {
  if (!USER_HINT.test(text)) return
  const push = (m: RegExpMatchArray, value: string, strict: boolean): void => {
    const v = value.trim()
    if (v.includes('@') || isStandIn(v) || GENERIC_LOGINS.has(v.toLowerCase()) || TUTORIAL_NAME.test(v)) return
    if (strict && !/[_\d-]/.test(v)) return
    const start = (m.index ?? 0) + m[0].lastIndexOf(v)
    out.push({ start, end: start + v.length, kind: 'LOGIN' })
  }
  for (const m of text.matchAll(LOGIN_LABEL)) push(m, m[1]!, false)
  for (const m of text.matchAll(LOGIN_SPACED)) push(m, m[1]!, false)
  for (const m of text.matchAll(DB_LABEL)) push(m, m[1]!, true)
  for (const m of text.matchAll(LOGIN_FLAG)) push(m, m[1]!, false)
  for (const m of text.matchAll(LOGIN_AT_IP)) push(m, m[1]!, false)
  for (const m of text.matchAll(LOGIN_SSH)) push(m, m[1]!, false)
}

// A host name has a TLD from this list: `location.hostname` or `config.host` is code.
const TLDS =
  'pl|com|eu|net|org|io|dev|app|info|biz|cloud|xyz|co|uk|de|fr|it|es|nl|cz|sk|ru|ua|us|ca|ai|me|tv|site|online|store|shop|pro|tech|work|email|systems|agency|studio|digital|media|solutions|services|top|club|ltd|sh|cc'
const HOST_PART = String.raw`(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:${TLDS})`
const DOMAIN_LABEL = new RegExp(
  String.raw`(?<![\p{L}\d_])\*{0,2}(?:domena|domain|host(?:name)?|serwer|server|strona|witryna|site|www|adres[ \t]+strony)\*{0,2}[ \t]*[:|]\*{0,2}[ \t]*\*{0,2}${BT}?(?:https?:\/\/)?(${HOST_PART})(?![\w-])`,
  'giu',
)
const DOMAIN_FLAG = new RegExp(String.raw`(?<![\w-])(?:--domain=|domain=|--host=|--hostname=)["']?(${HOST_PART})(?![\w-])`, 'gi')
const DOMAIN_HINT = /domen|domain|host|serwer|server|strona|witryna|site|www/i

function domains(text: string, out: Hit[]): void {
  if (!DOMAIN_HINT.test(text)) return
  for (const re of [DOMAIN_LABEL, DOMAIN_FLAG]) {
    for (const m of text.matchAll(re)) {
      const v = m[1]!
      const low = v.toLowerCase()
      if (TUTORIAL_DOMAIN.test(low) || PUBLIC_DOMAINS.has(low) || [...PUBLIC_DOMAINS].some((d) => low.endsWith('.' + d))) continue
      const start = (m.index ?? 0) + m[0].toLowerCase().lastIndexOf(low)
      out.push({ start, end: start + v.length, kind: 'DOMENA' })
    }
  }
}

// ------------------------------------------------------------------ driver

const LEARN_KINDS = new Set<Kind>(['HASLO', 'LOGIN', 'DOMENA'])

function findHits(text: string, cfg: Config): Hit[] {
  const out: Hit[] = []
  passwords(text, out)
  if (cfg.plPersonal) personal(text, out)
  if (cfg.plInfra && cfg.plLogins) logins(text, out)
  if (cfg.plInfra && cfg.plDomains) domains(text, out)
  return out
}

function overlapFree(hits: Hit[], tagRanges: [number, number][]): Hit[] {
  const sorted = hits
    .filter((h) => !insideTag(tagRanges, h.start, h.end))
    .sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))
  const kept: Hit[] = []
  let edge = -1
  for (const h of sorted) {
    if (h.start < edge) continue
    kept.push(h)
    edge = h.end
  }
  return kept
}

function tagRangesOf(text: string): [number, number][] {
  if (!text.includes('[REDACTED-')) return []
  return [...text.matchAll(TAGS)].map((m) => [m.index ?? 0, (m.index ?? 0) + m[0].length])
}

// A value hidden by label becomes a known value: hidden wherever it turns up.
function hide(kind: Kind, value: string): string {
  const tag = mint(kind, value)
  // A value is learned only when it is unlikely to be a plain word: one false
  // hit on `True` must not hide every `True` that follows.
  if (LEARN_KINDS.has(kind) && value.length >= 6 && (kind === 'DOMENA' || humanSecret(value) || /^[\p{L}]{6,}$/u.test(value) && kind === 'LOGIN')) {
    learn(kind, value)
    if (kind === 'HASLO' && value.length >= 8) keepSecret(value)
  }
  return tag
}

// `passwordsOnly`: the text is context the model needs to work with (CLAUDE.md,
// a changed file's diff), so only passwords go; logins, domains, people and
// numbers stay readable there.
function applyKnown(text: string, passwordsOnly: boolean): string {
  let out = text
  if (!passwordsOnly) {
    for (const rule of glossary) {
      rule.re.lastIndex = 0
      if (rule.re.test(out)) out = out.replace(rule.re, (m) => mint(rule.kind, m))
    }
  }
  const re = knownRegex()
  if (re) {
    re.lastIndex = 0
    out = out.replace(re, (m) => {
      const at = m.lastIndexOf('@')
      if (at > 0 && known.get(m.slice(at + 1)) === 'DOMENA') return passwordsOnly ? m : mint('EMAIL', m)
      const kind = known.get(m) ?? 'HASLO'
      return passwordsOnly && kind !== 'HASLO' ? m : mint(kind, m)
    })
  }
  return out
}

export function scrubPl(text: string, cfg: Config, passwordsOnly = false): string {
  if (!cfg.pl || text.length < 6) return text
  let out = applyKnown(text, passwordsOnly)
  const found = findHits(out, cfg)
  const hits = overlapFree(passwordsOnly ? found.filter((h) => h.kind === 'HASLO') : found, tagRangesOf(out))
  if (hits.length === 0) return out
  const parts: string[] = []
  let last = 0
  for (const h of hits) {
    parts.push(out.slice(last, h.start), hide(h.kind, out.slice(h.start, h.end)))
    last = h.end
  }
  parts.push(out.slice(last))
  out = parts.join('')
  return out
}

// What a note would teach the session, without changing the text: used at
// session start to fill the vault from the files the user named.
export function learnFrom(text: string, cfg: Config): number {
  const tags = tagRangesOf(text)
  let n = 0
  for (const h of overlapFree(findHits(text, cfg), tags)) {
    if (!LEARN_KINDS.has(h.kind)) continue
    hide(h.kind, text.slice(h.start, h.end))
    n++
  }
  return n
}

// A masked preview for the pane: never the whole value.
export function mask(value: string): string {
  if (value.length <= 4) return '•'.repeat(value.length)
  return value.slice(0, 2) + '•'.repeat(Math.min(10, value.length - 2))
}
