import { describe, expect, it } from 'vitest'
import {
  MAX_PENDING_CLEANUP_AGE_MS,
  MAX_PENDING_CLEANUP_QUEUE,
  type PendingCleanupEntry,
  pruneCleanupQueue,
} from '@/lib/push-cleanup-queue'

const NOW = 1_700_000_000_000

function entry(id: string, ageMs: number): PendingCleanupEntry {
  return { userId: id, queuedAt: NOW - ageMs }
}

describe('pruneCleanupQueue', () => {
  it('returns an empty array unchanged', () => {
    expect(pruneCleanupQueue([], NOW)).toEqual([])
  })

  it('preserves a queue under the cap and within the age window', () => {
    const queue = [entry('a', 1_000), entry('b', 2_000), entry('c', 3_000)]
    expect(pruneCleanupQueue(queue, NOW)).toEqual(queue)
  })

  it('drops entries older than MAX_PENDING_CLEANUP_AGE_MS', () => {
    const queue = [
      entry('fresh', 1_000),
      entry('stale', MAX_PENDING_CLEANUP_AGE_MS + 1),
    ]
    const result = pruneCleanupQueue(queue, NOW)
    expect(result.map((e) => e.userId)).toEqual(['fresh'])
  })

  it('keeps the entry sitting exactly at the age boundary', () => {
    const queue = [entry('edge', MAX_PENDING_CLEANUP_AGE_MS)]
    expect(pruneCleanupQueue(queue, NOW)).toEqual(queue)
  })

  it('caps the queue at MAX_PENDING_CLEANUP_QUEUE by dropping the oldest first', () => {
    // 25 entries, each older than the previous (queuedAt descending).
    const overflow = Array.from({ length: 25 }, (_, i) =>
      entry(`u${i}`, i * 60_000),
    )
    const result = pruneCleanupQueue(overflow, NOW)
    expect(result).toHaveLength(MAX_PENDING_CLEANUP_QUEUE)
    // The 5 oldest (u20..u24) must have been dropped.
    const remaining = new Set(result.map((e) => e.userId))
    expect(remaining.has('u0')).toBe(true)
    expect(remaining.has('u19')).toBe(true)
    expect(remaining.has('u20')).toBe(false)
    expect(remaining.has('u24')).toBe(false)
  })

  // Sprint M · Audit #7 L-1 / 7-T2 (2026-06-14)
  it('M-L-1: drops entries with negative delta (queuedAt > now)', () => {
    const queue: PendingCleanupEntry[] = [
      { userId: 'future', queuedAt: NOW + 10_000 },
      entry('fresh', 1_000),
    ]
    const result = pruneCleanupQueue(queue, NOW)
    expect(result.map((e) => e.userId)).toEqual(['fresh'])
  })

  it('applies age eviction before capping', () => {
    // 21 fresh entries + 5 stale ones. After age eviction we have 21,
    // then cap drops the single oldest fresh entry.
    const fresh = Array.from({ length: 21 }, (_, i) => entry(`f${i}`, i * 60_000))
    const stale = Array.from({ length: 5 }, (_, i) =>
      entry(`s${i}`, MAX_PENDING_CLEANUP_AGE_MS + 1 + i * 60_000),
    )
    const result = pruneCleanupQueue([...stale, ...fresh], NOW)
    expect(result).toHaveLength(MAX_PENDING_CLEANUP_QUEUE)
    // No stale entries should survive.
    expect(result.every((e) => !e.userId.startsWith('s'))).toBe(true)
    // The oldest fresh entry (f20) should be the one dropped.
    expect(result.some((e) => e.userId === 'f20')).toBe(false)
    expect(result.some((e) => e.userId === 'f0')).toBe(true)
  })
})
