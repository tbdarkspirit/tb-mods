import { expect, test } from 'claude-code/testing'

const HUB = JSON.stringify({
  now: 1000,
  sessions: [
    { id: 'self', machine: 'vps', project: 'apps', state: 'working', stateSince: 990, isStale: false },
    { id: 'w1', machine: 'PC Windows', project: 'ma-cave', title: 'fix import', state: 'waiting', stateSince: 700, isStale: false },
    { id: 's1', machine: 'PC sous-sol', project: 'old', state: 'waiting', stateSince: 0, isStale: true },
  ],
})

test('bandeau et panneau listent ce qui attend ailleurs', { options: { token: 't', hubUrl: 'https://hub', machine: 'vps' } }, async ($, on) => {
  const calls: string[] = []
  on('http.fetch', (_, e) => {
    calls.push(`${e.init?.method ?? 'GET'} ${e.url}`)
    return { value: { status: 200, ok: true, headers: {}, text: e.url.endsWith('/api/sessions') && (e.init?.method ?? 'GET') === 'GET' ? HUB : '{}' } }
  })
  on('session.id', () => ({ value: 'self' }))
  on('session.repo', () => ({ value: null }))
  on('command.register', () => ({ value: { command: 'sessions' } }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/home/appadmin/apps', surface: 'desktop', isInteractive: true })
  expect(calls.some(c => c.startsWith('PUT https://hub/api/sessions/self'))).toBe(true)

  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ plugin: 'session-radar', component: 'AbovePrompt', surface, props: { hasSurvey: false } } as never)
    expect((await band.find({ type: 'Text', text: /En attente ailleurs \(1\)/ }))?.text).toBe('En attente ailleurs (1)')
    expect((await band.find({ type: 'Text', text: /ma-cave/ }))?.text).toContain('PC Windows')
    expect(await band.find({ type: 'Text', text: /old/ })).toBeUndefined()
    await band.unmount()
  }
})

test('sans écran (claude -p) : rien envoyé ; suivie dès qu’un écran s’attache', { options: { token: 't', hubUrl: 'https://hub', machine: 'vps' } }, async ($, on) => {
  const puts: string[] = []
  on('http.fetch', (_, e) => {
    if (e.init?.method === 'PUT') puts.push(e.url)
    return { value: { status: 200, ok: true, headers: {}, text: '{"sessions":[],"now":0}' } }
  })
  on('session.id', () => ({ value: 'headless' }))
  on('session.repo', () => ({ value: null }))
  on('session.surfaces', () => ({ value: [] }))
  on('command.register', () => ({ value: { command: 'sessions' } }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.attach', (_, e) => ({ clientId: e.clientId }))

  await $.session.start({ cwd: '/x', surface: null, isInteractive: false })
  expect(puts.length).toBe(0)

  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' } as never)
  expect(puts.length).toBe(1)
})

import { titleFromTranscript } from '../hooks/format'

test('titre lu dans le transcript : renommage > titre généré', async () => {
  const t = [
    '{"type":"ai-title","aiTitle":"Titre généré","sessionId":"x"}',
    '{"type":"user","message":"bla"}',
    '{"type":"custom-title","customTitle":"Mon \\"radar\\"","sessionId":"x"}',
  ].join('\n')
  expect(titleFromTranscript(t)).toBe('Mon "radar"')
  expect(titleFromTranscript('{"type":"ai-title","aiTitle":"Seul"}')).toBe('Seul')
  expect(titleFromTranscript('{}')).toBe('')
})
