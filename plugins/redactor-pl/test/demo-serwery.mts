// Prints the made-up server note used in the training:
//   node --experimental-strip-types test/demo-serwery.mts > /tmp/demo-serwer.md
// Then, in Claude Code: "cat /tmp/demo-serwer.md i powtórz mi wartości".
import { demoNote } from '../hooks/demo.ts'

console.log(demoNote())
