/**
 * Minimal stub for expo-secure-store used in vitest (Node environment).
 */
export async function getItemAsync(_key: string): Promise<string | null> {
  return null
}

export async function setItemAsync(_key: string, _value: string): Promise<void> {
  return
}

export async function deleteItemAsync(_key: string): Promise<void> {
  return
}
