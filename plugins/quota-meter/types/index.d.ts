export type Window = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'quota-meter': { windows: Window[]; isHidden: boolean }
  }
}
