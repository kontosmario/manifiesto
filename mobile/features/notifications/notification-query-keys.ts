export const notificationQueryKeys = {
  all: ['family-notifications'] as const,
  family: (familyId?: string) => ['family-notifications', familyId] as const,
  list: (familyId?: string, userId?: string | null, limit = 30) =>
    ['family-notifications', familyId, userId ?? null, limit] as const,
  unreadCount: (familyId?: string, userId?: string | null) =>
    ['family-notifications', familyId, userId ?? null, 'unread-count'] as const,
}
