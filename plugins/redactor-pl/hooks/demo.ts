// A made-up server note for the training: every value is fake, and the numbers
// with a checksum are computed here, so the demo shows what the scan does to
// values that look real. Nothing in it belongs to a person.

const pad = (n: number, w: number): string => String(n).padStart(w, '0')

function pesel(y: number, m: number, d: number, serial: number): string {
  const base = pad(y % 100, 2) + pad(y >= 2000 ? m + 20 : m, 2) + pad(d, 2) + pad(serial, 4)
  const w = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3]
  const sum = [...base].reduce((a, c, i) => a + w[i]! * Number(c), 0)
  return base + String((10 - (sum % 10)) % 10)
}

function nip(first9: string): string {
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7]
  const s = [...first9].reduce((a, c, i) => a + w[i]! * Number(c), 0) % 11
  return s === 10 ? nip(String(Number(first9) + 1).padStart(9, '0')) : first9 + s
}

function iban(bban24: string): string {
  let rem = 0
  for (const ch of bban24 + '252100') rem = (rem * 10 + Number(ch)) % 97
  const head = 'PL' + pad(98 - rem, 2)
  return head + ' ' + bban24.match(/.{1,4}/g)!.join(' ')
}

function card(first15: string): string {
  let sum = 0
  for (let i = 0; i < first15.length; i++) {
    let x = Number(first15[first15.length - 1 - i])
    if (i % 2 === 0) {
      x *= 2
      if (x > 9) x -= 9
    }
    sum += x
  }
  return (first15 + String((10 - (sum % 10)) % 10)).match(/.{4}/g)!.join(' ')
}

export function demoNote(): string {
  const apiKey = 'sk' + '_live_' + 'Qz81LmPxT4vNw27RbYc9HdKe'
  return [
    '# Serwer biuro (DEMO, dane fałszywe)',
    '',
    'Domena: kancelaria-nowak.pl',
    'Serwer: 94.23.101.57, SSH port 822, LAN 10.20.30.40',
    'Użytkownik: marek_biuro',
    'Hasło: Zimowa13!@Zimowa13!@',
    `Klucz API: ${apiKey}`,
    '',
    'Kontakt: Jan Kowalski, tel. +48 601 234 567, jan.kowalski@kancelaria-nowak.pl',
    `PESEL klienta: ${pesel(1985, 7, 14, 2048)}`,
    `NIP kancelarii: ${nip('525224848')}`,
    `Konto do przelewów: ${iban('109010140000071219812874')}`,
    `Karta firmowa: ${card('411111111111111')}`,
    '',
    'Logowanie: ssh -p 822 marek_biuro@94.23.101.57',
  ].join('\n')
}
