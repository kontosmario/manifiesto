import { describe, expect, it } from 'vitest'
import { resolveControlSignals } from '@/features/insights/control-v2-empty-fallback'
import { CONTROL_MOCK, type ControlAdvisorTask } from '@/features/insights/control-v2-mock'

const REAL_TASK: ControlAdvisorTask = {
  id: 'real-1',
  emoji: '⚡',
  cat: 'Servicios',
  title: 'Real signal',
  body: 'real',
  impact: '+$1',
  impactRaw: 1,
  cta: 'Ver',
  urgency: 'baja',
  confidence: 1,
  dataDays: 30,
}

describe('resolveControlSignals', () => {
  it('returns empty array for new users (usingMock=true) — never the mock tasks', () => {
    const result = resolveControlSignals({
      usingMock: true,
      computedSignals: [REAL_TASK],
    })
    expect(result).toEqual([])
  })

  it('does NOT include CONTROL_MOCK tareas (Disney+, Edenor, Ocio) when usingMock=true', () => {
    const result = resolveControlSignals({
      usingMock: true,
      computedSignals: [REAL_TASK],
    })
    const titles = result.map((t) => t.title)
    expect(titles).not.toContain(CONTROL_MOCK.tareas[0].title)
    expect(titles).not.toContain(CONTROL_MOCK.tareas[1].title)
    expect(titles).not.toContain(CONTROL_MOCK.tareas[2].title)
  })

  it('returns the computed signals when usingMock=false', () => {
    const result = resolveControlSignals({
      usingMock: false,
      computedSignals: [REAL_TASK],
    })
    expect(result).toEqual([REAL_TASK])
  })

  it('returns empty array when usingMock=false but there are no computed signals', () => {
    const result = resolveControlSignals({
      usingMock: false,
      computedSignals: [],
    })
    expect(result).toEqual([])
  })
})
