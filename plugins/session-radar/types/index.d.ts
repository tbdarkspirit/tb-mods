export type RadarState = 'working' | 'waiting' | 'permission' | 'idle'

/** One session as the hub lists it. */
export type Remote = {
  id: string
  machine: string
  project: string
  title: string
  detail: string
  /** claude.ai URL when Remote Control is on, else '' */
  url: string
  /** mod version on that machine */
  version: string
  state: RadarState
  /** seconds in the current state, at the last poll */
  ageSec: number
  isStale: boolean
}

export type Radar = { sessions: Remote[]; error: string | null; selfId: string }

declare module 'claude-code' {
  interface PluginState {
    'session-radar': { radar: Shaped<Radar>; isBandHidden: boolean }
  }
}
