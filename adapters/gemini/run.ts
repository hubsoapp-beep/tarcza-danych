// Gemini does not use the proxy endpoint; it only needs the shared state
// behind /scrub, /restore and /stats.
import { startDaemon } from '../shared/daemon.ts'

const daemon = await startDaemon()
const stop = async () => {
  await daemon.close()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
