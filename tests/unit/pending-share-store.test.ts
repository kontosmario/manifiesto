import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  consumePendingShare,
  peekPendingShare,
  setPendingShare,
  subscribePendingShare,
  __resetPendingShareForTests,
} from '@/features/share-import/pending-share-store'

describe('pending-share-store (share-to-import)', () => {
  beforeEach(() => {
    __resetPendingShareForTests()
  })

  it('un slot: set → peek no consume, consume vacía', () => {
    setPendingShare('file:///tmp/captura.png')
    expect(peekPendingShare()).toBe('file:///tmp/captura.png')
    expect(consumePendingShare()).toBe('file:///tmp/captura.png')
    expect(peekPendingShare()).toBeNull()
    expect(consumePendingShare()).toBeNull()
  })

  it('un share nuevo pisa al anterior no consumido (el último gana)', () => {
    setPendingShare('file:///a.png')
    setPendingShare('file:///b.png')
    expect(consumePendingShare()).toBe('file:///b.png')
  })

  it('notifica subscribers en set y en consume', () => {
    const listener = vi.fn()
    const unsubscribe = subscribePendingShare(listener)
    setPendingShare('file:///a.png')
    expect(listener).toHaveBeenCalledTimes(1)
    consumePendingShare()
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    setPendingShare('file:///c.png')
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
