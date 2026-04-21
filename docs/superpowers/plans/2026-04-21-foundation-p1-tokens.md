# Foundation Design v2 — Phase 1: Token Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship PR #1 of Foundation — token layer rewritten (palette, typography, motion, spacing, radii, category hues) so the app visually refreshes without touching a single component file.

**Architecture:** Tokens are the source of truth. Primitives already consume them. Change the tokens → the app changes. New motion tokens introduced as a net-add. Spacing migrates from an incoherent 6/10/14/18/24/32 scale to a 4-base 4/8/12/16/24/32/48 scale using a `legacySpacing` export during transition (each consumer commit migrates to the new names with visual judgment per call site; `legacySpacing` is deleted at the end of this PR).

**Tech Stack:** TypeScript, Vitest (Node env), Expo + React Native, Reanimated 4 (already installed, not used yet — Phase 1 only defines the tokens; adoption comes in later phases).

**Reference spec:** [docs/superpowers/specs/2026-04-21-foundation-design.md](../specs/2026-04-21-foundation-design.md) sections 5, 9, 11 Phase 1.

**Test commands:**
- `./scripts/npmw run test` — unit tests (vitest, Node env)
- `./scripts/npmw run typecheck` — TypeScript
- `./scripts/npmw run lint` — ESLint
- `./scripts/npmw run validate` — all of the above

---

## File plan

### New files

| Path | Responsibility |
|---|---|
| `mobile/lib/motion/tokens.ts` | Motion durations, spring presets, easings, stagger values |
| `mobile/lib/motion/index.ts` | Barrel export |
| `mobile/theme/category-hues.ts` | Muted hue map per category slug + deterministic fallback hash |
| `mobile/theme/typography.ts` | Full typography preset scale (extracted from palette.ts, expanded) |
| `tests/unit/motion-tokens.test.ts` | Token shape + preset presence |
| `tests/unit/category-hues.test.ts` | Map shape + hash fallback determinism |
| `tests/unit/typography-tokens.test.ts` | All preset keys present |
| `tests/unit/palette-tokens.test.ts` | Light/dark colors + brand constants + spacing + radii |

### Modified files

| Path | Change |
|---|---|
| `mobile/theme/palette.ts` | Redesign colors (canvas, brand, surfaces, text, borders), new spacing scale + `legacySpacing` transition export, expanded radii. Typography removed (moved to typography.ts; re-export for backward compat). |
| `mobile/theme/theme-provider.tsx` | Exposes new palette shape + typography + motion + category hue resolver. |
| `mobile/components/ui/*.tsx` | Consumers updated to new token names (per-folder commits). |
| `mobile/components/<domain>/*.tsx` | Same. |
| `mobile/screens/**/*.tsx` | Same. |
| `package.json` scripts | `validate` extended with grep guard that fails on any remaining `legacySpacing.` reference (added in final task). |

---

## Task 1: Motion tokens module

**Files:**
- Create: `mobile/lib/motion/tokens.ts`
- Create: `mobile/lib/motion/index.ts`
- Test: `tests/unit/motion-tokens.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/motion-tokens.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  motionDurations,
  motionSprings,
  motionEasings,
  motionStagger,
} from '@/lib/motion/tokens'

describe('motion tokens', () => {
  it('exposes the five canonical duration buckets', () => {
    expect(motionDurations).toEqual({
      micro: 120,
      quick: 180,
      standard: 240,
      deliberate: 320,
      slow: 480,
    })
  })

  it('exposes all six spring presets with damping/stiffness/mass', () => {
    const keys = ['press', 'enter', 'exit', 'value', 'celebrate', 'sheet'] as const
    for (const key of keys) {
      const spring = motionSprings[key]
      expect(spring.damping).toBeGreaterThan(0)
      expect(spring.stiffness).toBeGreaterThan(0)
      expect(spring.mass).toBeGreaterThan(0)
    }
  })

  it('celebrate spring has lower damping than press (overshoot behavior)', () => {
    expect(motionSprings.celebrate.damping).toBeLessThan(motionSprings.press.damping)
  })

  it('exposes three bezier easings + two stagger values', () => {
    expect(motionEasings.standard).toBeTypeOf('function')
    expect(motionEasings.accelerate).toBeTypeOf('function')
    expect(motionEasings.decelerate).toBeTypeOf('function')
    expect(motionStagger.listItem).toBe(40)
    expect(motionStagger.section).toBe(60)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/npmw run test -- tests/unit/motion-tokens.test.ts`
Expected: FAIL with `Cannot find module '@/lib/motion/tokens'`.

- [ ] **Step 3: Implement motion tokens**

Create `mobile/lib/motion/tokens.ts`:

