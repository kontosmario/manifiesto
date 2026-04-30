// Single-entry memoization helper.
//
// `React.useMemo` is per-component-instance: calling the same hook from
// three different component trees runs the compute three times, even
// when every input has identical reference identity. This helper
// closes that gap with a tiny module-level LRU(1) cache: same input
// tuple → same output, regardless of how many call sites share it.
//
// Used inside `useControlV2Data` so the 3 Home tree invocations
// (HomeScreen + HomeDashboard + tab-bar advisor badge) collapse to a
// single computation per render cycle.
//
// Trade-offs:
//  - Single-entry: no LRU eviction policy needed. The most recent
//    input is the only one cached. If invocations alternate between
//    two distinct inputs, the cache thrashes — but in practice all
//    consumers within a render share the same React Query data refs.
//  - Shallow equality: each dep is compared by `Object.is`. Heavy
//    objects must already have stable identity (React Query data does).

export function singleEntryMemoize<TArgs extends readonly unknown[], TResult>(
  fn: (...args: TArgs) => TResult,
): (...args: TArgs) => TResult {
  let cachedArgs: TArgs | null = null
  let cachedResult: TResult
  return (...args: TArgs): TResult => {
    if (cachedArgs && cachedArgs.length === args.length) {
      let same = true
      for (let i = 0; i < args.length; i++) {
        if (!Object.is(cachedArgs[i], args[i])) {
          same = false
          break
        }
      }
      if (same) return cachedResult
    }
    cachedResult = fn(...args)
    cachedArgs = args
    return cachedResult
  }
}
