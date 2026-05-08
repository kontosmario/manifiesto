// SecureStore-backed storage adapter for the Supabase auth session.
//
// Why this exists:
//   The previous setup polyfilled `localStorage` against an
//   unencrypted SQLite database (`expo-sqlite/localStorage/install`),
//   so the access_token + refresh_token were persisted in plaintext
//   on disk. Anyone with file-system access (rooted device, malware
//   with the same uid, an unencrypted iCloud/Google backup, a
//   stolen-device forensic acquisition) could lift the long-lived
//   refresh token and impersonate the user against the project
//   anywhere — RLS policies cannot defend against a stolen JWT.
//
//   `expo-secure-store` writes to Keychain (iOS) / EncryptedSharedPreferences
//   backed by the Android Keystore (Android), which makes extraction
//   meaningfully harder (per-device, hardware-backed crypto).
//
// SecureStore caveat — value size:
//   SecureStore values are capped at 2 KB. A Supabase session JSON is
//   typically 1.5–4 KB depending on token length and metadata, so we
//   chunk values transparently: a write splits the payload into
//   `<KEY>.0`, `<KEY>.1`, … and stores a tiny manifest at `<KEY>` with
//   the chunk count. Reads stitch them back. This pattern is the one
//   recommended in the official Expo docs.

import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

const CHUNK_SIZE = 1800 // < 2KB SecureStore cap, with safety headroom

const writeOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
}

interface ChunkManifest {
  v: 1
  chunks: number
}

function chunkKey(base: string, idx: number) {
  return `${base}.chunk.${idx}`
}

async function clearChunks(key: string, count: number) {
  await Promise.all(
    Array.from({ length: count }, (_, i) =>
      SecureStore.deleteItemAsync(chunkKey(key, i)),
    ),
  )
}

async function readManifest(key: string): Promise<ChunkManifest | null> {
  const raw = await SecureStore.getItemAsync(key, writeOptions)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ChunkManifest>
    if (parsed.v !== 1 || typeof parsed.chunks !== 'number') return null
    return { v: 1, chunks: parsed.chunks }
  } catch {
    return null
  }
}

// Web has no SecureStore. Fall back to in-memory only — refusing to
// persist on the web build keeps a "logged in once" web session from
// living forever in a plaintext localStorage. The user re-auths on
// each cold load, which on web is a single click.
const memoryStore = new Map<string, string>()
const isWeb = Platform.OS === 'web'

export const supabaseSecureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (isWeb) return memoryStore.get(key) ?? null

    const manifest = await readManifest(key)
    if (!manifest) {
      // Backward-compat: legacy single-blob value (no manifest).
      // Will be migrated to chunked on next write.
      return SecureStore.getItemAsync(key, writeOptions)
    }

    const parts: string[] = []
    for (let i = 0; i < manifest.chunks; i++) {
      const chunk = await SecureStore.getItemAsync(chunkKey(key, i), writeOptions)
      if (chunk == null) return null
      parts.push(chunk)
    }
    return parts.join('')
  },

  async setItem(key: string, value: string): Promise<void> {
    if (isWeb) {
      memoryStore.set(key, value)
      return
    }

    const previous = await readManifest(key)
    if (previous) {
      await clearChunks(key, previous.chunks)
    }

    if (value.length <= CHUNK_SIZE) {
      // Small payload: write a 1-chunk manifest + a single chunk.
      const manifest: ChunkManifest = { v: 1, chunks: 1 }
      await SecureStore.setItemAsync(chunkKey(key, 0), value, writeOptions)
      await SecureStore.setItemAsync(key, JSON.stringify(manifest), writeOptions)
      return
    }

    const chunks: string[] = []
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE))
    }
    await Promise.all(
      chunks.map((part, idx) =>
        SecureStore.setItemAsync(chunkKey(key, idx), part, writeOptions),
      ),
    )
    const manifest: ChunkManifest = { v: 1, chunks: chunks.length }
    await SecureStore.setItemAsync(key, JSON.stringify(manifest), writeOptions)
  },

  async removeItem(key: string): Promise<void> {
    if (isWeb) {
      memoryStore.delete(key)
      return
    }

    const manifest = await readManifest(key)
    if (manifest) {
      await clearChunks(key, manifest.chunks)
    }
    await SecureStore.deleteItemAsync(key)
  },
}
