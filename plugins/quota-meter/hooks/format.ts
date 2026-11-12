import type { Window } from '../types'

export const LABELS: Record<string, string> = { five_hour: '5h', seven_day: 'Hebdo', spend_limit: 'Spend' }
export const ORDER = ['five_hour', 'seven_day', 'spend_limit']

export const sortWindows = (ws: readonly Window[]): Window[] =>
  [...ws].sort((a, b) => rank(a.kind) - rank(b.kind))

const rank = (k: string) => (ORDER.indexOf(k) === -1 ? 99 : ORDER.indexOf(k))

export const label = (k: string) => LABELS[k] ?? k

export const bar = (pct: number, width = 10) => {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export const level = (pct: number): 'success' | 'warning' | 'error' =>
  pct >= 90 ? 'error' : pct >= 70 ? 'warning' : 'success'

/** "dans 2h14", "dans 3j 4h", "dans 12 min" */
export const untilReset = (resetsAt: string | undefined, now: number) => {
  if (!resetsAt) return ''
  const ms = Date.parse(resetsAt) - now
  if (!Number.isFinite(ms)) return ''
  if (ms <= 0) return 'reset imminent'
  const min = Math.round(ms / 60000)
  if (min < 60) return `reset dans ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `reset dans ${h}h${String(min % 60).padStart(2, '0')}`
  return `reset dans ${Math.floor(h / 24)}j ${h % 24}h`
}

export const statusText = (ws: readonly Window[]) =>
  ws.length === 0 ? undefined : sortWindows(ws).map(w => `${label(w.kind)} ${Math.round(w.percentUsed)}%`).join(' · ')
