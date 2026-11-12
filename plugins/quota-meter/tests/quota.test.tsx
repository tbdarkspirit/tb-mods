import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'quota-meter',
  component: 'AbovePrompt',
  props: { hasSurvey: false },
} as const

test('le bandeau montre 5h et hebdo après une mesure', async ($, on) => {
  on('session.measure', (_, e) => ({ changed: e.changed }))
  await $.session.measure({
    context: { window: 200000 } as never,
    rateLimits: [
      { kind: 'seven_day', percentUsed: 41.5, resetsAt: '2099-01-01T00:00:00Z' },
      { kind: 'five_hour', percentUsed: 23, resetsAt: '2099-01-01T00:00:00Z' },
    ],
    changed: ['rateLimits'],
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface } as never)
    expect((await ui.find({ type: 'Text', text: /^5h$/ }))?.text).toBe('5h')
    expect((await ui.find({ type: 'Text', text: /^23%$/ }))?.text).toBe('23%')
    expect((await ui.find({ type: 'Text', text: /^42%$/ }))?.text).toBe('42%')
    await ui.unmount()
  }
})
