import { describe, expect, it } from 'vitest'
import {
  appendPinDigit,
  backspacePin,
  isPinComplete,
} from '@/components/auth/pin-pad-model'

describe('pin-pad-model', () => {
  it('appendPinDigit adds a digit', () => {
    expect(appendPinDigit('12', '3')).toBe('123')
  })
  it('appendPinDigit ignores when at maxLength', () => {
    expect(appendPinDigit('1234', '5')).toBe('1234')
  })
  it('appendPinDigit ignores non-digits', () => {
    expect(appendPinDigit('12', 'a')).toBe('12')
    expect(appendPinDigit('12', '')).toBe('12')
  })
  it('backspacePin removes the last char', () => {
    expect(backspacePin('123')).toBe('12')
    expect(backspacePin('')).toBe('')
  })
  it('isPinComplete true at maxLength', () => {
    expect(isPinComplete('1234')).toBe(true)
    expect(isPinComplete('123')).toBe(false)
  })
})
