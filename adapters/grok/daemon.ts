// The daemon is shared by every adapter. Grok uses the same /scrub and
// /restore endpoints as Gemini; only the proxy path is Grok-specific.
export { startDaemon, type DaemonOptions, type Daemon } from '../shared/daemon.ts'
