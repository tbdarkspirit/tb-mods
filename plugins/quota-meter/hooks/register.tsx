import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { Window } from '../types'
import { bar, label, level, sortWindows, statusText, untilReset } from './format'

const windows = atom({ plugin: 'quota-meter', key: 'windows' } as const, [] as Window[])
const isHidden = atom({ plugin: 'quota-meter', key: 'isHidden' } as const, false)

const THRESHOLDS = [80, 95]

// Seuils déjà annoncés par fenêtre (remis à zéro quand la fenêtre redescend).
const warned = new Map<string, number>()

async function apply($: EngineInterface, limits: readonly SessionRateLimit[]) {
  const ws: Window[] = limits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt }))
  await update($, windows, () => ws)
  // La status line ne sert que de repli quand le bandeau est masqué (/quota).
  $.ui.status((await read($, isHidden)) ? statusText(ws) : undefined)

  for (const w of ws) {
    const prev = warned.get(w.kind) ?? 0
    const crossed = THRESHOLDS.filter(t => w.percentUsed >= t && t > prev)
    if (crossed.length > 0) {
      warned.set(w.kind, Math.max(...crossed))
      $.ui.toast(`Quota ${label(w.kind)} à ${Math.round(w.percentUsed)}% (${untilReset(w.resetsAt, Date.now())})`)
    } else if (w.percentUsed < (THRESHOLDS[0] ?? 0)) {
      warned.delete(w.kind)
    }
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    $.command.register({ name: 'quota', description: 'Masque le bandeau de quota (résumé dans la status line) ou le réaffiche' })
    try {
      const u = await $.session.usage()
      await apply($, u.rateLimits)
    } catch {
      // pas encore de lecture : on attendra session.measure
    }
    return r
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) await apply($, e.rateLimits)
    return next(e)
  })

  on('command.run', { command: 'quota' }, async ($, e, next) => {
    const hidden = await update($, isHidden, h => !h)
    const ws = await read($, windows)
    $.ui.status(hidden ? statusText(ws) : undefined)
    const summary = statusText(ws) ?? 'aucune lecture pour l’instant (elle arrive après la première réponse du modèle)'
    return { text: `Bandeau quota ${hidden ? 'masqué' : 'affiché'} — ${summary}` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const ws = sortWindows(await read($, windows))
    if (e.props.hasSurvey || ws.length === 0 || (await read($, isHidden))) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const now = Date.now()

    return (
      <Box flexDirection="row" gap={3}>
        {ws.map(w => (
          <Box key={w.kind} flexDirection="row" gap={1}>
            <Text bold>{label(w.kind)}</Text>
            <Text color={level(w.percentUsed)}>{bar(w.percentUsed)}</Text>
            <Text color={level(w.percentUsed)} bold>{`${Math.round(w.percentUsed)}%`}</Text>
            <Text dimColor>{untilReset(w.resetsAt, now)}</Text>
          </Box>
        ))}
      </Box>
    )
  })
}
