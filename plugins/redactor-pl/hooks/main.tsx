// A plugin names one hooks module, so this one calls the two halves: the
// redactor (vendored from transcript-redactor, with the Polish layer) and the
// pane that shows what it hid.
import type { Register } from 'claude-code'

import { register as registerRedactor } from './redact.ts'
import { register as registerPane } from './pane.tsx'

export const register: Register = (on, options) => {
  registerRedactor(on, options)
  registerPane(on, options)
}
