export const MIN_TOUCH_TARGET = 44

export const DEFAULT_HIT_SLOP = {
  top: 8,
  right: 8,
  bottom: 8,
  left: 8,
} as const

export const DEFAULT_PRESS_RETENTION_OFFSET = {
  top: 12,
  right: 12,
  bottom: 12,
  left: 12,
} as const

export function buildMinimumTouchTargetHitSlop(size: number) {
  const extraInset = Math.max(0, Math.ceil((MIN_TOUCH_TARGET - size) / 2))
  const inset = Math.max(6, extraInset)

  return {
    top: inset,
    right: inset,
    bottom: inset,
    left: inset,
  } as const
}
