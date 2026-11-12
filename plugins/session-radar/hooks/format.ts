import type { RadarState, Remote } from '../types'

export const ICON: Record<RadarState, string> = { waiting: '●', permission: '◆', working: '◐', idle: '○' }
export const LABEL: Record<RadarState, string> = {
  waiting: 'attend ta réponse',
  permission: 'attend une autorisation',
  working: 'en cours',
  idle: 'inactive',
}
export const COLOR: Record<RadarState, 'warning' | 'error' | 'success' | 'subtle'> = {
  waiting: 'warning',
  permission: 'error',
  working: 'success',
  idle: 'subtle',
}

export const needsMe = (s: Remote) => !s.isStale && (s.state === 'waiting' || s.state === 'permission')

export const ago = (sec: number) => {
  const m = Math.floor(sec / 60)
  if (m < 1) return "à l'instant"
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h${String(m % 60).padStart(2, '0')}`
  return `${Math.floor(h / 24)}j`
}

export const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, Math.max(1, n - 1)) + '…')

export const where = (s: Remote) => `${s.machine} · ${s.project || '?'}`

/** Waiting first, then permission, working, idle; stale last; most recent first inside. */
export const sortRemotes = (list: readonly Remote[]) => {
  const rank: Record<RadarState, number> = { permission: 0, waiting: 1, working: 2, idle: 3 }
  return [...list].sort(
    (a, b) => Number(a.isStale) - Number(b.isStale) || rank[a.state] - rank[b.state] || a.ageSec - b.ageSec,
  )
}

export const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path

export const firstLine = (text: string) =>
  text.split('\n').map(l => l.replace(/[#*`>_]/g, '').trim()).find(l => l.length > 0) ?? ''

/** Le dernier titre posé dans un transcript : un renommage (custom-title) l'emporte sur le titre généré (ai-title). */
export const titleFromTranscript = (text: string) => {
  const last = (re: RegExp) => {
    let found = ''
    for (const m of text.matchAll(re)) found = m[1] ?? found
    return found
  }
  const decode = (raw: string) => {
    try {
      return JSON.parse(`"${raw}"`) as string
    } catch {
      return raw
    }
  }
  const custom = last(/"customTitle":"((?:[^"\\]|\\.)*)"/g)
  const ai = last(/"aiTitle":"((?:[^"\\]|\\.)*)"/g)
  return decode(custom || ai).trim()
}
