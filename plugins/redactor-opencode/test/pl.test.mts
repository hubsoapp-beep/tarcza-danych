// Runs with no dependencies:
//   node --experimental-strip-types test/pl.test.mts
//
// The Polish layer (pl.ts) on fake data only. Two lists are the contract:
// HIDE (the value must be gone, the rest of the line must stay) and KEEP (the
// text must come back as it went in). Numbers with a checksum are built at run
// time, so no real PESEL, NIP or card number sits in this file.
import { makeConfig, scrubSecrets, scrubPii, mint, restore } from '../detect.ts'
import { scrubPl, loadGlossary, learnFrom, validPesel, validNip, validRegon, validIban, validLuhn, validDowod, mask } from '../pl.ts'

// A shared CI runner is slower than a laptop: stay inside the hook's 10 s budget there.
const LIMIT = process.env.CI ? 9000 : 6000
const cfg = makeConfig({ pii: true, redactPrivateIps: true })
const scrub = (t: string): string => scrubPii(scrubPl(scrubSecrets(t, cfg), cfg), cfg)
const TAG = /\[REDACTED-([A-Z]+)-[0-9a-f]{8}\]/g
const kinds = (t: string): string[] => [...t.matchAll(TAG)].map((m) => m[1]!)

let bad = 0
const fail = (msg: string): void => {
  bad++
  console.log('FAIL ' + msg)
}

// ------------------------------------------------------- numbers with a sum

const pad = (n: number, w: number): string => String(n).padStart(w, '0')
function peselOf(y: number, m: number, d: number, serial: number): string {
  const mm = y >= 2000 ? m + 20 : m
  const base = pad(y % 100, 2) + pad(mm, 2) + pad(d, 2) + pad(serial, 4)
  const w = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3]
  const sum = [...base].reduce((a, c, i) => a + w[i]! * Number(c), 0)
  return base + String((10 - (sum % 10)) % 10)
}
function nipOf(first9: string): string {
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7]
  const s = [...first9].reduce((a, c, i) => a + w[i]! * Number(c), 0) % 11
  return s === 10 ? nipOf(String(Number(first9) + 1).padStart(9, '0')) : first9 + s
}
function regonOf(first8: string): string {
  const w = [8, 9, 2, 3, 4, 5, 6, 7]
  return first8 + String(([...first8].reduce((a, c, i) => a + w[i]! * Number(c), 0) % 11) % 10)
}
function ibanOf(bban: string): string {
  const moved = bban + '2521' + '00' // PL = 25 21
  let rem = 0
  for (const ch of moved) rem = (rem * 10 + Number(ch)) % 97
  return 'PL' + pad(98 - rem, 2) + bban
}
function luhnOf(first15: string): string {
  let sum = 0
  for (let i = 0; i < first15.length; i++) {
    let x = Number(first15[first15.length - 1 - i])
    if (i % 2 === 0) {
      x *= 2
      if (x > 9) x -= 9
    }
    sum += x
  }
  return first15 + String((10 - (sum % 10)) % 10)
}
function dowodOf(letters: string, last5: string): string {
  const val = (ch: string): number => (/\d/.test(ch) ? Number(ch) : ch.charCodeAt(0) - 55)
  const w = [7, 3, 1, 7, 3]
  const sum = [...letters].reduce((a, c, i) => a + [7, 3, 1][i]! * val(c), 0) + [...last5].reduce((a, c, i) => a + w[i]! * Number(c), 0)
  return letters + String(sum % 10) + last5
}

const PESEL = peselOf(1990, 1, 1, 1234)
const PESEL2 = peselOf(2005, 11, 23, 4321)
const NIP = nipOf('525224848')
const REGON = regonOf('12345678')
const IBAN = ibanOf('109010140000071219812874')
const CARD = luhnOf('411111111111111')
const DOWOD = dowodOf('ABC', '12345')
const grouped = (s: string, n: number): string => s.match(new RegExp(`.{1,${n}}`, 'g'))!.join(' ')

for (const [name, ok] of [
  ['validPesel', validPesel(PESEL) && validPesel(PESEL2) && !validPesel(PESEL.slice(0, 10) + String((Number(PESEL[10]) + 1) % 10))],
  ['validNip', validNip(NIP) && !validNip(NIP.slice(0, 9) + String((Number(NIP[9]) + 1) % 10))],
  ['validRegon', validRegon(REGON) && !validRegon(REGON.slice(0, 8) + String((Number(REGON[8]) + 1) % 10))],
  ['validIban', validIban(IBAN) && validIban(grouped(IBAN.slice(2), 4).replace(/^/, 'PL')) && !validIban('PL00' + IBAN.slice(4))],
  ['validLuhn', validLuhn(CARD) && !validLuhn(CARD.slice(0, 15) + String((Number(CARD[15]) + 1) % 10))],
  ['validDowod', validDowod(DOWOD) && !validDowod(DOWOD.slice(0, 3) + String((Number(DOWOD[3]) + 1) % 10) + DOWOD.slice(4))],
] as const)
  if (!ok) fail(`checksum helper ${name}`)

// ----------------------------------------------------------------- HIDE

