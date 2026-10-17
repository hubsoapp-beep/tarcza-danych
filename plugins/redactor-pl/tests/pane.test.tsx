import { expect, test } from 'claude-code/testing'

// The pane, drawn after real hooks have run: a fake key is built at run time
// so no key-shaped string sits in the repo.
const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
let body = ''
for (let i = 0; i < 40; i++) body += abc[(i * 7 + 3) % abc.length]
const KEY = 's' + 'k-ant-api03-' + body + 'Q7z'

const mount = ($: any) =>
  $.ui.mount({
    plugin: 'redactor-pl',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'redactor-pl',
    props: { title: 'Tarcza danych', isFocused: true, bodyColumns: 48, placement: 'dock' } as never,
  })

test('redactor-pl: the pane is empty before anything is hidden', async ($, on) => {
  on('ui.notice', () => ({ value: undefined }))
  const ui = await mount($)
  expect(await ui.find({ type: 'Text', text: /Nic jeszcze nie podmieniono/ } as never)).toBeDefined()
})

test('redactor-pl: the pane counts what was hidden and never shows the value', async ($, on) => {
  on('ui.notice', () => ({ value: undefined }))
  on('tool.call', () => ({ result: `token is ${KEY}\nlogin: root` }))
  await $.tool.call({ tool: 'Bash', command: 'cat key.txt' } as never)
  const ui = await mount($)
  expect(await ui.find({ type: 'Text', text: /Ukryto \d+ (wartość|wartości) przed AI/ } as never)).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /narzędzie Bash/ } as never)).toBeDefined()
  const tree = JSON.stringify(await ui.find({ type: 'Box' } as never))
  expect(tree).not.toContain(KEY)
})

test('redactor-pl: /redact-demo fills the pane', async ($, on) => {
  on('ui.notice', () => ({ value: undefined }))
  const r: any = await $.command.run({ command: 'redact-demo', args: '' } as never)
  expect(String(r?.text)).toContain('PO (to dostaje AI)')
  const ui = await mount($)
  expect(await ui.find({ type: 'Text', text: /pokaz \/redact-demo/ } as never)).toBeDefined()
})