```ts
import { Easing } from 'react-native-reanimated'

export const motionDurations = {
  micro: 120,
  quick: 180,
  standard: 240,
  deliberate: 320,
  slow: 480,
} as const

export type MotionDurationKey = keyof typeof motionDurations

export const motionSprings = {
  press:     { damping: 18, stiffness: 380, mass: 0.9 },
  enter:     { damping: 22, stiffness: 210, mass: 1.0 },
  exit:      { damping: 24, stiffness: 260, mass: 1.0 },
  value:     { damping: 24, stiffness: 180, mass: 1.0 },
  celebrate: { damping: 14, stiffness: 260, mass: 0.8 },
  sheet:     { damping: 22, stiffness: 200, mass: 1.0 },
} as const

export type MotionSpringKey = keyof typeof motionSprings

export const motionEasings = {
  standard:   Easing.bezier(0.22, 0.9, 0.3, 1),
  accelerate: Easing.bezier(0.4, 0.0, 1.0, 1.0),
  decelerate: Easing.bezier(0.0, 0.0, 0.2, 1.0),
} as const

export const motionStagger = {
  listItem: 40,
  section:  60,
} as const
```

- [ ] **Step 4: Implement barrel**

Create `mobile/lib/motion/index.ts`:

```ts
export * from './tokens'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `./scripts/npmw run test -- tests/unit/motion-tokens.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Typecheck + commit**

Run: `./scripts/npmw run typecheck`
Expected: no errors.

```bash
git add mobile/lib/motion/ tests/unit/motion-tokens.test.ts
git commit -m "feat(motion): add motion tokens module (springs, durations, easings)"
```

---

## Task 2: Category hues module

**Files:**
- Create: `mobile/theme/category-hues.ts`
- Test: `tests/unit/category-hues.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/category-hues.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  categoryHues,
  resolveCategoryHue,
  CATEGORY_HUE_KEYS,
} from '@/theme/category-hues'

describe('category hues', () => {
  it('exposes 8 canonical hue keys', () => {
    expect(CATEGORY_HUE_KEYS).toEqual([
      'comida', 'transporte', 'casa', 'salud',
      'ocio', 'servicios', 'ropa', 'otros',
    ])
  })

  it('every canonical hue has light and dark variants with surface + ink', () => {
    for (const key of CATEGORY_HUE_KEYS) {
      const hue = categoryHues[key]
      expect(hue.light.surface).toMatch(/^#[0-9A-F]{6}$/i)
      expect(hue.light.ink).toMatch(/^#[0-9A-F]{6}$/i)
      expect(hue.dark.surface).toMatch(/^#[0-9A-F]{6}$/i)
      expect(hue.dark.ink).toMatch(/^#[0-9A-F]{6}$/i)
    }
  })

  it('resolveCategoryHue returns the canonical hue when key is known', () => {
    const hue = resolveCategoryHue('comida')
    expect(hue).toBe(categoryHues.comida)
  })

  it('resolveCategoryHue returns a deterministic fallback hue for unknown ids', () => {
    const hue1 = resolveCategoryHue('abc-123')
    const hue2 = resolveCategoryHue('abc-123')
    expect(hue1).toBe(hue2)
    expect(CATEGORY_HUE_KEYS).toContain(hue1.key)
  })

  it('different unknown ids can map to different hues', () => {
    const keys = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
        .map((id) => resolveCategoryHue(id).key),
    )
    expect(keys.size).toBeGreaterThan(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/npmw run test -- tests/unit/category-hues.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement category hues**

Create `mobile/theme/category-hues.ts`:

```ts
export type CategoryHueKey =
  | 'comida' | 'transporte' | 'casa' | 'salud'
  | 'ocio' | 'servicios' | 'ropa' | 'otros'

export const CATEGORY_HUE_KEYS: readonly CategoryHueKey[] = [
  'comida', 'transporte', 'casa', 'salud',
  'ocio', 'servicios', 'ropa', 'otros',
] as const

export interface CategoryHueVariant {
  surface: string
  ink: string
}

export interface CategoryHue {
  key: CategoryHueKey
  light: CategoryHueVariant
  dark: CategoryHueVariant
}

export const categoryHues: Record<CategoryHueKey, CategoryHue> = {
  comida:    { key: 'comida',    light: { surface: '#FCE8D7', ink: '#8A4A1A' }, dark: { surface: '#3A2C20', ink: '#E8B892' } },
  transporte:{ key: 'transporte',light: { surface: '#DDE8F5', ink: '#2A4E7A' }, dark: { surface: '#1C2938', ink: '#A8C4E8' } },
  casa:      { key: 'casa',      light: { surface: '#E2EDDF', ink: '#2A5030' }, dark: { surface: '#1E2A1E', ink: '#A8C8AC' } },
  salud:     { key: 'salud',     light: { surface: '#F4DDDC', ink: '#8A3530' }, dark: { surface: '#3A2626', ink: '#E8A8A4' } },
  ocio:      { key: 'ocio',      light: { surface: '#E7DDF2', ink: '#5A3E8A' }, dark: { surface: '#2D2538', ink: '#C4A8E0' } },
  servicios: { key: 'servicios', light: { surface: '#F5EDD6', ink: '#7A5A1C' }, dark: { surface: '#342D1C', ink: '#E8CE8A' } },
  ropa:      { key: 'ropa',      light: { surface: '#E4DFD3', ink: '#5A4A30' }, dark: { surface: '#2D2A22', ink: '#C8B89A' } },
  otros:     { key: 'otros',     light: { surface: '#DCE5E5', ink: '#425252' }, dark: { surface: '#1E2626', ink: '#A8B8B8' } },
}

