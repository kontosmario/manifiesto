export const notificationQueryKeys = {
  all: ['family-notifications'] as const,
  family: (familyId?: string) => ['family-notifications', familyId] as const,
  list: (familyId?: string, limit = 30) => ['family-notifications', familyId, limit] as const,
}
