export const controlIntelligenceQueryKey = (familyId?: string) =>
  ['control-intelligence', familyId ?? null] as const
