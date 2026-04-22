import { describe, expect, it } from 'vitest'
import {
  appendDigit,
  appendComma,
  backspace,
  clearAll,
} from '@/components/ui/in-app-numpad-model'

const LIMITS = { maxIntegerDigits: 8, maxDecimalDigits: 2 }

describe('appendDigit', () => {
  it('appends digit to empty string', () => {
    expect(appendDigit('', '5', LIMITS)).toBe('5')
  })

  it('skips leading zero when appending onto empty', () => {
    expect(appendDigit('', '0', LIMITS)).toBe('')
  })

  it('appends digits up to max integer length', () => {
    expect(appendDigit('12345678', '9', LIMITS)).toBe('12345678')
    expect(appendDigit('1234567', '9', LIMITS)).toBe('12345679')
  })

  it('appends decimal digits up to max decimal length', () => {
    expect(appendDigit('12,5', '7', LIMITS)).toBe('12,57')
    expect(appendDigit('12,57', '9', LIMITS)).toBe('12,57')
  })
})

describe('appendComma', () => {
  it('appends comma when none present', () => {
    expect(appendComma('12')).toBe('12,')
  })

  it('is idempotent when comma already present', () => {
    expect(appendComma('12,5')).toBe('12,5')
  })

  it('adds leading zero if invoked on empty', () => {
    expect(appendComma('')).toBe('0,')
  })
})

describe('backspace', () => {
  it('removes the last character', () => {
    expect(backspace('1234')).toBe('123')
  })

  it('is a no-op on empty', () => {
    expect(backspace('')).toBe('')
  })
})

describe('clearAll', () => {
  it('returns empty string', () => {
    expect(clearAll()).toBe('')
  })
})
