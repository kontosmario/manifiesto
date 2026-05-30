export const homeSnapshotQueryKey = (userId?: string) =>
  ['home-snapshot', userId ?? null] as const