// [text, the value that must be gone, the kind it must become]
const HIDE: [string, string, string][] = [
  ['Hasło: Zimowa13!@Zimowa13!@', 'Zimowa13!@Zimowa13!@', 'HASLO'],
  ['- Hasło: Kw4rtal#2026', 'Kw4rtal#2026', 'HASLO'],
  ['**Password:** Zimowa13!@Zimowa13!@', 'Zimowa13!@Zimowa13!@', 'HASLO'],
  ['**Hasło**: Maj2026!ab', 'Maj2026!ab', 'HASLO'],
  ['| **Hasło stałe** | `z31y1fWS9tlbmGBR` |', 'z31y1fWS9tlbmGBR', 'HASLO'],
  ['Haslo: `Brzoza13!@`', 'Brzoza13!@', 'HASLO'],
  ['Wpisz haslo: "Lato2026#"', 'Lato2026#', 'HASLO'],
  ['hasło do bazy: Dr0ga!Mleczna', 'Dr0ga!Mleczna', 'HASLO'],
  ['PIN: 481516', '481516', 'HASLO'],
  [`PESEL: ${PESEL}`, PESEL, 'PESEL'],
  [`Klient (${PESEL2}) zgłosił`, PESEL2, 'PESEL'],
  [`NIP ${NIP}`, NIP, 'NIP'],
  [`NIP: ${NIP.slice(0, 3)}-${NIP.slice(3, 6)}-${NIP.slice(6, 8)}-${NIP.slice(8)}`, NIP.slice(0, 3) + '-' + NIP.slice(3, 6), 'NIP'],
  [`REGON ${REGON}`, REGON, 'REGON'],
  [`dowód: ${DOWOD}`, DOWOD, 'DOWOD'],
  [`Rachunek ${IBAN}`, IBAN, 'IBAN'],
  [`Rachunek ${'PL ' + IBAN.slice(2, 4) + ' ' + grouped(IBAN.slice(4), 4)}`, IBAN.slice(4, 8), 'IBAN'],
  [`konto ${IBAN.slice(2, 4) + ' ' + grouped(IBAN.slice(4), 4)}`, IBAN.slice(6, 10), 'IBAN'],
  [`karta ${CARD}`, CARD, 'KARTA'],
  [`płatność ${grouped(CARD, 4)} ważna do 12/29`, grouped(CARD, 4), 'KARTA'],
  ['tel. +48 601 234 567', '601 234 567', 'TEL'],
  ['zadzwoń: 601-234-567', '601-234-567', 'TEL'],
  ['kom: 601234567', '601234567', 'TEL'],
  ['dzwoń +44 20 7946 0958 jutro', '7946', 'TEL'],
  ['Użytkownik: kancelaria_user', 'kancelaria_user', 'LOGIN'],
  ['Baza: `kancelaria_wp`, użytkownik bazy `kancelaria_wp`', 'kancelaria_wp', 'LOGIN'],
  ['ssh frommilo@10.10.230.53', 'frommilo', 'LOGIN'],
  ['rsync -a plik.tgz deploy_bot@backup.klient.pl:/srv/', 'deploy_bot', 'LOGIN'],
  ['mysql --user=wp_klient1 -h localhost', 'wp_klient1', 'LOGIN'],
  ['Domena: kancelaria-nowak.pl', 'kancelaria-nowak.pl', 'DOMENA'],
  ['wp core install --domain=sklep-ala.pl', 'sklep-ala.pl', 'DOMENA'],
  ['Serwer: **mail.klient-xyz.com**', 'klient-xyz.com', 'DOMENA'],
  ['IP: 45.33.32.156', '45.33.32.156', 'IP'],
  ['LAN: 10.10.230.53', '10.10.230.53', 'IP'],
  ['pisz na jan.kowalski@kancelaria-nowak.pl', 'jan.kowalski@kancelaria-nowak.pl', 'EMAIL'],
]

for (const [text, value, kind] of HIDE) {
  const out = scrub(text)
  if (out.includes(value)) fail(`HIDE leaked  ${JSON.stringify(text)} -> ${JSON.stringify(out)}`)
  else if (!kinds(out).includes(kind)) fail(`HIDE kind ${kind} missing  ${JSON.stringify(text)} -> ${JSON.stringify(out)}`)
}

// ----------------------------------------------------------------- KEEP

const KEEP: string[] = [
  'Hasło jest ważne przez 30 dni',
  'Hasło: jak wyżej',
  'Hasło: <hasło>',
  'Hasło: NOWE_HASLO',
  'Hasło: *(puste)*',
  'Hasło: ${DB_PASSWORD}',
  'password: required',
  'password=$DB_PASS',
  'Zmień hasło w panelu: Ustawienia → Bezpieczeństwo',
  'pin: tak',
  '12345678901 to nie jest PESEL, tylko numer sprawy',
  `Unix czas ${1_760_000_000} i ${1_760_000_000_123}`,
  'zamówienie 5252248482 z dnia 2026-10-16',
  'NIP 1234567890',
  'IBAN PL00 1234 5678 9012 3456 7890 1234',
  'karta 4111 1111 1111 1112',
  'wersja 1.2.3 +48 punktów w rankingu',
  'tel: 12345',
  'ssh -i ~/.ssh/klucz root@serwer',
  'Użytkownik: root',
  'Użytkownik: admin',
  'Login: postgres',
  'Baza: MySQL',
  'Baza: tak',
  'Domena: example.com',
  'Serwer: github.com',
  'strona: https://docs.anthropic.com/pl',
  '192.168',
  'port 22 i 822',
  'git commit -m "Dodaj hasło do logowania"',
  'function hasloValid(p) { return p.length > 8 }',
]