function hashString(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

export function resolveCategoryHue(categoryKeyOrId: string): CategoryHue {
  if ((CATEGORY_HUE_KEYS as readonly string[]).includes(categoryKeyOrId)) {
    return categoryHues[categoryKeyOrId as CategoryHueKey]
  }
  const index = hashString(categoryKeyOrId) % CATEGORY_HUE_KEYS.length
  return categoryHues[CATEGORY_HUE_KEYS[index]]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/npmw run test -- tests/unit/category-hues.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Typecheck + commit**

Run: `./scripts/npmw run typecheck`
Expected: no errors.

```bash
git add mobile/theme/category-hues.ts tests/unit/category-hues.test.ts
git commit -m "feat(theme): add category hues map with deterministic fallback"
```

---

## Task 3: Typography module (extract + expand)

**Files:**
- Create: `mobile/theme/typography.ts`
- Modify: `mobile/theme/palette.ts` (remove typography, keep re-export for backward compat)
- Test: `tests/unit/typography-tokens.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/typography-tokens.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { typography, TYPOGRAPHY_PRESET_KEYS } from '@/theme/typography'

describe('typography tokens', () => {
  it('exposes the full expected preset set', () => {
    expect(TYPOGRAPHY_PRESET_KEYS).toEqual([
      'hero',
      'displayLarge',
      'screenTitle',
      'sectionTitle',
      'titleMedium',
      'metricLarge',
      'metricValue',
      'buttonDefault',
      'buttonCompact',
      'bodyLarge',
      'body',
      'bodyEmphasis',
      'bodySmall',
      'eyebrow',
      'fieldLabel',
      'caption',
    ])
  })

  it('hero is the largest at 54 / 900 with tight letter spacing', () => {
    expect(typography.hero.fontSize).toBe(54)
    expect(typography.hero.fontWeight).toBe('900')
    expect(typography.hero.letterSpacing).toBe(-2)
  })

  it('eyebrow is uppercase with positive letter spacing', () => {
    expect(typography.eyebrow.textTransform).toBe('uppercase')
    expect(typography.eyebrow.letterSpacing).toBeGreaterThan(0)
  })

  it('caption exists at 11 / 500', () => {
    expect(typography.caption.fontSize).toBe(11)
    expect(typography.caption.fontWeight).toBe('500')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/npmw run test -- tests/unit/typography-tokens.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement typography module**

Create `mobile/theme/typography.ts`:

```ts
import type { TextStyle } from 'react-native'

export type TypographyPresetKey =
  | 'hero' | 'displayLarge' | 'screenTitle' | 'sectionTitle' | 'titleMedium'
  | 'metricLarge' | 'metricValue'
  | 'buttonDefault' | 'buttonCompact'
  | 'bodyLarge' | 'body' | 'bodyEmphasis' | 'bodySmall'
  | 'eyebrow' | 'fieldLabel' | 'caption'

export const TYPOGRAPHY_PRESET_KEYS: readonly TypographyPresetKey[] = [
  'hero',
  'displayLarge',
  'screenTitle',
  'sectionTitle',
  'titleMedium',
  'metricLarge',
  'metricValue',
  'buttonDefault',
  'buttonCompact',
  'bodyLarge',
  'body',
  'bodyEmphasis',
  'bodySmall',
  'eyebrow',
  'fieldLabel',
  'caption',
] as const

export const typography: Record<TypographyPresetKey, TextStyle> = {
  hero:          { fontSize: 54, fontWeight: '900', letterSpacing: -2 },
  displayLarge:  { fontSize: 40, fontWeight: '900', letterSpacing: -1.5 },
  screenTitle:   { fontSize: 32, fontWeight: '900', letterSpacing: -0.8 },
  sectionTitle:  { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  titleMedium:   { fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
  metricLarge:   { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  metricValue:   { fontSize: 22, fontWeight: '800' },
  buttonDefault: { fontSize: 15, fontWeight: '700' },
  buttonCompact: { fontSize: 13, fontWeight: '700' },
  bodyLarge:     { fontSize: 15, fontWeight: '400', lineHeight: 22 },
  body:          { fontSize: 14, fontWeight: '400', lineHeight: 20 },
  bodyEmphasis:  { fontSize: 15, fontWeight: '600' },
  bodySmall:     { fontSize: 13, fontWeight: '400', lineHeight: 18 },
  eyebrow:       { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  fieldLabel:    { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  caption:       { fontSize: 11, fontWeight: '500' },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/npmw run test -- tests/unit/typography-tokens.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Typecheck + commit**

Run: `./scripts/npmw run typecheck`

```bash
git add mobile/theme/typography.ts tests/unit/typography-tokens.test.ts
git commit -m "feat(theme): add expanded typography preset module"
```

Note: `palette.ts` still has its old `typography` field at this point — Task 7 removes it.

---

## Task 4: Redesigned palette colors

**Files:**
- Modify: `mobile/theme/palette.ts`
- Test: `tests/unit/palette-tokens.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/palette-tokens.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildTheme, brand } from '@/theme/palette'

describe('palette tokens', () => {
  it('brand constants are cross-mode identical', () => {
    expect(brand.deep).toBe('#0F2E1F')
    expect(brand.bright).toBe('#7AD8A3')
    expect(brand.surfaceSoft).toBe('rgba(122,216,163,0.12)')
  })

  it('light theme has warm canvas and deep-green text', () => {
    const theme = buildTheme('light')
    expect(theme.colors.canvas).toBe('#F4F2ED')
    expect(theme.colors.surface).toBe('#FFFFFF')
    expect(theme.colors.text).toBe('#0F2E1F')
  })

  it('dark theme has deep canvas and pale text', () => {
    const theme = buildTheme('dark')
    expect(theme.colors.canvas).toBe('#0A1A12')
    expect(theme.colors.surface).toBe('#102018')
    expect(theme.colors.text).toBe('#F8FBF8')
  })

  it('both modes expose brand constants on theme.brand', () => {
    expect(buildTheme('light').brand.deep).toBe('#0F2E1F')
    expect(buildTheme('dark').brand.bright).toBe('#7AD8A3')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/npmw run test -- tests/unit/palette-tokens.test.ts`
Expected: FAIL.

- [ ] **Step 3: Redesign `palette.ts` colors**

Open [mobile/theme/palette.ts](../../../mobile/theme/palette.ts) and replace the contents above the `baseTheme` constant (keeping `baseTheme` untouched for now — spacing/radii happen in Tasks 5-6) with:

```ts
export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedThemeMode = 'light' | 'dark'

export const brand = {
  deep:         '#0F2E1F',
  bright:       '#7AD8A3',
  surfaceSoft:  'rgba(122,216,163,0.12)',
} as const

export interface ThemeColors {
  canvas: string
  background: string          // alias of canvas — kept for backward compat during migration
  backgroundElevated: string  // alias of surface
  surface: string
  surfaceMuted: string
  surfaceStrong: string
  border: string
  borderStrong: string
  text: string
  textMuted: string
  textSoft: string
  primary: string             // alias for brand.deep in light / brand.bright in dark
  primaryStrong: string
  primarySurface: string
  success: string
  warning: string
  danger: string
  overlay: string
}

const lightColors: ThemeColors = {
  canvas:             '#F4F2ED',
  background:         '#F4F2ED',  // backward-compat alias
  backgroundElevated: '#FFFFFF',
  surface:            '#FFFFFF',
  surfaceMuted:       '#EEE9DF',
  surfaceStrong:      '#E4DFD3',
  border:             'rgba(15,46,31,0.08)',
  borderStrong:       'rgba(15,46,31,0.15)',
  text:               '#0F2E1F',
  textMuted:          '#6B7566',
  textSoft:           '#7A8A7D',
  primary:            brand.deep,
  primaryStrong:      '#0A2016',
  primarySurface:     brand.surfaceSoft,
  success:            '#1C7E3A',
  warning:            '#C27A0A',
  danger:             '#C23A2F',
  overlay:            'rgba(15,46,31,0.32)',
}

const darkColors: ThemeColors = {
  canvas:             '#0A1A12',
  background:         '#0A1A12',
  backgroundElevated: '#102018',
  surface:            '#102018',
  surfaceMuted:       '#0F2E1F',
  surfaceStrong:      '#17301F',
  border:             'rgba(255,255,255,0.06)',
  borderStrong:       'rgba(255,255,255,0.12)',
  text:               '#F8FBF8',
  textMuted:          '#B8C9BE',
  textSoft:           '#6B8F78',
  primary:            brand.bright,
  primaryStrong:      '#9AE8BD',
  primarySurface:     brand.surfaceSoft,
  success:            '#7AD8A3',
  warning:            '#F3BA57',
  danger:             '#F06A6A',
  overlay:            'rgba(0,0,0,0.52)',
}
```

Then update the `AppTheme` interface further down in `palette.ts`:

```ts
export interface AppTheme {
  colors: ThemeColors
  brand: typeof brand
  isDark: boolean
  mode: ResolvedThemeMode
  spacing: typeof baseTheme.spacing
  radii: typeof baseTheme.radii
  typography: typeof baseTheme.typography
}
```

And `buildTheme`:

```ts
export function buildTheme(mode: ResolvedThemeMode): AppTheme {
  return {
    colors: mode === 'dark' ? darkColors : lightColors,
    brand,
    isDark: mode === 'dark',
    mode,
    spacing: baseTheme.spacing,
    radii: baseTheme.radii,
    typography: baseTheme.typography,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/npmw run test -- tests/unit/palette-tokens.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Run full test suite (no unrelated regressions)**

Run: `./scripts/npmw run test`
Expected: PASS — all existing tests still green. No test touches hardcoded hex values in palette.

- [ ] **Step 6: Typecheck + commit**

Run: `./scripts/npmw run typecheck`

```bash
git add mobile/theme/palette.ts tests/unit/palette-tokens.test.ts
git commit -m "feat(theme): redesign palette with brand constants + dual-mode canvas"
```

---

## Task 5: Spacing evolution (4-base + `legacySpacing`)

**Files:**
- Modify: `mobile/theme/palette.ts`
- Extend: `tests/unit/palette-tokens.test.ts`

- [ ] **Step 1: Add failing assertions to palette tokens test**

Append to `tests/unit/palette-tokens.test.ts`:

```ts
import { buildTheme, legacySpacing } from '@/theme/palette'

describe('spacing tokens', () => {
  it('uses 4-base scale', () => {
    const theme = buildTheme('light')
    expect(theme.spacing).toEqual({
      xxs: 4,
      xs:  8,
      sm:  12,
      md:  16,
      lg:  24,
      xl:  32,
      xxl: 48,
    })
  })

  it('exposes legacySpacing during the migration window', () => {
    expect(legacySpacing).toEqual({
      xs:  6,
      sm:  10,
      md:  14,
      lg:  18,
      xl:  24,
      xxl: 32,
    })
  })
})
```

- [ ] **Step 2: Run test to verify new assertions fail**

Run: `./scripts/npmw run test -- tests/unit/palette-tokens.test.ts`
Expected: FAIL with `legacySpacing` import error + shape mismatches.

- [ ] **Step 3: Update `baseTheme.spacing` + add `legacySpacing`**

Edit `mobile/theme/palette.ts`. Replace the `spacing` field inside `baseTheme`:

```ts
// inside baseTheme:
  spacing: {
    xxs: 4,
    xs:  8,
    sm:  12,
    md:  16,
    lg:  24,
    xl:  32,
    xxl: 48,
  },
```

Add a top-level `legacySpacing` export ABOVE `baseTheme`:

```ts
/**
 * Deprecated — to be deleted at the end of Foundation Phase 1 (PR #1).
 * Use `theme.spacing` with the new 4-base scale instead.
 */
export const legacySpacing = {
  xs:  6,
  sm:  10,
  md:  14,
  lg:  18,
  xl:  24,
  xxl: 32,
} as const
```

- [ ] **Step 4: Run spacing tests to verify they pass**

Run: `./scripts/npmw run test -- tests/unit/palette-tokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck — existing consumers of `theme.spacing.xs` now get 8 instead of 6**

Run: `./scripts/npmw run typecheck`
Expected: no errors (types unchanged at spacing shape).

**Note:** This change silently shifts spacing values across the entire app. That is intentional — the visual migration is delivered per-folder in Tasks 8-10. Consumers remain mechanically compiling throughout; a human verifies each folder's visual result before committing. `legacySpacing` exists for the rare call site that specifically needs the old value during the transition.

- [ ] **Step 6: Commit**

```bash
git add mobile/theme/palette.ts tests/unit/palette-tokens.test.ts
git commit -m "feat(theme): evolve spacing to 4-base scale + legacy transition export"
```

---

## Task 6: Radii expansion

**Files:**
- Modify: `mobile/theme/palette.ts`
- Extend: `tests/unit/palette-tokens.test.ts`

- [ ] **Step 1: Add failing assertions**

Append to `tests/unit/palette-tokens.test.ts`:

```ts
describe('radii tokens', () => {
  it('exposes xs/sm/md/lg/xl/2xl/pill radii', () => {
    const theme = buildTheme('light')
    expect(theme.radii).toEqual({
      xs:  8,
      sm:  10,
      md:  14,
      lg:  18,
      xl:  22,
      '2xl': 28,
      pill: 999,
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `./scripts/npmw run test -- tests/unit/palette-tokens.test.ts`
Expected: FAIL (radii shape mismatch).

- [ ] **Step 3: Update `baseTheme.radii`**

In `mobile/theme/palette.ts`, replace the `radii` field inside `baseTheme`:

```ts
  radii: {
    xs:  8,
    sm:  10,
    md:  14,
    lg:  18,
    xl:  22,
    '2xl': 28,
    pill: 999,
  },
```

Update the `AppTheme['radii']` interface inline in `palette.ts` if it has explicit keys (use `typeof baseTheme.radii` if already typed that way, which Task 4 set up).

- [ ] **Step 4: Run tests**

Run: `./scripts/npmw run test -- tests/unit/palette-tokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `./scripts/npmw run typecheck`

**Expected:** some consumers using `theme.radii.xl` now get `22` instead of `28`. They may need to switch to `theme.radii['2xl']` for equivalent visual rendering — that's handled in the folder migrations (Tasks 8-10). No type errors expected because the keyed object shape is a superset of the old.

- [ ] **Step 6: Commit**

```bash
git add mobile/theme/palette.ts tests/unit/palette-tokens.test.ts
git commit -m "feat(theme): expand radii tokens with xs and 2xl"
```

---

## Task 7: ThemeProvider integration + typography swap

**Files:**
- Modify: `mobile/theme/theme-provider.tsx`
- Modify: `mobile/theme/palette.ts` (remove typography field from baseTheme, re-export from typography.ts)

- [ ] **Step 1: Make `palette.ts` re-export typography from the new module**

In `mobile/theme/palette.ts`:
  - Delete the `typography: { ... }` field inside `baseTheme`.
  - Add at the top of the file, with the other imports/declarations:
    ```ts
    import { typography } from './typography'
    ```
  - Update `AppTheme`:
    ```ts
    export interface AppTheme {
      colors: ThemeColors
      brand: typeof brand
      isDark: boolean
      mode: ResolvedThemeMode
      spacing: typeof baseTheme.spacing
      radii: typeof baseTheme.radii
      typography: typeof typography
    }
    ```
  - Update `buildTheme`:
    ```ts
    export function buildTheme(mode: ResolvedThemeMode): AppTheme {
      return {
        colors: mode === 'dark' ? darkColors : lightColors,
        brand,
        isDark: mode === 'dark',
        mode,
        spacing: baseTheme.spacing,
        radii: baseTheme.radii,
        typography,
      }
    }
    ```

- [ ] **Step 2: Read `mobile/theme/theme-provider.tsx` to see what it currently exposes**

Run: `cat mobile/theme/theme-provider.tsx | head -80`

Then make these updates inside the provider file:
  - If the provider exposes a `useTheme()` hook that returns `AppTheme`, no change needed beyond type propagation (the shape now includes `brand` and the expanded typography).
  - If there's a category color resolver, route it through `resolveCategoryHue` from `./category-hues`. Add this exported helper if it doesn't exist yet:
    ```ts
    import { resolveCategoryHue } from './category-hues'
    
    export function useCategoryHue(categoryKeyOrId: string) {
      const theme = useTheme()
      const hue = resolveCategoryHue(categoryKeyOrId)
      return theme.isDark ? hue.dark : hue.light
    }
    ```
  - Also re-export motion tokens for convenient access:
    ```ts
    export { motionDurations, motionSprings, motionEasings, motionStagger } from '@/lib/motion'
    export { typography as themeTypography } from './typography'
    export { brand, buildTheme } from './palette'
    export type { AppTheme, ThemeColors, ResolvedThemeMode, ThemePreference } from './palette'
    ```

- [ ] **Step 3: Run full test suite**

Run: `./scripts/npmw run test`
Expected: PASS — all existing tests + new token tests.

- [ ] **Step 4: Typecheck**

Run: `./scripts/npmw run typecheck`
Expected: no errors. If errors surface from typography being moved (consumers referencing now-missing fields), they will appear here and must be fixed inline. Most common: a consumer using `theme.typography.bodySmall.fontSize` — should still resolve if the shape is preserved.

- [ ] **Step 5: Commit**

```bash
git add mobile/theme/palette.ts mobile/theme/theme-provider.tsx
git commit -m "feat(theme): wire typography module + category hue hook + motion re-exports"
```

---

## Task 8: Migrate consumers — `mobile/components/ui/`

**Goal:** Visually verify every primitive in `mobile/components/ui/` still renders correctly with the new tokens. Where old `theme.spacing.xs` (now 8) or `theme.radii.xl` (now 22) give the wrong visual result, adjust the call site to the new token name.

**Files:** all `.tsx` files in `mobile/components/ui/`

**Strategy:** run the simulator, inspect each primitive in the dev preview, adjust as needed.

- [ ] **Step 1: Start the simulator**

Run in a separate terminal: `./scripts/npmw start` or `npx expo start --ios`
Open the app in the iOS simulator, authenticate, land on Home.

- [ ] **Step 2: Audit each primitive visually**

Navigate the app and observe:
  - Buttons: any button that used to have `padding: theme.spacing.xs` (was 6) now has 8 — acceptable, slightly roomier.
  - Cards: `borderRadius: theme.radii.xl` (was 28) now gives 22. Larger cards (`BrandedPanel`, `SummaryHeroCard`, `MetricCard`) should use `theme.radii['2xl']` for the 28 value.
  - Chips and pills: `theme.radii.pill` unchanged.
  - Text: typography presets unchanged at this point; colors do change (`text` is now `#0F2E1F` instead of `#111111`).

For each primitive that visually regresses:
  1. Open the file in `mobile/components/ui/<name>.tsx`.
  2. Identify the token usage.
  3. Substitute the right new token per visual intent (e.g. `theme.radii.xl` → `theme.radii['2xl']` where the old value of 28 was desired).

**Checklist** (tick when each has been visually verified):
  - [ ] `button.tsx` (AppButton — pay attention to padding on primary/secondary/ghost/danger; loading spinner should crossfade if present)
  - [ ] `card.tsx` (AppCard — `borderRadius: theme.radii['2xl']` is usually correct for the outer card)
  - [ ] `branded-panel.tsx` (hero variant — corners + spacing)
  - [ ] `chip.tsx`
  - [ ] `segmented-control.tsx`
  - [ ] `empty-state.tsx`
  - [ ] `error-state.tsx`
  - [ ] `loading-block.tsx`
  - [ ] `icon-button.tsx` (hit target unchanged; padding may shift)
  - [ ] `metric-card.tsx`
  - [ ] `mini-bars.tsx`
  - [ ] `modal-card.tsx`, `modal-card-header.tsx`
  - [ ] `progress-bar.tsx`
  - [ ] `screen.tsx`, `screen-header.tsx`, `section-header.tsx`
  - [ ] `skeleton-block.tsx`
  - [ ] `summary-hero-card.tsx`
  - [ ] `text-field.tsx`
  - [ ] `app-symbol.tsx`
  - [ ] `ambient-backdrop.tsx`

- [ ] **Step 3: Run typecheck + lint**

Run: `./scripts/npmw run typecheck && ./scripts/npmw run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/components/ui/
git commit -m "chore(ui): migrate primitives to new token scale"
```

---

## Task 9: Migrate consumers — home domain

**Goal:** same as Task 8 but for `mobile/components/home/` and `mobile/screens/home/`.

**Files:** all `.tsx` files in `mobile/components/home/` and `mobile/screens/home/`

- [ ] **Step 1: Visual audit of Home and Gastos screens in simulator**

Check:
  - `home-screen.tsx`
  - `home-overview-card.tsx` (hero value alignment, paycheck chip)
  - `financial-summary-radial.tsx` (canvas clear area around ring)
  - `daily-budget-ring.tsx`
  - `add-expense-form.tsx`
  - `add-expense-screen.tsx`
  - `expense-history-*.tsx` (row spacing, chip spacing)
  - `expense-categories-screen.tsx`, `expense-filters-screen.tsx`
  - `fixed-expenses-screen.tsx`, `add-fixed-expense-screen.tsx`
  - All `control-*.tsx` components

- [ ] **Step 2: Substitute tokens where visual intent drifted**

Typical substitutions:
  - `theme.spacing.xs` (was 6, now 8) → keep if looks right, drop to `legacySpacing.xs` only if layout tight and needs exactly 6.
  - `theme.radii.xl` (was 28, now 22) → promote to `theme.radii['2xl']` for hero-grade surfaces (home card, branded panel).
  - Any hardcoded `borderRadius: 20` or `borderRadius: 28` → replace with `theme.radii.lg` (18) or `theme.radii['2xl']` (28).
  - Any hardcoded color hex → replace with nearest `theme.colors.*` token.

- [ ] **Step 3: Typecheck + lint**

Run: `./scripts/npmw run typecheck && ./scripts/npmw run lint`

- [ ] **Step 4: Commit**

```bash
git add mobile/components/home/ mobile/screens/home/
git commit -m "chore(home): migrate home domain to new token scale"
```

---

## Task 10: Migrate consumers — remaining domains

**Goal:** same as Task 8 for the rest of the codebase.

**Folders to cover:**
  - `mobile/components/auth/`
  - `mobile/components/navigation/`
  - `mobile/components/root/`
  - `mobile/components/settings/`
  - `mobile/components/fixed-expenses/`
  - `mobile/components/bridges/`
  - `mobile/components/shared/`
  - `mobile/screens/auth/`
  - `mobile/screens/settings/`
  - `mobile/screens/shared/`
  - `mobile/providers/app-providers.tsx`

- [ ] **Step 1: Grep for hardcoded colors across these folders**

Run: `grep -rnE "#[0-9a-fA-F]{3,8}|rgba?\(" mobile/components/auth mobile/components/navigation mobile/components/root mobile/components/settings mobile/components/fixed-expenses mobile/components/bridges mobile/components/shared mobile/screens/auth mobile/screens/settings mobile/screens/shared --include="*.tsx" --include="*.ts" | grep -v "node_modules"`

Inventory the result. Each hit is a decision: keep (if inside `auth-theme.ts` or variants that should remain literal) or replace with a theme token.

- [ ] **Step 2: Visual audit in simulator across these screens**

Check in order:
  - Login, signup, biometric entry
  - Join / Create Family
  - Settings (Ajustes)
  - Household setup wizard
  - Fixed expense editor modal (check modal card radii)
  - Notifications list
  - Tab bar
  - Root providers / blocking screens

- [ ] **Step 3: Substitute tokens per folder, commit per folder**

For each folder where changes are made, commit separately to keep diffs reviewable:

```bash
git add mobile/components/auth/
git commit -m "chore(auth): migrate to new token scale"

git add mobile/components/navigation/
git commit -m "chore(navigation): migrate to new token scale"

# ... one commit per folder that has changes
```

- [ ] **Step 4: Typecheck + lint + full test suite**

Run: `./scripts/npmw run validate`
Expected: all green.

- [ ] **Step 5: Final squash commit note**

After all folder commits, the diff should have no remaining references to `legacySpacing` (grep to confirm):

```bash
grep -rn "legacySpacing" mobile/ app/ --include="*.ts" --include="*.tsx"
```

Expected: no results, or only the `export const legacySpacing` line itself in `palette.ts`.

---

## Task 11: Remove `legacySpacing` + add CI grep guard

**Files:**
- Modify: `mobile/theme/palette.ts` (delete the `legacySpacing` export)
- Modify: `package.json` (add grep check to `validate` script)
- Extend: `tests/unit/palette-tokens.test.ts`

- [ ] **Step 1: Update the palette test to remove `legacySpacing` expectation**

Edit `tests/unit/palette-tokens.test.ts`. Delete the `it('exposes legacySpacing during the migration window', ...)` block.

- [ ] **Step 2: Delete `legacySpacing` from `palette.ts`**

Remove the entire `export const legacySpacing = { ... }` block and its doc comment.

- [ ] **Step 3: Run typecheck — any remaining consumer will fail here**

Run: `./scripts/npmw run typecheck`
Expected: no errors. If any surface, fix them by choosing a new-scale substitute in the failing file.

- [ ] **Step 4: Add grep guard to `validate` script**

Open `package.json`. Replace the `"validate"` script line:

```json
"validate": "npm run typecheck && npm run lint && npm run test && npm run guard:legacy-spacing",
"guard:legacy-spacing": "! grep -rn \"legacySpacing\" mobile app --include='*.ts' --include='*.tsx'",
```

Verify grep-guard semantics: `!` inverts exit code, so grep finding matches causes failure. On zsh this works as-is; on bash the exclamation point is safe inside quoted strings.

- [ ] **Step 5: Run validate end-to-end**

Run: `./scripts/npmw run validate`
Expected: all green. If `guard:legacy-spacing` fails, there's a remaining consumer — fix it and re-run.

- [ ] **Step 6: Commit**

```bash
git add mobile/theme/palette.ts tests/unit/palette-tokens.test.ts package.json
git commit -m "chore(theme): remove legacySpacing + add CI guard"
```

---

## Task 12: Final visual validation + PR prep

**Files:** none edited; this task verifies the PR is shippable.

- [ ] **Step 1: Run full validation**

Run: `./scripts/npmw run validate`
Expected: all green.

- [ ] **Step 2: Manual visual pass on iOS simulator**

Start the app and navigate each principal screen in both light and dark mode. Quick checklist:
  - [ ] Home — hero dark green, canvas cálido in light mode, deep canvas in dark.
  - [ ] Gastos / Historial — rows read correctly, chips not misaligned.
  - [ ] Add gasto — form still usable, spacing reasonable.
  - [ ] Control (hoy/plan/meses) — metrics aligned.
  - [ ] Gastos Fijos — all four segments.
  - [ ] Notificaciones.
  - [ ] Ajustes — list rows + household setup entry.
  - [ ] Auth (logout, log back in) — splash + login + biometric still themed correctly.
  - [ ] Dark mode toggle — every screen switches cleanly.

If any screen regressed visually beyond what was intentional, fix in a dedicated follow-up commit before merge.

- [ ] **Step 3: Manual device pass (release-like)**

If available, run on a physical iOS device to catch anything simulator hides (haptics, perceived motion).

- [ ] **Step 4: Sanity check — no typography-related literals remain in app code**

Run: `grep -rn "fontSize:" mobile/components/ui --include="*.tsx" | head -20`
A few hits are expected (the preset usage itself), but no ad-hoc `fontSize: 33, fontWeight: '900'` inline. Where any remain, migrate to the nearest typography preset.

- [ ] **Step 5: Push branch + open PR**

```bash
git push -u origin HEAD
gh pr create --title "Foundation P1 · Token foundation (palette, typography, motion, spacing, radii, hues)" --body "$(cat <<'EOF'
## Summary
- Implements Phase 1 of the Foundation Design v2 spec.
- Rewrites palette with brand constants + dual-mode canvas (light warm, dark deep).
- Extracts and expands typography presets into `mobile/theme/typography.ts`.
- Introduces `mobile/lib/motion/` with canonical spring/duration/easing tokens.
- Adds `mobile/theme/category-hues.ts` with 8 canonical muted hues + deterministic fallback.
- Evolves spacing to a 4-base scale (4/8/12/16/24/32/48). Removes transitional `legacySpacing`.
- Expands radii (`xs:8`, `xl:22`, `2xl:28`).
- No component API changes. Visual refresh derives entirely from token changes.

## Test plan
- [ ] CI green (`validate` now includes legacy-spacing grep guard).
- [ ] Manual: Home, Gastos, Add gasto, Control, Gastos Fijos, Notificaciones, Ajustes in both light and dark mode on simulator.
- [ ] Manual: Auth flow (logout, login, biometric) still themed correctly.
- [ ] Manual: physical device sanity pass.

## Out of scope
- Per-screen redesigns — sub-specs.
- New primitives (`AnimatedAmount`, `BottomSheet`, etc.) — Foundation Phase 2.
- Reanimated 4 adoption in existing motion hooks — Foundation Phase 4.

Spec: [docs/superpowers/specs/2026-04-21-foundation-design.md](docs/superpowers/specs/2026-04-21-foundation-design.md)
Plan: [docs/superpowers/plans/2026-04-21-foundation-p1-tokens.md](docs/superpowers/plans/2026-04-21-foundation-p1-tokens.md)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Remaining phases (separate plan documents)

This plan covers Phase 1 (Token Foundation) only. The remaining phases each get their own plan document after Phase 1 merges, informed by what was learned:

- **Phase 2 · Core new primitives** — `<AnimatedAmount>`, `<CategoryBadge>`, `<BottomSheet>` (+ `@gorhom/bottom-sheet` dep), `<StickyFooter>`, `<InputGroup>`, Skeleton suite. Will live at `docs/superpowers/plans/YYYY-MM-DD-foundation-p2-core-primitives.md`.
- **Phase 3 · Selection + swipe + utility hooks** — `<SelectableRow>`, `<SelectableCard>`, `<SwipeableRow>`, `useTabHaptics`, `useKeyboardChain`.
- **Phase 4 · Existing primitive upgrades** — press-scale migration to Reanimated 4 worklets, `<Screen>` scroll-linked title, `<SegmentedControl>` pill slider, `<Chip>` hue variants, `<AppButton>` `accent` variant.
- **Phase 5 · Copy + cleanup** — `glossary.ts`, `states.ts`, grep gate, `shared/` → `ui/` move, 5-10 copy string rewrites.

Each phase is independently shippable and will follow the same brainstorm → spec → plan → execute loop as needed (though the spec for all phases is already written — only the execution plan per phase needs authoring).
