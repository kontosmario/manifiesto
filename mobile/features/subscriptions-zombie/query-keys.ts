export const subscriptionsZombieQueryKeys = {
  all: ['subscriptions-zombie'] as const,
  feed: (familyId?: string) =>
    ['subscriptions-zombie', 'feed', familyId ?? null] as const,
  audits: (familyId?: string, period?: string) =>
    ['subscriptions-zombie', 'audits', familyId ?? null, period ?? null] as const,
  intents: (familyId?: string) =>
    ['subscriptions-zombie', 'intents', familyId ?? null] as const,
  category: (familyId?: string) =>
    ['subscriptions-zombie', 'category', familyId ?? null] as const,
}
