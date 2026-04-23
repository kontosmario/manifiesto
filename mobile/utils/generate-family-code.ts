const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateFamilyCode(length = 6): string {
  let code = ''

  for (let index = 0; index < length; index += 1) {
    const randomIndex = Math.floor(Math.random() * ALPHABET.length)
    code += ALPHABET[randomIndex]
  }

  return code
}
