// Generic OpenAI-compatible proxy for agents without model hooks.
// The same shared daemon also serves /scrub, /restore and /stats for the
// Qwen/Claude-style PreToolUse hooks.
import { startDaemon } from '../shared/daemon.ts'

const daemon = await startDaemon()
const stop = async () => {
  await daemon.close()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
