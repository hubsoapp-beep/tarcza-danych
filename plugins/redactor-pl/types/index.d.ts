// One row of the pane: a value that was hidden. The value itself is never kept;
// `masked` is its first two characters and dots.
export type Seen = { id: string; kind: string; source: string; at: string; around: string; masked: string }

declare module 'claude-code' {
  interface PluginState {
    'redactor-pl': { seen: Seen[] }
  }
}
