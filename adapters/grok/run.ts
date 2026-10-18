// Entry point for `npm run daemon`. The shared module only exports the server.
import { startDaemon } from '../shared/daemon.ts'

const daemon = await startDaemon()
const stop = async () => {
  await daemon.close()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