for (const text of KEEP) {
  const out = scrub(text)
  if (out !== text) fail(`KEEP changed  ${JSON.stringify(text)} -> ${JSON.stringify(out)}`)
}

// ----------------------------------------------- the same value, everywhere

{
  const first = scrub('Hasło: Jesien2026#x')
  const bare = scrub('ssh -o PasswordAuthentication=yes admin@host  # Jesien2026#x tutaj bez etykiety')
  if (bare.includes('Jesien2026#x')) fail(`a learned password came back bare: ${bare}`)
  if (first.match(TAG)?.[0] !== bare.match(/\[REDACTED-HASLO-[0-9a-f]{8}\]/)?.[0]) fail('the same password got two placeholders')
  const out = scrub('Jesien2026#x')
  if (out.includes('Jesien2026#x')) fail('a learned password alone was not hidden')
  if (restore(first).includes('[REDACTED-')) fail('a password placeholder did not restore')
}

// ------------------------------------------------------------- the glossary

{
  const n = loadGlossary(['# klienci', 'KLIENT: Kancelaria Nowak i Wspólnicy', 'OSOBA: Jan* Kowalsk*', 'KLIENT: sklep-ala.pl', 'CIEKAWOSTKA: nic'].join('\n'))
  if (n !== 3) fail(`glossary lines: ${n}`)
  const out = scrub('Spotkanie z Janem Kowalskim w kancelaria nowak i wspólnicy, strona FRGA.PL. Jan Kowalski też.')
  for (const v of ['Kowalski', 'Kowalskim', 'Nowak', 'sklep-ala', 'SKLEP-ALA'])
    if (out.includes(v)) fail(`glossary leaked ${v}: ${out}`)
  if (!kinds(out).includes('KLIENT') || !kinds(out).includes('OSOBA')) fail(`glossary kinds: ${kinds(out)}`)
  // Polish inflects names: two spellings are two values, so two placeholders.
  const same = out.match(/\[REDACTED-OSOBA-[0-9a-f]{8}\]/g) ?? []
  if (same.length !== 2) fail(`glossary person count: ${same}`)
  loadGlossary('')
}

// -------------------------------------------------- learning from a note

{
  const note = ['## Serwer biuro', 'Użytkownik: marek_biuro', 'Hasło: Wiosna2027!Xz', 'Domena: biuro-test.pl'].join('\n')
  const n = learnFrom(note, cfg)
  if (n !== 3) fail(`learnFrom found ${n}, wanted 3`)
  const out = scrub('curl biuro-test.pl -u marek_biuro:Wiosna2027!Xz')
  for (const v of ['biuro-test.pl', 'marek_biuro', 'Wiosna2027!Xz']) if (out.includes(v)) fail(`learned ${v} came back: ${out}`)
}

// -------------------------------------------------- placeholders stay alone

{
  const tag = mint('SECRET', 'to-jest-sekretny-klucz-123456')
  const text = `Hasło: ${tag}\nTel: 601 234 567 i ${tag}`
  const out = scrub(text)
  if ((out.match(new RegExp(tag.replace(/[[\]]/g, '\\$&'), 'g')) ?? []).length !== 2) fail(`an existing placeholder was changed: ${out}`)
}

// ------------------------------------------------------------------ mask

if (mask('Zimowa13!@') !== 'Zi••••••••' || mask('abc') !== '•••') fail(`mask: ${mask('Zimowa13!@')} ${mask('abc')}`)

// ----------------------------------------------------------------- timing

{
  const line = 'Lorem ipsum dolor sit amet, hasło do bazy to nie tu, tel jutro, 12345 67890.\n'
  const text = line.repeat(Math.floor(4_000_000 / line.length))
  const t0 = performance.now()
  scrubPl(text, cfg)
  const ms = Math.round(performance.now() - t0)
  console.log(`time  4.0 MB of prose  ${ms} ms`)
  if (ms > LIMIT) fail(`SLOW  ${ms} ms`)
  const digits = '1234567890 '.repeat(400_000)
  const t1 = performance.now()
  scrubPl(digits, cfg)
  const ms1 = Math.round(performance.now() - t1)
  console.log(`time  4.4 MB of digits  ${ms1} ms`)
  if (ms1 > LIMIT) fail(`SLOW digits ${ms1} ms`)
}

console.log(bad === 0 ? `ok  ${HIDE.length} hidden, ${KEEP.length} kept, glossary, learning, placeholders intact` : `${bad} failure(s)`)
if (bad > 0) process.exitCode = 1
