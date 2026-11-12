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
