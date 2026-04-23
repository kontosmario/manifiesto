interface ProfileCacheEntry {
  displayName: string
  cachedAt: number
}

const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000
const profileDisplayNameCache = new Map<string, ProfileCacheEntry>()

export function getCachedProfileDisplayName(userId: string): string | null {
  const cached = profileDisplayNameCache.get(userId)
  if (!cached) {
    return null
  }

  if (Date.now() - cached.cachedAt > PROFILE_CACHE_TTL_MS) {
    profileDisplayNameCache.delete(userId)
    return null
  }

  return cached.displayName
}

export function setCachedProfileDisplayName(userId: string, displayName: string): void {
  profileDisplayNameCache.set(userId, {
    displayName,
    cachedAt: Date.now(),
  })
}

export function setCachedProfileDisplayNames(
  profiles: Array<{ id: string; display_name: string }>,
): void {
  profiles.forEach((profile) => {
    setCachedProfileDisplayName(profile.id, profile.display_name)
  })
}
