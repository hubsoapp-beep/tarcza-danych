// The vault from notes and the glossary, on a temporary directory. Nothing in
// it is real.
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeConfig } from '../detect.ts'
import { loadVault } from '../vault.ts'
import { scrubAll } from '../scrub.ts'

const dir = await mkdtemp(join(tmpdir(), 'tarcza-vault-'))
try {
  const notes = join(dir, 'serwery.txt')
  const glossary = join(dir, 'slownik.txt')
  await writeFile(
    notes,
    ['Hasło: Test123!', 'Użytkownik: adminfirma', 'Domena: firma-przyklad.pl', 'E-mail: biuro@firma-przyklad.pl'].join('\n'),
  )
  await writeFile(glossary, ['KLIENT: Kancelaria Nowak', 'OSOBA: Jan* Kowalsk*'].join('\n'))

  const cfg = makeConfig({ vaultSources: notes, glossaryFile: glossary })
  const report = await loadVault(cfg, { vaultSources: notes, glossaryFile: glossary })
  assert.equal(report.files, 1, 'one note file read')
  assert.ok(report.values >= 3, 'the note taught at least a password, a login and a domain')
  assert.equal(report.glossary, 2, 'two glossary entries')

  const bare = 'Test123! adminfirma firma-przyklad.pl biuro@firma-przyklad.pl Kancelaria Nowak Jan Kowalski'
  const hidden = scrubAll(bare, cfg)
  for (const value of ['Test123!', 'adminfirma', 'firma-przyklad.pl', 'biuro@firma-przyklad.pl', 'Kancelaria Nowak', 'Jan Kowalski']) {
    assert.ok(!hidden.includes(value), `vault hides ${value} without a label`)
  }
  assert.match(hidden, /\[REDACTED-(?:HASLO|LOGIN|DOMENA|EMAIL|KLIENT|OSOBA)-[0-9a-f]{8}\]/)
  console.log('ok  vault: notes, glossary and bare values')
} finally {
  await rm(dir, { recursive: true, force: true })
}
