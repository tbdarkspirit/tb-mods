import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { Radar, RadarState, Remote } from '../types'
import { COLOR, ICON, LABEL, ago, baseName, clip, firstLine, needsMe, sortRemotes, remoteUrlFromTranscript, titleFromTranscript, where } from './format'

const PANE = 'session-radar'
/** Envoyée au hub, pour voir quelle version tourne sur chaque machine. Garder égale à plugin.json. */
const VERSION = '0.2.1'
const POLL_MS = 20_000
const HEARTBEAT_MS = 120_000
/** fs.read refuse au-delà de 4 Mio ; un gros transcript garde le dernier titre lu. */
const MAX_TRANSCRIPT_BYTES = 4 * 1024 * 1024

const radar = atom({ plugin: 'session-radar', key: 'radar' } as const, { sessions: [], error: null, selfId: '' } as Radar, {
  shape: 'radar-1',
})
const isBandHidden = atom({ plugin: 'session-radar', key: 'isBandHidden' } as const, false)

/** This session, as reported to the hub. */
const me = { id: '', machine: '', project: '', title: '', cwd: '', detail: '', url: '', state: 'idle' as RadarState }
const cfg = { url: '', token: '' }
/** Sessions already announced as waiting, so each wait is toasted once. */
const announced = new Set<string>()
let isFirstPoll = true

function configure(options: PluginOptions) {
  cfg.url = String(options.hubUrl ?? '').replace(/\/+$/, '')
  cfg.token = String(options.token ?? '')
  me.machine = String(options.machine ?? '')
}

