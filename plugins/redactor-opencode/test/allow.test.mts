// The allow list has to win over the Polish layer too. Otherwise a value the
// user marked as public is still replaced by `HASLO`/`DOMENA`/`LOGIN`.
import assert from 'node:assert/strict'
import { makeConfig } from '../detect.ts'
import { scrubAll } from '../scrub.ts'
import { learnFrom, loadGlossary } from '../pl.ts'

const password = 'Test123!'
const domain = 'sellso.pl'
const login = 'adminfirma'
const client = 'Kancelaria Nowak'

const cfg = makeConfig({ allow: [password, domain, login, client].join(','), pii: true })
for (const text of [`Hasło: ${password}`, `Domena: ${domain}`, `Użytkownik: ${login}`]) {
  assert.equal(scrubAll(text, cfg), text, `allow keeps: ${text}`)
}

// Without the exception the Polish layer still hides the same values.
const strict = makeConfig({ pii: true })
assert.notEqual(scrubAll(`Hasło: ${password}`, strict), `Hasło: ${password}`)
assert.notEqual(scrubAll(`Domena: ${domain}`, strict), `Domena: ${domain}`)

// The glossary is an override too.
loadGlossary(`KLIENT: ${client}`)
assert.equal(scrubAll(client, cfg), client, 'allow keeps a glossary client')
assert.notEqual(scrubAll(client, strict), client, 'without allow the glossary hides it')

// An allowed domain also allows the address built on it.
loadGlossary(`DOMENA: ${domain}`)
const emailCfg = makeConfig({ allowEmails: `@${domain}` })
assert.equal(scrubAll(`Kontakt: jan@${domain}`, emailCfg), `Kontakt: jan@${domain}`, 'allowEmails keeps the address')
assert.notEqual(scrubAll(`Kontakt: jan@${domain}`, strict), `Kontakt: jan@${domain}`)

// A prefix rule works for a password too. Use a fresh value: a value already
// learned by an earlier strict scan in this process is hidden by the echo
// index before the prefix test can see it.
const prefixPassword = 'Prefixed123!'
const prefixCfg = makeConfig({ allowPrefixes: 'Prefixed' })
assert.equal(scrubAll(`Hasło: ${prefixPassword}`, prefixCfg), `Hasło: ${prefixPassword}`)

// An allowed value is not learned from a note, so it stays bare later.
const learnPassword = 'Learn123!'
const learnCfg = makeConfig({ allow: learnPassword })
loadGlossary('')
assert.equal(learnFrom(`Hasło: ${learnPassword}`, learnCfg), 0, 'allowed password is not learned')
assert.equal(scrubAll(learnPassword, learnCfg), learnPassword, 'allowed password stays bare')

console.log('ok  allow: password, domain, login, glossary, email and prefix')
