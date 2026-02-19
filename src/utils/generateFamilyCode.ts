const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateFamilyCode(length = 6): string {
  const safeLength = Math.max(6, Math.min(8, length))

  if (!globalThis.crypto?.getRandomValues) {
    let fallbackCode = ''
    for (let index = 0; index < safeLength; index += 1) {
      fallbackCode += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
    }
    return fallbackCode
  }

  const randomValues = new Uint32Array(safeLength)
  globalThis.crypto.getRandomValues(randomValues)

  let code = ''
  for (let index = 0; index < safeLength; index += 1) {
    code += CODE_CHARS[randomValues[index] % CODE_CHARS.length]
  }

  return code
}