async function hub($: EngineInterface, method: string, path: string, body?: object) {
  if (!cfg.url || !cfg.token) throw new Error('token du hub non configuré')
  const r = await $.http.fetch(`${cfg.url}${path}`, {
    method,
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`hub ${r.status}`)
  return r.text
}

let isTracked = false
let transcriptPath = ''
let transcriptSize = -1
let hasTranscriptTitle = false

/** Le titre que l'app donne à la conversation (renommage, sinon titre généré), lu dans le transcript. */
async function refreshTitle($: EngineInterface) {
  if (!transcriptPath) return
  try {
    const st = await $.fs.stat(transcriptPath)
    if (st.size === transcriptSize || st.size > MAX_TRANSCRIPT_BYTES) return
    transcriptSize = st.size
    const text = await $.fs.read(transcriptPath)
    me.url = remoteUrlFromTranscript(text) || me.url
    const title = titleFromTranscript(text)
    if (title) {
      hasTranscriptTitle = true
      me.title = clip(title, 120)
    }
  } catch {
    // pas de transcript lisible : on garde le premier message comme titre
  }
}


async function track($: EngineInterface) {
  if (isTracked) return
  isTracked = true
  await report($)
}

async function report($: EngineInterface) {
  if (!me.id || !isTracked) return
  try {
    await hub($, 'PUT', `/api/sessions/${encodeURIComponent(me.id)}`, {
      machine: me.machine,
      project: me.project,
      title: me.title,
      cwd: me.cwd,
      detail: me.detail,
      url: me.url,
      version: VERSION,
      state: me.state,
    })
  } catch {
    // le poll suivant affichera l'erreur
  }
}

async function setState($: EngineInterface, state: RadarState, detail?: string) {
  me.state = state
  if (detail !== undefined) me.detail = clip(detail, 160)
  await report($)
}

async function poll($: EngineInterface) {
  try {
    const text = await hub($, 'GET', '/api/sessions')
    const data = JSON.parse(text) as { sessions: Array<Record<string, unknown>>; now: number }
    const sessions: Remote[] = data.sessions.map(s => ({
      id: String(s.id),
      machine: String(s.machine || '?'),
      project: String(s.project || ''),
      title: String(s.title || ''),
      detail: String(s.detail || ''),
      url: String(s.url || ''),
      version: String(s.version || ''),
      state: (['working', 'waiting', 'permission', 'idle'].includes(String(s.state)) ? s.state : 'idle') as RadarState,
      ageSec: Math.max(0, data.now - Number(s.stateSince ?? data.now)),
      isStale: Boolean(s.isStale),
    }))
    await update($, radar, () => ({ sessions, error: null, selfId: me.id }))

    for (const s of sessions) {
      const key = `${s.id}:${s.state}`
      if (s.id === me.id || !needsMe(s)) continue
      if (!announced.has(key) && !isFirstPoll) {
        $.ui.toast(`${where(s)} ${LABEL[s.state]}${s.title ? ` — ${clip(s.title, 50)}` : ''}`)
      }
      announced.add(key)
    }
    // Oublie les attentes terminées, pour annoncer la prochaine.
    for (const key of [...announced]) {
      const [id, state] = key.split(':')
      if (!sessions.some(s => s.id === id && s.state === state && needsMe(s))) announced.delete(key)
    }
    isFirstPoll = false
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await update($, radar, r => ({ ...r, error: message, selfId: me.id }))
  }
}

export const register: Register = (on, options) => {
  configure(options)

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command.register({ name: 'sessions', description: 'Radar des conversations Claude Code sur toutes tes machines' })
    me.id = await $.session.id()
    me.cwd = e.cwd
    const repo = await $.session.repo().catch(() => null)
    me.project = (repo && 'name' in repo && typeof repo.name === 'string' && repo.name) || baseName(e.cwd)
    if (!me.machine) {
      try {
        me.machine = (await $.process.run(['hostname'])).stdout.trim()
      } catch {
        me.machine = 'machine inconnue'
      }
    }
    await poll($)
    $.clock.every(POLL_MS, () => void poll($))
    $.clock.every(HEARTBEAT_MS, () => void report($))
    // L'app desktop et le SDK démarrent sans écran : on ne suit la session qu'une fois un écran attaché,
    // ce qui écarte les exécutions sans écran (claude -p, scripts, tâches planifiées).
    if (e.isInteractive || (await $.session.surfaces()).length > 0) await track($)
    return r
  })

  on('session.attach', async ($, e, next) => {
    const r = await next(e)
    await track($)
    return r
  })

  on('classic.UserPromptSubmit', async ($, e, next) => {
    if (e.transcript_path && !transcriptPath) {
      transcriptPath = e.transcript_path
      await refreshTitle($)
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const r = await next(e)
    if (!me.title && !e.text.startsWith('/')) me.title = clip(firstLine(e.text), 120)
    await refreshTitle($)
    await setState($, 'working', firstLine(e.text))
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    await refreshTitle($)
    if (e.isAborted) await setState($, 'idle', 'interrompue')
    else await setState($, 'waiting', firstLine(e.answer))
    return r
  })

  // Une autorisation réellement demandée à toi : le mode auto et les règles ont déjà tranché avant.
  on('classic.PermissionRequest', async ($, e, next) => {
    if (me.state === 'working') {
      me.state = 'permission'
      me.detail = `autorisation : ${e.tool_name}`
      void report($)
    }
    return next(e)
  })

  on('classic.Notification', async ($, e, next) => {
    if (e.notification_type === 'permission_prompt' && me.state === 'working') {
      me.state = 'permission'
      me.detail = clip(e.message || 'autorisation demandée', 160)
      void report($)
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (me.state === 'permission') await setState($, 'working', `${e.tool}`)
    return r
  })

  on('session.end', async ($, e, next) => {
    try {
      if (me.id && isTracked) await hub($, 'DELETE', `/api/sessions/${encodeURIComponent(me.id)}`)
    } catch {
      // le hub l'oubliera de lui-même
    }
    return next(e)
  })

  on('command.run', { command: 'sessions' }, async ($, e) => {
    if (e.args.trim() === 'bandeau') {
      const hidden = await update($, isBandHidden, h => !h)
      return { text: `Bandeau radar ${hidden ? 'masqué' : 'affiché'}` }
    }
    await poll($)
    await $.ui.open({ id: PANE, title: 'Sessions' })
    const { sessions, error } = await read($, radar)
    if (error) return { text: `Radar : ${error}` }
    const waiting = sessions.filter(s => s.id !== me.id && needsMe(s)).length
    return { text: `Radar ouvert — ${sessions.length} session(s), ${waiting} en attente ailleurs` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { sessions, selfId } = await read($, radar)
    const waiting = sortRemotes(sessions.filter(s => s.id !== selfId && needsMe(s)))
    if (e.props.hasSurvey || waiting.length === 0 || (await read($, isBandHidden))) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const room = Math.max(30, (e.props.bodyColumns ?? 100) - 4)
    const shown = waiting.slice(0, 3)
    const rest = waiting.length - shown.length

    return (
      <Box flexDirection="row" gap={2}>
        <Text bold color="warning">{`En attente ailleurs (${waiting.length})`}</Text>
        {shown.map(s => (
          <Box key={s.id} flexDirection="row" gap={1}>
            <Text color={COLOR[s.state]}>{ICON[s.state]}</Text>
            <Text>{clip(where(s), Math.floor(room / shown.length) - 12)}</Text>
            <Text dimColor>{ago(s.ageSec)}</Text>
          </Box>
        ))}
        {rest > 0 && <Text dimColor>{`+${rest} · /sessions`}</Text>}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Link, Text } = $.ui.resolve(e)
    const { sessions, error, selfId } = await read($, radar)
    const width = Math.max(30, e.props.bodyColumns ?? 60)
    const machines = [...new Set(sortRemotes(sessions).map(s => s.machine))]

    return (
      <Box flexDirection="column" gap={1}>
        {error && <Text color="error">{`Hub injoignable : ${error}`}</Text>}
        {sessions.length === 0 && !error && <Text dimColor>Aucune session connue.</Text>}
        {machines.map(m => (
          <Box key={`m-${m}`} flexDirection="column">
            <Box flexDirection="row" gap={1}>
              <Text bold>{m}</Text>
              <Text dimColor>{`v${sessions.find(s => s.machine === m)?.version || '?'}`}</Text>
            </Box>
            {sortRemotes(sessions.filter(s => s.machine === m)).map(s => (
              <Box key={s.id} flexDirection="column">
                <Box flexDirection="row" gap={1}>
                  <Text color={s.isStale ? 'subtle' : COLOR[s.state]}>{ICON[s.state]}</Text>
                  {s.url && s.id !== selfId ? (
                    <Text bold={needsMe(s)} dimColor={s.isStale}>
                      <Link href={s.url}>{clip(s.title || s.project || '?', Math.floor(width / 2))}</Link>
                    </Text>
                  ) : (
                    <Text bold={needsMe(s)} dimColor={s.isStale}>
                      {clip(`${s.title || s.project || '?'}${s.id === selfId ? ' (ici)' : ''}`, Math.floor(width / 2))}
                    </Text>
                  )}
                  <Text dimColor>
                    {s.isStale ? `plus de signal · ${ago(s.ageSec)}` : `${LABEL[s.state]} · ${ago(s.ageSec)}`}
                  </Text>
                </Box>
                <Text dimColor>{`   ${clip([s.project, s.detail].filter(Boolean).join(' — '), width - 4)}`}</Text>
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    )
  })
}
