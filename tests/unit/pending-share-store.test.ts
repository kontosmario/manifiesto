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

  it('dedupe: re-depositar el uri RECIÉN consumido es no-op (doble onChange del mismo share)', () => {
    setPendingShare('file:///x.png')
    expect(consumePendingShare()).toBe('file:///x.png')
    // La lib emite onChange dos veces (refresh + poll) → mismo uri.
    setPendingShare('file:///x.png')
    expect(peekPendingShare()).toBeNull()
    expect(consumePendingShare()).toBeNull()
  })

  it('dedupe NO bloquea un share genuinamente nuevo (otro uri)', () => {
    setPendingShare('file:///x.png')
    consumePendingShare()
    setPendingShare('file:///y.png')
    expect(consumePendingShare()).toBe('file:///y.png')
  })
})
