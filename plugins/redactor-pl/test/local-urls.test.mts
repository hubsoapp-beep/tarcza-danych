// A local server link has to stay usable. Loopback and wildcard addresses are
// never infrastructure secrets; a private address is kept when it is the host
// of a URL, because otherwise `http://<ip>:8096` cannot be clicked.
import assert from 'node:assert/strict'
import { makeConfig, scrubPii, restore } from '../hooks/detect.ts'

const cfg = makeConfig({ pii: true, redactPrivateIps: true })
const keep = [
  'http://0.0.0.0:8096',
  'http://127.0.0.1:8096',
  'http://localhost:8096',
  'http://[::1]:8096',
  'http://192.168.1.10:8096',
  'http://10.0.0.5:8096/api/health',
]
for (const text of keep) assert.equal(scrubPii(text, cfg), text, `local URL kept: ${text}`)

// The same private address in prose is still hidden, and restores cleanly.
for (const text of ['192.168.1.10', '10.0.0.5']) {
  const hidden = scrubPii(text, cfg)
  assert.notEqual(hidden, text, `bare private address hidden: ${text}`)
  assert.match(hidden, /\[REDACTED-IP-[0-9a-f]{8}\]/)
  assert.equal(restore(hidden), text)
}

// A public address in a URL is still hidden.
const publicUrl = 'http://1.1.1.1:8096'
assert.notEqual(scrubPii(publicUrl, cfg), publicUrl)
assert.match(scrubPii(publicUrl, cfg), /\[REDACTED-IP-[0-9a-f]{8}\]/)

// The option can turn the URL exception off; loopback stays safe regardless.
const strict = makeConfig({ pii: true, redactPrivateIps: true, allowLocalUrls: false })
assert.notEqual(scrubPii('http://192.168.1.10:8096', strict), 'http://192.168.1.10:8096')
assert.equal(scrubPii('http://0.0.0.0:8096', strict), 'http://0.0.0.0:8096')
assert.equal(scrubPii('http://127.0.0.1:8096', strict), 'http://127.0.0.1:8096')

console.log('ok  local URLs: loopback kept, private only in URLs, prose still hidden')
