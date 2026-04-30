import { describe, expect, it } from 'vitest'
// Smoke test: import the hook and verify its surface. The hook itself
// runs `useEffect` which is a no-op in Node, but importing it confirms
// the module loads under the same stub graph as the rest of the app
// (catches cases like importing `useIsFocused` transitively, which
// would break this test).
import { useUnboundedLoopAnimation } from '@/hooks/use-unbounded-loop-animation'

describe('useUnboundedLoopAnimation', () => {
  it('exports a function', () => {
    expect(typeof useUnboundedLoopAnimation).toBe('function')
  })

  it('does NOT depend on @react-navigation/native (no useIsFocused call)', async () => {
    // Read the source and assert it doesn't import from the navigation
    // package or call useIsFocused. This is the contract that
    // distinguishes it from `useLoopAnimation` and the reason it works
    // for splashes mounted outside the NavigationContainer. We strip
    // comments first so doc references to the dependency we DON'T want
    // are allowed.
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const raw = await fs.readFile(
      path.resolve(__dirname, '../../mobile/hooks/use-unbounded-loop-animation.ts'),
      'utf-8',
    )
    // Strip block + line comments.
    const src = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/[^\n]*/g, '')
    // No import from navigation package.
    expect(src).not.toMatch(/from ['"]@react-navigation\/native['"]/)
    // No call site of useIsFocused.
    expect(src).not.toMatch(/useIsFocused\s*\(/)
  })
})
