import { describe, expect, it } from 'vitest'
import {
  SKELETON_HERO_LAYOUT,
  SKELETON_LIST_ROW_LAYOUT,
  SKELETON_METRIC_LAYOUT,
} from '@/components/ui/skeleton-layouts'

describe('skeleton layout descriptors', () => {
  it('hero layout defines eyebrow / value / context / cta blocks', () => {
    expect(SKELETON_HERO_LAYOUT).toHaveProperty('eyebrow.width')
    expect(SKELETON_HERO_LAYOUT).toHaveProperty('value.height')
    expect(SKELETON_HERO_LAYOUT).toHaveProperty('context.width')
    expect(SKELETON_HERO_LAYOUT).toHaveProperty('cta.width', 140)
  })

  it('list row layout defines leading / labels / trailing', () => {
    expect(SKELETON_LIST_ROW_LAYOUT.leading.width).toBe(36)
    expect(SKELETON_LIST_ROW_LAYOUT.title.width).toBe('50%')
    expect(SKELETON_LIST_ROW_LAYOUT.subtitle.height).toBe(11)
  })

  it('metric layout defines label + value', () => {
    expect(SKELETON_METRIC_LAYOUT.label.width).toBe('40%')
    expect(SKELETON_METRIC_LAYOUT.value.height).toBe(20)
  })
})
