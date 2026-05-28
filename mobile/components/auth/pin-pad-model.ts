/**
 * Pure keypad logic for the PIN pad. Extracted so the append /
 * backspace / completion rules are unit-tested without a renderer.
 */
export const PIN_LENGTH = 4

export function appendPinDigit(
  value: string,
  digit: string,
  maxLength: number = PIN_LENGTH,
): string {
  if (value.length >= maxLength) return value
  if (!/^\d$/.test(digit)) return value
  return value + digit
}

export function backspacePin(value: string): string {
  return value.slice(0, -1)
}

export function isPinComplete(
  value: string,
  maxLength: number = PIN_LENGTH,
): boolean {
  return value.length === maxLength
}
