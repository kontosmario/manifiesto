import { describe, it, expect } from 'vitest'
import { chunk } from '../../supabase/functions/notifications-orchestrator/chunking'

describe('chunk', () => {
  it('returns empty array for empty input', () => {
    expect(chunk([], 3)).toEqual([])
  })

  it('splits array into chunks of given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('returns one chunk if size >= length', () => {
    expect(chunk([1, 2], 5)).toEqual([[1, 2]])
  })
})
