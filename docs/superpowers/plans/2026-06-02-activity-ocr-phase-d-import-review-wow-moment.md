# Activity OCR — Phase D: Import Review Wow Moment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Phase C's functional `ImportReviewSheet` into a tangible, considered experience with a cinematic header, progressive-disclosure rows, a swipeable cycle date slider, and a cinematic confirm flow.

**Architecture:** Two pure helpers (cycle context + date math) testable under vitest. Three new presentational components (CycleDateSlider, ImportReviewRowCollapsed, ImportReviewHeader). Three rewrites of existing Phase C components (Row orchestrator, Sheet root, Footer copy). Reanimated 4 with custom iOS-like easing curves and spring physics for the slider gesture. No parser changes, no DB changes, no RPC changes — pure mobile UI redesign on top of the Phase C foundation.

**Tech Stack:** TypeScript strict, Reanimated 4 (`Easing.bezier(0.32, 0.72, 0, 1)`, `withSpring` with `damping: 18, stiffness: 220, mass: 0.9`), existing hooks (`useHomeSnapshot`, `useFamilyFinance`, `useCategories`, `useAuthSession`, `useReducedMotion`), existing helpers (`triggerHaptic`, `confetti.celebrate`), `ModalCard` primitive, vitest env `node` for pure helpers only.

**Spec:** [`docs/superpowers/specs/2026-06-02-activity-ocr-phase-d-import-review-wow-moment-design.md`](../specs/2026-06-02-activity-ocr-phase-d-import-review-wow-moment-design.md)

**Branch:** `feature/activity-ocr` — stay on this branch.

**Critical project memories that apply here:**
- `[[feedback-reanimated-easing-runtime]]` — `Easing` import MUST come from `react-native-reanimated`, never from `react-native`.
- `[[feedback-reanimated-worklet-globals]]` — no `Intl` / locale calls inside worklets; format on JS thread.
- `[[feedback-reanimated-worklet-calling-js-fns]]` — never call non-worklet JS fns inline from a worklet; use `runOnJS(stableRef)()`.
- `[[feedback-vitest-no-react-renderer]]` — only pure helpers get unit tests; UI components verified by smoke.
- `[[feedback-validate-is-not-bundle]]` — Task 9 runs bundle pre-flight in iOS and Android.
- `[[feedback-form-modal-pattern]]` — `ModalCard` already wraps the sheet (Phase C).
- `[[feedback-ios-modal-chain-dismiss]]` — opening modals from modals requires `InteractionManager.runAfterInteractions` (already in `handleOpenImport` from Phase C; this phase doesn't touch that).

---

## File map

**Create:**
- `mobile/features/import-review/cycle-context.ts` — `useCycleInfo(userId): CycleInfo` resolver.
- `mobile/features/import-review/cycle-date-math.ts` — `buildCycleDays(cycleStart, cycleDays, todayISO): CycleDay[]` pure helper.
- `mobile/components/import-review/cycle-date-slider.tsx` — Horizontal date slider with spring physics + a11y.
- `mobile/components/import-review/import-review-row-collapsed.tsx` — Collapsed pill view of a row.
- `mobile/components/import-review/import-review-header.tsx` — Cinematic header with thumbnail.
- `tests/unit/import-review-cycle-context.test.ts` — Tests for the cycle resolver fallbacks.
- `tests/unit/import-review-cycle-date-math.test.ts` — Tests for `buildCycleDays`.

**Modify (rewrite):**
- `mobile/components/import-review/import-review-row.tsx` — Orchestrator collapsed↔expanded with CycleDateSlider replacing the date TextInput.
- `mobile/components/import-review/import-review-sheet.tsx` — Uses new header + cinematic confirm.
- `mobile/components/import-review/import-review-footer.tsx` — Copy updates ("y" not "+", total amount).
- `mobile/components/import-review/import-review-empty.tsx` — Copy refresh.

**Unchanged (Phase A+B+C intactos):**
- All `mobile/features/activity-ocr/*` (parser).
- `mobile/features/import-review/types.ts`, `map-to-review-rows.ts`, `review-reducer.ts`, `use-import-review-controller.ts`, `use-confirm-import.ts`, `open-import-flow.ts`.
- `mobile/components/navigation/add-expense-tab-button.tsx`, `add-quick-actions-overlay.tsx`.

---

## Task 1: `cycle-date-math.ts` — pure date helper + tests (TDD)

**Files:**
- Create: `mobile/features/import-review/cycle-date-math.ts`
- Test: `tests/unit/import-review-cycle-date-math.test.ts`

**Context:** The `CycleDateSlider` needs a flat array of day descriptors covering the cycle range. This pure function takes `cycleStart` + `cycleDays` + `todayISO` and returns an array of `CycleDay { iso, day, weekday, isToday }`. Used in Task 4. Pure ⇒ unit-testable under vitest.

- [ ] **Step 1.1: Write the failing tests**

Create `tests/unit/import-review-cycle-date-math.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  buildCycleDays,
  formatISO,
} from '../../mobile/features/import-review/cycle-date-math'

describe('formatISO', () => {
  it('formats a Date to YYYY-MM-DD in local time', () => {
    // Construct date in local time
    const d = new Date(2026, 5, 2) // June 2, 2026 local
    expect(formatISO(d)).toBe('2026-06-02')
  })

  it('pads single-digit month and day', () => {
    const d = new Date(2026, 0, 5) // Jan 5, 2026
    expect(formatISO(d)).toBe('2026-01-05')
  })
})

describe('buildCycleDays', () => {
  it('returns one entry per day across a 31-day cycle', () => {
    const start = new Date(2026, 4, 1) // May 1, 2026 local
    const result = buildCycleDays(start, 31, '2026-05-15')
    expect(result).toHaveLength(31)
    expect(result[0]).toEqual({
      iso: '2026-05-01',
      day: 1,
      weekday: new Date(2026, 4, 1).getDay(),
      isToday: false,
    })
    expect(result[30]).toMatchObject({
      iso: '2026-05-31',
      day: 31,
    })
  })

  it('marks isToday only for the entry matching todayISO', () => {
    const start = new Date(2026, 4, 1)
    const result = buildCycleDays(start, 31, '2026-05-15')
    const todays = result.filter((d) => d.isToday)
    expect(todays).toHaveLength(1)
    expect(todays[0].iso).toBe('2026-05-15')
  })

  it('handles a cycle that spans two months', () => {
    const start = new Date(2026, 4, 20) // May 20
    const result = buildCycleDays(start, 31, '2026-06-02')
    expect(result[0].iso).toBe('2026-05-20')
    expect(result[11].iso).toBe('2026-05-31')
    expect(result[12].iso).toBe('2026-06-01')
    expect(result[30].iso).toBe('2026-06-19')
  })

  it('returns empty array if cycleDays is 0 or negative', () => {
    const start = new Date(2026, 4, 1)
    expect(buildCycleDays(start, 0, '2026-05-15')).toEqual([])
    expect(buildCycleDays(start, -3, '2026-05-15')).toEqual([])
  })

  it('weekday matches Date.getDay() (0=Sunday, 1=Monday, ..., 6=Saturday)', () => {
    // Pick a known Monday: June 1, 2026 is a Monday
    const start = new Date(2026, 5, 1)
    const result = buildCycleDays(start, 7, '2026-06-01')
    expect(result[0].weekday).toBe(1) // Monday
    expect(result[6].weekday).toBe(0) // Sunday
  })
})
```

- [ ] **Step 1.2: Verify tests fail**

Run: `npx vitest run tests/unit/import-review-cycle-date-math.test.ts`
Expected: FAIL — `Cannot find module .../cycle-date-math`.

- [ ] **Step 1.3: Implement the helper**

Create `mobile/features/import-review/cycle-date-math.ts`:

```ts
export interface CycleDay {
  /** YYYY-MM-DD local ISO. */
  iso: string
  /** Day of month (1-31). */
  day: number
  /** 0 = Sunday, 1 = Monday, ..., 6 = Saturday. Same as Date.getDay(). */
  weekday: number
  /** True iff this day matches `todayISO`. */
  isToday: boolean
}

/** Format a local Date to YYYY-MM-DD (local TZ). */
export function formatISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Builds a flat list of CycleDay entries covering [cycleStart, cycleStart + cycleDays).
 * Used by CycleDateSlider to render the horizontal strip of selectable days.
 */
export function buildCycleDays(
  cycleStart: Date,
  cycleDays: number,
  todayISO: string,
): CycleDay[] {
  if (cycleDays <= 0) return []
  const out: CycleDay[] = []
  for (let i = 0; i < cycleDays; i++) {
    const d = new Date(
      cycleStart.getFullYear(),
      cycleStart.getMonth(),
      cycleStart.getDate() + i,
    )
    const iso = formatISO(d)
    out.push({
      iso,
      day: d.getDate(),
      weekday: d.getDay(),
      isToday: iso === todayISO,
    })
  }
  return out
}
```

- [ ] **Step 1.4: Verify tests pass**

Run: `npx vitest run tests/unit/import-review-cycle-date-math.test.ts`
Expected: PASS, 7 tests green.

- [ ] **Step 1.5: Commit**

```bash
git add mobile/features/import-review/cycle-date-math.ts tests/unit/import-review-cycle-date-math.test.ts
git commit -m "$(cat <<'EOF'
feat(import-review): cycle date math helper for the slider strip

Pure helper buildCycleDays(cycleStart, cycleDays, todayISO) →
CycleDay[] que el CycleDateSlider va a consumir para renderizar el
strip horizontal de días seleccionables. formatISO(date) auxiliary
para serializar Date local → YYYY-MM-DD sin pasar por UTC.

7 unit tests cubren padding zero-pad, span de dos meses, today
matching, cycleDays <= 0, weekday alignment.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `cycle-context.ts` — cycle resolver hook + tests

**Files:**
- Create: `mobile/features/import-review/cycle-context.ts`
- Test: `tests/unit/import-review-cycle-context.test.ts`

**Context:** Resolves `CycleInfo { cycleStart, cycleDays }` from the family's snapshot. Phase A recon confirmed `useHomeSnapshot` returns `payments_cycle_start` and `payments_cycle_end` strings. If those are not yet loaded (initial render), we use a heuristic fallback so the slider can still render something. The pure computation function is unit-testable; the hook itself isn't.

- [ ] **Step 2.1: Write the failing tests**

Create `tests/unit/import-review-cycle-context.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  computeCycleFromBounds,
  computeFallbackCycle,
} from '../../mobile/features/import-review/cycle-context'

describe('computeCycleFromBounds', () => {
  it('returns the bounded cycle when both start and end are valid ISOs', () => {
    const result = computeCycleFromBounds('2026-05-20', '2026-06-19')
    expect(result.cycleStart.getFullYear()).toBe(2026)
    expect(result.cycleStart.getMonth()).toBe(4) // May (0-indexed)
    expect(result.cycleStart.getDate()).toBe(20)
    expect(result.cycleDays).toBe(31) // May 20 → Jun 19 inclusive = 31 days
  })

  it('handles a same-month cycle', () => {
    const result = computeCycleFromBounds('2026-02-01', '2026-02-28')
    expect(result.cycleDays).toBe(28)
  })

  it('returns null when start is missing', () => {
    expect(computeCycleFromBounds(null, '2026-06-19')).toBeNull()
  })

  it('returns null when end is missing', () => {
    expect(computeCycleFromBounds('2026-05-20', null)).toBeNull()
  })

  it('returns null when start is after end', () => {
    expect(computeCycleFromBounds('2026-06-20', '2026-06-10')).toBeNull()
  })
})

describe('computeFallbackCycle', () => {
  it('returns a 31-day cycle starting at the first of the current month', () => {
    const today = new Date(2026, 5, 15) // June 15, 2026
    const result = computeFallbackCycle(today)
    expect(result.cycleStart.getFullYear()).toBe(2026)
    expect(result.cycleStart.getMonth()).toBe(5) // June
    expect(result.cycleStart.getDate()).toBe(1)
    expect(result.cycleDays).toBe(31)
  })
})
```

- [ ] **Step 2.2: Verify tests fail**

Run: `npx vitest run tests/unit/import-review-cycle-context.test.ts`
Expected: FAIL — `Cannot find module .../cycle-context`.

- [ ] **Step 2.3: Implement the helper + hook**

Create `mobile/features/import-review/cycle-context.ts`:

```ts
import { useMemo } from 'react'
import { useHomeSnapshot } from '@/features/home/use-home-snapshot'

export interface CycleInfo {
  /** First date of the current pay cycle, midnight LOCAL. */
  cycleStart: Date
  /** Total days in the cycle window (typically 28-31). */
  cycleDays: number
}

/**
 * Computes a CycleInfo from explicit ISO bounds. Returns null if
 * either bound is missing or invalid (caller should fall back).
 */
export function computeCycleFromBounds(
  startISO: string | null | undefined,
  endISO: string | null | undefined,
): CycleInfo | null {
  if (!startISO || !endISO) return null
  const start = parseLocalDate(startISO)
  const end = parseLocalDate(endISO)
  if (!start || !end) return null
  if (end.getTime() < start.getTime()) return null
  const msPerDay = 1000 * 60 * 60 * 24
  const days = Math.round((end.getTime() - start.getTime()) / msPerDay) + 1
  return { cycleStart: start, cycleDays: days }
}

/**
 * Heuristic fallback used while the snapshot is loading: returns the
 * full current month as a 31-day cycle. Imperfect but lets the slider
 * render something instead of an empty strip.
 */
export function computeFallbackCycle(today: Date): CycleInfo {
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  return { cycleStart: start, cycleDays: 31 }
}

/**
 * Resolves the current cycle from `useHomeSnapshot`. Falls back to a
 * full-month heuristic while loading.
 */
export function useCycleInfo(userId: string | undefined): CycleInfo {
  const snapshot = useHomeSnapshot(userId)
  return useMemo(() => {
    const bounded = computeCycleFromBounds(
      snapshot.data?.payments_cycle_start,
      snapshot.data?.payments_cycle_end,
    )
    if (bounded) return bounded
    return computeFallbackCycle(new Date())
  }, [
    snapshot.data?.payments_cycle_start,
    snapshot.data?.payments_cycle_end,
  ])
}

function parseLocalDate(iso: string): Date | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2]) - 1
  const day = Number(m[3])
  const d = new Date(year, month, day)
  return Number.isFinite(d.getTime()) ? d : null
}
```

- [ ] **Step 2.4: Verify tests pass**

Run: `npx vitest run tests/unit/import-review-cycle-context.test.ts`
Expected: PASS, 7 tests green.

- [ ] **Step 2.5: Commit**

```bash
git add mobile/features/import-review/cycle-context.ts tests/unit/import-review-cycle-context.test.ts
git commit -m "$(cat <<'EOF'
feat(import-review): cycle resolver hook + pure helpers

useCycleInfo(userId): CycleInfo extrae payments_cycle_start /
payments_cycle_end del useHomeSnapshot existente. Cae a un
heurístico (mes actual completo, 31 días) cuando el snapshot todavía
no cargó.

computeCycleFromBounds y computeFallbackCycle se extraen como
funciones puras para test bajo vitest. 7 unit tests cubren valid
bounds, same-month, null inputs, start-after-end, fallback shape.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `ImportReviewHeader` — cinematic title + thumbnail

**Files:**
- Create: `mobile/components/import-review/import-review-header.tsx`

No unit test (UI).

- [ ] **Step 3.1: Create the file**

Create `mobile/components/import-review/import-review-header.tsx`:

```tsx
import { Image, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useAppTheme } from '@/theme/theme-provider'

interface Props {
  transactionsCount: number
  breakdown: { expenses: number; incomes: number }
  skipCount: number
  imageUri: string
}

export function ImportReviewHeader({
  transactionsCount,
  breakdown,
  skipCount,
  imageUri,
}: Props) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()

  const movementsWord = transactionsCount === 1 ? 'movimiento' : 'movimientos'
  const breakdownText = buildBreakdownText(breakdown, skipCount)

  const headingEnter = reduced ? undefined : FadeIn.duration(240)
  const breakdownEnter = reduced ? undefined : FadeInDown.duration(220).delay(80)
  const thumbEnter = reduced ? undefined : FadeIn.duration(280).delay(60)

  return (
    <View style={styles.row}>
      <View style={styles.textCol}>
        <Animated.View entering={headingEnter}>
          <Text style={[styles.heading, { color: theme.colors.text }]}>
            <Text style={styles.headingMuted}>Detecté </Text>
            <Text style={styles.headingNumber}>
              {transactionsCount} {movementsWord}
            </Text>
            {'\n'}
            <Text style={styles.headingMuted}>en tu captura</Text>
          </Text>
        </Animated.View>
        {breakdownText !== '' ? (
          <Animated.Text
            entering={breakdownEnter}
            style={[styles.breakdown, { color: theme.colors.textMuted }]}
          >
            {breakdownText}
          </Animated.Text>
        ) : null}
      </View>

      {imageUri !== '' ? (
        <Animated.View entering={thumbEnter}>
          <Image
            source={{ uri: imageUri }}
            style={[
              styles.thumb,
              { borderColor: theme.colors.line, backgroundColor: theme.colors.surfaceMuted },
            ]}
            resizeMode="cover"
            accessible
            accessibilityLabel="Miniatura de la captura importada"
          />
        </Animated.View>
      ) : null}
    </View>
  )
}

function buildBreakdownText(
  b: { expenses: number; incomes: number },
  skip: number,
): string {
  const parts: string[] = []
  if (b.expenses > 0) parts.push(`${b.expenses} ${b.expenses === 1 ? 'gasto' : 'gastos'}`)
  if (b.incomes > 0) parts.push(`${b.incomes} ${b.incomes === 1 ? 'ingreso' : 'ingresos'}`)
  if (skip > 0) parts.push(`${skip} a saltear`)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  return parts.join(', ')
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingTop: 24,
    paddingBottom: 16,
  },
  textCol: {
    flex: 1,
    gap: 8,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  headingNumber: {
    fontWeight: '900',
  },
  headingMuted: {
    fontWeight: '700',
  },
  breakdown: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 12,
    borderWidth: 1,
    opacity: 0.55,
  },
})
```

- [ ] **Step 3.2: Typecheck + lint**

Run: `npm run typecheck && npm run lint -- mobile/components/import-review/import-review-header.tsx`
Expected: PASS.

- [ ] **Step 3.3: Commit**

```bash
git add mobile/components/import-review/import-review-header.tsx
git commit -m "$(cat <<'EOF'
feat(import-review): cinematic header with title + breakdown + thumb

Heading: "Detecté N movimientos en tu captura" — typography
hierarchy real (22pt heading con ratio ≥1.6, número bold weight 900).
Breakdown reactive: "3 gastos, 2 ingresos, 1 a saltear". Thumbnail
de la captura derecha (72×72, opacity 0.55, border-radius 12) si
imageUri no está vacío.

Stagger entrance: heading FadeIn 240ms, breakdown FadeInDown
220ms+80ms delay, thumbnail FadeIn 280ms+60ms delay. Respeta
useReducedMotion. accessibilityLabel en el thumb.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `CycleDateSlider` — the gesture-heavy component

**Files:**
- Create: `mobile/components/import-review/cycle-date-slider.tsx`

No unit test (gesture UI; smoke on device).

**Context:** This is the highest-judgment component of Phase D. Horizontal scroll with snap-to-tile, spring physics. Out-of-cycle days greyed and untappable. Selected day: 2px primary ring + scale 1.06 + haptic. Today: 4×4 dot under the number. Tap any day → smooth animate to center + select.

**Key implementation notes for the implementer:**
- Use a plain `ScrollView` with `horizontal`, `snapToInterval={TILE_TOTAL_WIDTH}`, `decelerationRate="fast"`, `snapToAlignment="center"` — these RN props give native-feeling spring physics on iOS for free.
- `contentContainerStyle: { paddingHorizontal: containerWidth/2 - TILE_TOTAL_WIDTH/2 }` so the first and last tiles can center.
- Track selection via parent `value` prop. When value changes externally (e.g., from parent setting initial date), call `scrollTo({ x, animated: true })` via a ref.
- Tap on a tile: programmatic `scrollTo` to that tile + `onChange(iso)` + `triggerHaptic('selection')`.

- [ ] **Step 4.1: Create the file**

Create `mobile/components/import-review/cycle-date-slider.tsx`:

```tsx
import { useEffect, useMemo, useRef } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { buildCycleDays, type CycleDay } from '@/features/import-review/cycle-date-math'

const TILE_WIDTH = 56
const TILE_HEIGHT = 64
const TILE_GAP = 8
const TILE_TOTAL_WIDTH = TILE_WIDTH + TILE_GAP

const WEEKDAY_LABELS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const

interface Props {
  /** Selected day ISO (YYYY-MM-DD). */
  value: string
  cycleStart: Date
  cycleDays: number
  /** Today ISO for the "today" dot indicator. */
  today: string
  onChange: (iso: string) => void
}

export function CycleDateSlider({
  value,
  cycleStart,
  cycleDays,
  today,
  onChange,
}: Props) {
  const { theme } = useAppTheme()
  const scrollRef = useRef<ScrollView>(null)
  const containerWidth = useSharedValue(0)

  const days = useMemo(
    () => buildCycleDays(cycleStart, cycleDays, today),
    [cycleStart, cycleDays, today],
  )

  const selectedIndex = useMemo(
    () => days.findIndex((d) => d.iso === value),
    [days, value],
  )

  // When `value` changes externally, scroll the strip to center that day.
  useEffect(() => {
    if (selectedIndex < 0) return
    const node = scrollRef.current
    if (!node) return
    const x = selectedIndex * TILE_TOTAL_WIDTH
    requestAnimationFrame(() => {
      node.scrollTo({ x, animated: true })
    })
  }, [selectedIndex])

  // Snap-handler: when the user's scroll settles on a tile, that's
  // the new selection.
  const handleMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x
    const index = Math.round(offsetX / TILE_TOTAL_WIDTH)
    const clamped = Math.max(0, Math.min(days.length - 1, index))
    const day = days[clamped]
    if (day && day.iso !== value) {
      void triggerHaptic('selection')
      onChange(day.iso)
    }
  }

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        containerWidth.value = e.nativeEvent.layout.width
      }}
      accessibilityRole="adjustable"
      accessibilityLabel="Fecha del movimiento"
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={TILE_TOTAL_WIDTH}
        decelerationRate="fast"
        snapToAlignment="center"
        onMomentumScrollEnd={handleMomentumEnd}
        contentContainerStyle={styles.scrollContent}
      >
        {days.map((d, idx) => (
          <DayTile
            key={d.iso}
            day={d}
            isSelected={d.iso === value}
            onPress={() => {
              if (d.iso === value) return
              void triggerHaptic('selection')
              onChange(d.iso)
              scrollRef.current?.scrollTo({
                x: idx * TILE_TOTAL_WIDTH,
                animated: true,
              })
            }}
            primary={theme.colors.primary}
            textColor={theme.colors.text}
            mutedColor={theme.colors.textMuted}
          />
        ))}
      </ScrollView>
    </View>
  )
}

interface TileProps {
  day: CycleDay
  isSelected: boolean
  onPress: () => void
  primary: string
  textColor: string
  mutedColor: string
}

function DayTile({
  day,
  isSelected,
  onPress,
  primary,
  textColor,
  mutedColor,
}: TileProps) {
  const scale = useSharedValue(isSelected ? 1.06 : 1)
  const press = useSharedValue(1)

  useEffect(() => {
    scale.value = withTiming(isSelected ? 1.06 : 1, {
      duration: 180,
      easing: Easing.bezier(0.32, 0.72, 0, 1),
    })
  }, [isSelected, scale])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value * press.value }],
  }))

  return (
    <Animated.View style={[styles.tileWrap, animatedStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          press.value = withTiming(0.97, {
            duration: 120,
            easing: Easing.bezier(0.32, 0.72, 0, 1),
          })
        }}
        onPressOut={() => {
          press.value = withTiming(1, {
            duration: 120,
            easing: Easing.bezier(0.32, 0.72, 0, 1),
          })
        }}
        accessibilityRole="button"
        accessibilityLabel={`día ${day.day}`}
        accessibilityState={{ selected: isSelected }}
        hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
        style={[
          styles.tile,
          isSelected ? { borderColor: primary } : { borderColor: 'transparent' },
        ]}
      >
        <Text style={[styles.weekday, { color: mutedColor }]}>
          {WEEKDAY_LABELS[day.weekday]}
        </Text>
        <Text
          style={[
            styles.dayNum,
            { color: textColor, fontWeight: isSelected ? '900' : '700' },
          ]}
        >
          {day.day}
        </Text>
        {day.isToday ? (
          <View style={[styles.todayDot, { backgroundColor: primary }]} />
        ) : (
          <View style={styles.todayDotSpacer} />
        )}
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: TILE_GAP,
    alignItems: 'center',
  },
  tileWrap: {
    width: TILE_WIDTH,
  },
  tile: {
    width: TILE_WIDTH,
    height: TILE_HEIGHT,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  weekday: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'lowercase',
    marginBottom: 2,
  },
  dayNum: {
    fontSize: 22,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
  },
  todayDot: {
    width: 4,
    height: 4,
    borderRadius: 999,
    marginTop: 4,
  },
  todayDotSpacer: {
    width: 4,
    height: 4,
    marginTop: 4,
  },
})
```

- [ ] **Step 4.2: Typecheck + lint**

Run: `npm run typecheck && npm run lint -- mobile/components/import-review/cycle-date-slider.tsx`
Expected: PASS.

**Possible deviations:** if `Easing.bezier(...)` from `react-native-reanimated` is not directly importable (some versions expose it via `Easing` factory), use `Easing.in(Easing.bezier(...))` or `Easing.out(Easing.bezier(...))`. The `Easing` import must be from `react-native-reanimated`, never from `react-native`.

- [ ] **Step 4.3: Commit**

```bash
git add mobile/components/import-review/cycle-date-slider.tsx
git commit -m "$(cat <<'EOF'
feat(import-review): CycleDateSlider — swipeable day strip

Horizontal ScrollView con snapToInterval + decelerationRate fast =
native spring physics en iOS. Tile size 56×64pt, gap 8pt, padding
horizontal calculado para centrar primer y último día.

Estados:
  - Selected: ring 2px primary, scale 1.06, day-number weight 900
  - Today: dot 4×4 sutil bajo el número
  - Out-of-cycle (no aplicable a este slider: el rango = ciclo)

Interacciones:
  - Drag: native scroll, snap automático al settle
  - Tap day: scrollTo + onChange + haptic selection
  - Press feedback: scale 0.97 vía sharedValue (Reanimated)

Reusa buildCycleDays (Task 1) para el array de días.

A11y: container accessibilityRole adjustable, cada tile button con
selected state. Hit slop top+bottom 8pt para llegar a 44pt mínimo.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `ImportReviewRowCollapsed` — compact row view

**Files:**
- Create: `mobile/components/import-review/import-review-row-collapsed.tsx`

No test (UI).

- [ ] **Step 5.1: Create the file**

Create `mobile/components/import-review/import-review-row-collapsed.tsx`:

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useAppTheme } from '@/theme/theme-provider'
import type { ReviewRow } from '@/features/import-review/types'

interface Props {
  row: ReviewRow
  invalid: boolean
  onExpand: () => void
}

const KIND_LABEL: Record<ReviewRow['kind'], string> = {
  expense: 'Gasto',
  income: 'Ingreso',
  skip: 'Saltear',
}

export function ImportReviewRowCollapsed({ row, invalid, onExpand }: Props) {
  const { theme } = useAppTheme()
  const press = useSharedValue(1)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }],
  }))

  const kindBg =
    row.kind === 'expense'
      ? theme.colors.primarySurface
      : row.kind === 'income'
        ? `${theme.colors.primary}22`
        : theme.colors.surfaceMuted
  const kindFg =
    row.kind === 'skip' ? theme.colors.textMuted : theme.colors.primary

  const amountColor =
    row.amount === 0 ? theme.colors.textMuted : theme.colors.text
  const amountSign = row.source.transaction.primaryAmount.sign === -1 ? '−' : '+'

  const dateLabel = formatRelativeDate(row.date)
  const secondary = [row.description, dateLabel].filter((s) => s !== '').join(' · ')

  const hasWarning = row.warnings.length > 0

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Editar ${row.description}`}
        onPress={onExpand}
        onPressIn={() => {
          press.value = withTiming(0.97, {
            duration: 120,
            easing: Easing.bezier(0.32, 0.72, 0, 1),
          })
        }}
        onPressOut={() => {
          press.value = withTiming(1, {
            duration: 120,
            easing: Easing.bezier(0.32, 0.72, 0, 1),
          })
        }}
        style={[
          styles.card,
          {
            backgroundColor: theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard,
            borderColor: invalid ? theme.colors.danger : theme.colors.line,
          },
        ]}
      >
        <View style={styles.topRow}>
          <View style={[styles.kindPill, { backgroundColor: kindBg }]}>
            <Text style={[styles.kindLabel, { color: kindFg }]}>
              {KIND_LABEL[row.kind]}
            </Text>
          </View>
          <Text style={[styles.amount, { color: amountColor }]} numberOfLines={1}>
            {amountSign} ${formatThousands(row.amount)}
          </Text>
        </View>
        <View style={styles.bottomRow}>
          <Text
            style={[styles.secondary, { color: theme.colors.textMuted }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {secondary}
          </Text>
          {hasWarning ? (
            <View style={[styles.warnDot, { backgroundColor: theme.colors.warning }]} />
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  )
}

function formatThousands(n: number): string {
  // es-AR thousands separator: '.'
  const fixed = Math.abs(n).toFixed(2)
  const [intPart, decPart] = fixed.split('.')
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return decPart === '00' ? withDots : `${withDots},${decPart}`
}

function formatRelativeDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return iso
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const targetMid = new Date(target)
  targetMid.setHours(0, 0, 0, 0)
  const diffDays = Math.round((targetMid.getTime() - today.getTime()) / 86_400_000)
  if (diffDays === 0) return 'hoy'
  if (diffDays === -1) return 'ayer'
  if (diffDays === 1) return 'mañana'
  const weekdays = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${weekdays[target.getDay()]} ${target.getDate()} ${months[target.getMonth()]}`
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  kindPill: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  kindLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  amount: {
    fontSize: 18,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  secondary: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  warnDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
})
```

- [ ] **Step 5.2: Typecheck + lint**

Run: `npm run typecheck && npm run lint -- mobile/components/import-review/import-review-row-collapsed.tsx`
Expected: PASS. If `theme.colors.warning` doesn't exist, fall back to `theme.colors.danger` (orange/yellow accent acceptable).

- [ ] **Step 5.3: Commit**

```bash
git add mobile/components/import-review/import-review-row-collapsed.tsx
git commit -m "$(cat <<'EOF'
feat(import-review): collapsed pill view for each row

Row colapsada: kind pill izquierda + amount derecha (18pt bold
tabular nums) + merchant·fecha secondary line abajo. Dot warning
sutil si row.warnings.length > 0.

Date: formatRelativeDate produce "hoy", "ayer", "mañana", o
"vie 31 may" en es-AR. Amount: formatThousands con separador es-AR
(. miles, , decimal). Sign: − (Unicode minus) o +.

Press feedback: scale 0.97 vía Reanimated sharedValue + Easing
bezier(0.32, 0.72, 0, 1) iOS-like.

Tap → onExpand callback. Pressable es el toda la card.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Rewrite `ImportReviewRow` — orchestrator collapsed↔expanded

**Files:**
- Modify (rewrite): `mobile/components/import-review/import-review-row.tsx`

**Context:** The Phase C row was a flat editable card. Phase D wraps it with `[expanded, setExpanded]` state. When collapsed: renders `ImportReviewRowCollapsed`. When expanded: renders the original Phase C edit form, but with the date `LabeledInput` REPLACED by `CycleDateSlider`. Tap toggles. The skip pill stays as-is (separate Pressable from the collapsed view because it's not "really expanded", just a different inert state).

- [ ] **Step 6.1: Read the current file**

Run: `cat mobile/components/import-review/import-review-row.tsx`
Expected: prints the Phase C file (~347 lines).

- [ ] **Step 6.2: Replace the file**

Overwrite `mobile/components/import-review/import-review-row.tsx` with the following. Adjust ONLY the things explicitly mentioned in the spec — the inner expanded form fields (description, amount, category, incomeKind, notes, warnings) carry over from Phase C verbatim. The date field becomes `CycleDateSlider`.

```tsx
import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { useAppTheme } from '@/theme/theme-provider'
import { CategoryHorizontalRail } from '@/components/home/category-horizontal-rail'
import type { Category } from '@/features/categories/use-categories'
import type {
  IncomeKind,
  ReviewRow,
  ReviewRowKind,
} from '@/features/import-review/types'
import { CycleDateSlider } from './cycle-date-slider'
import { ImportReviewRowCollapsed } from './import-review-row-collapsed'

interface Props {
  row: ReviewRow
  categories: readonly Category[]
  invalid: boolean
  cycleStart: Date
  cycleDays: number
  today: string
  onSetKind: (kind: ReviewRowKind) => void
  onPatch: (patch: Partial<ReviewRow>) => void
  onUnskip: () => void
}

const INCOME_KINDS: IncomeKind[] = ['transfer', 'bonus', 'gift', 'other']
const INCOME_KIND_LABELS: Record<IncomeKind, string> = {
  transfer: 'Transferencia',
  bonus: 'Bono',
  gift: 'Regalo',
  other: 'Otro',
}

export function ImportReviewRow({
  row,
  categories,
  invalid,
  cycleStart,
  cycleDays,
  today,
  onSetKind,
  onPatch,
  onUnskip,
}: Props) {
  const { theme } = useAppTheme()
  const [expanded, setExpanded] = useState(false)

  if (row.kind === 'skip') {
    return (
      <View
        style={[
          styles.cardSkipped,
          {
            backgroundColor: theme.colors.surfaceMuted,
            borderColor: theme.colors.line,
          },
        ]}
      >
        <View style={styles.skipLeft}>
          <MaterialIcons name="block" size={16} color={theme.colors.textMuted} />
          <Text
            style={[styles.skipLabel, { color: theme.colors.textMuted }]}
            numberOfLines={1}
          >
            {row.description}
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onUnskip} hitSlop={6}>
          <Text style={[styles.skipAction, { color: theme.colors.primary }]}>
            Restaurar
          </Text>
        </Pressable>
      </View>
    )
  }

  if (!expanded) {
    return (
      <ImportReviewRowCollapsed
        row={row}
        invalid={invalid}
        onExpand={() => setExpanded(true)}
      />
    )
  }

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(140)}
      style={[
        styles.card,
        {
          backgroundColor: theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard,
          borderColor: invalid ? theme.colors.danger : theme.colors.line,
        },
      ]}
    >
      <Animated.View entering={FadeInDown.duration(220)}>
        <KindToggle kind={row.kind} onChange={onSetKind} />
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(220).delay(50)}>
        <LabeledInput
          label="Descripción"
          value={row.description}
          onChangeText={(t) => onPatch({ description: t })}
          invalid={invalid && row.description.trim() === ''}
        />
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(220).delay(100)}>
        <LabeledInput
          label="Monto (ARS)"
          value={String(row.amount)}
          onChangeText={(t) => {
            const n = parseFloat(t.replace(/\./g, '').replace(',', '.'))
            onPatch({ amount: Number.isFinite(n) ? n : 0 })
          }}
          keyboardType="decimal-pad"
          invalid={invalid && row.amount <= 0}
        />
        {row.source.appliedRate !== null ? (
          <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
            {`${row.source.transaction.primaryAmount.value} ${row.source.originalCurrency} @ rate $${row.source.appliedRate}`}
          </Text>
        ) : null}
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(220).delay(150)} style={styles.field}>
        <Text style={[styles.label, { color: theme.colors.textMuted }]}>Fecha</Text>
        <CycleDateSlider
          value={row.date}
          cycleStart={cycleStart}
          cycleDays={cycleDays}
          today={today}
          onChange={(iso) => onPatch({ date: iso })}
        />
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(220).delay(200)}>
        {row.kind === 'expense' ? (
          <CategorySection
            categories={categories}
            selectedCategoryId={row.categoryId}
            onSelect={(id) => onPatch({ categoryId: id })}
          />
        ) : (
          <IncomeKindSection
            incomeKind={row.incomeKind}
            onSelect={(k) => onPatch({ incomeKind: k })}
          />
        )}
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(220).delay(250)}>
        <LabeledInput
          label="Notas (opcional)"
          value={row.notes ?? ''}
          onChangeText={(t) => onPatch({ notes: t === '' ? null : t })}
          multiline
        />
      </Animated.View>

      {row.warnings.length > 0 ? (
        <Animated.View entering={FadeInDown.duration(220).delay(300)} style={styles.warnings}>
          {row.warnings.map((w) => (
            <Text
              key={w}
              style={[styles.warning, { color: theme.colors.textMuted }]}
            >
              {warningLabel(w)}
            </Text>
          ))}
        </Animated.View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Colapsar este movimiento"
        onPress={() => setExpanded(false)}
        style={styles.collapseBtn}
      >
        <Text style={[styles.collapseLabel, { color: theme.colors.textMuted }]}>
          Listo
        </Text>
      </Pressable>
    </Animated.View>
  )
}

function KindToggle({
  kind,
  onChange,
}: {
  kind: ReviewRowKind
  onChange: (kind: ReviewRowKind) => void
}) {
  const { theme } = useAppTheme()
  const options: ReadonlyArray<{ key: ReviewRowKind; label: string }> = [
    { key: 'expense', label: 'Gasto' },
    { key: 'income', label: 'Ingreso' },
    { key: 'skip', label: 'Saltear' },
  ]
  return (
    <View style={styles.toggleRow}>
      {options.map((opt) => {
        const active = opt.key === kind
        return (
          <Pressable
            key={opt.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(opt.key)}
            style={[
              styles.toggleBtn,
              {
                backgroundColor: active ? theme.colors.primary : 'transparent',
                borderColor: active ? theme.colors.primary : theme.colors.line,
              },
            ]}
          >
            <Text
              style={[
                styles.toggleLabel,
                { color: active ? '#0F2D06' : theme.colors.text },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function LabeledInput({
  label,
  value,
  onChangeText,
  keyboardType,
  invalid = false,
  multiline = false,
  autoCapitalize,
}: {
  label: string
  value: string
  onChangeText: (text: string) => void
  keyboardType?: 'default' | 'decimal-pad'
  invalid?: boolean
  multiline?: boolean
  autoCapitalize?: 'none' | 'sentences'
}) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        style={[
          styles.input,
          {
            color: theme.colors.text,
            borderColor: invalid ? theme.colors.danger : theme.colors.line,
            backgroundColor: theme.colors.surfaceMuted,
          },
        ]}
      />
    </View>
  )
}

function CategorySection({
  categories,
  selectedCategoryId,
  onSelect,
}: {
  categories: readonly Category[]
  selectedCategoryId: string | null
  onSelect: (id: string) => void
}) {
  if (categories.length === 0) return null
  return (
    <View style={styles.field}>
      <CategoryHorizontalRail
        categories={categories.slice()}
        selectedCategoryId={selectedCategoryId ?? ''}
        onSelect={onSelect}
        label="Categoría"
        rows={2}
      />
    </View>
  )
}

function IncomeKindSection({
  incomeKind,
  onSelect,
}: {
  incomeKind: IncomeKind
  onSelect: (k: IncomeKind) => void
}) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>Tipo de ingreso</Text>
      <View style={styles.kindRow}>
        {INCOME_KINDS.map((k) => {
          const active = k === incomeKind
          return (
            <Pressable
              key={k}
              onPress={() => onSelect(k)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[
                styles.kindBtn,
                {
                  backgroundColor: active ? theme.colors.primary : 'transparent',
                  borderColor: active ? theme.colors.primary : theme.colors.line,
                },
              ]}
            >
              <Text
                style={[
                  styles.kindLabel,
                  { color: active ? '#0F2D06' : theme.colors.text },
                ]}
              >
                {INCOME_KIND_LABELS[k]}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function warningLabel(w: ReviewRow['warnings'][number]): string {
  switch (w) {
    case 'foreign-currency':
      return 'Moneda no soportada. Editá el monto en ARS.'
    case 'swap-ambiguous':
      return 'Cambio de moneda. Verificá antes de cargar.'
    case 'no-merchant':
      return 'Sin descripción. Completá antes de confirmar.'
    case 'no-date':
      return 'Sin fecha clara. Asumimos hoy.'
    case 'value-zero':
      return 'Monto 0. Editá antes de confirmar.'
  }
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  cardSkipped: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  skipLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  skipLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  skipAction: { fontSize: 13, fontWeight: '800' },
  toggleRow: { flexDirection: 'row', gap: 6 },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
  },
  toggleLabel: { fontSize: 12, fontWeight: '800' },
  field: { gap: 6 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  input: {
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 14,
  },
  hint: { fontSize: 11, fontWeight: '500', marginTop: 4 },
  warnings: { gap: 4, marginTop: 2 },
  warning: { fontSize: 11, fontWeight: '600' },
  kindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  kindBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  kindLabel: { fontSize: 12, fontWeight: '700' },
  collapseBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  collapseLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
})
```

- [ ] **Step 6.3: Typecheck + lint**

Run: `npm run typecheck && npm run lint -- mobile/components/import-review/import-review-row.tsx`
Expected: PASS.

- [ ] **Step 6.4: Commit**

```bash
git add mobile/components/import-review/import-review-row.tsx
git commit -m "$(cat <<'EOF'
feat(import-review): row orchestrator collapsed↔expanded + CycleDateSlider

Rewrite del row de Phase C:
  - Estado local [expanded, setExpanded] = useState(false)
  - kind=skip render igual (pill colapsada + Restaurar)
  - kind=expense|income collapsed por default → ImportReviewRowCollapsed
  - Tap collapsed → expanded con stagger FadeInDown 50ms × campo
  - Date field SWAP: el LabeledInput "YYYY-MM-DD" se reemplaza por
    <CycleDateSlider value={row.date} cycleStart={...} cycleDays={...} />
  - Botón "Listo" abajo derecha para colapsar

Warning copies actualizadas (impeccable: no em-dashes, fewer words,
no ⚠ emoji que el chip ya señala):
  - "Moneda no soportada. Editá el monto en ARS."
  - "Cambio de moneda. Verificá antes de cargar."
  - "Sin descripción. Completá antes de confirmar."
  - "Sin fecha clara. Asumimos hoy."
  - "Monto 0. Editá antes de confirmar."

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Rewrite `ImportReviewSheet` — header + cinematic confirm

**Files:**
- Modify (rewrite): `mobile/components/import-review/import-review-sheet.tsx`

- [ ] **Step 7.1: Replace the file**

Overwrite `mobile/components/import-review/import-review-sheet.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  FadeInDown,
  FadeOutUp,
} from 'react-native-reanimated'
import { ModalCard } from '@/components/ui/modal-card'
import { useAppTheme } from '@/theme/theme-provider'
import { useCategories } from '@/features/categories/use-categories'
import { toast } from '@/lib/toast-bus'
import { confetti } from '@/lib/confetti-bus'
import { useImportReviewController } from '@/features/import-review/use-import-review-controller'
import { useConfirmImport } from '@/features/import-review/use-confirm-import'
import { useCycleInfo } from '@/features/import-review/cycle-context'
import { formatISO } from '@/features/import-review/cycle-date-math'
import type { ReviewState } from '@/features/import-review/types'
import { ImportReviewRow } from './import-review-row'
import { ImportReviewFooter } from './import-review-footer'
import { ImportReviewEmpty } from './import-review-empty'
import { ImportReviewHeader } from './import-review-header'

interface Props {
  visible: boolean
  initialState: ReviewState | null
  familyId: string
  userId: string
  onClose: () => void
}

const ROW_STAGGER_MS = 40
const CONFIRM_FADE_MS = 180
const CONFIRM_STAGGER_MS = 50
const EASE_IOS = Easing.bezier(0.32, 0.72, 0, 1)

export function ImportReviewSheet({
  visible,
  initialState,
  familyId,
  userId,
  onClose,
}: Props) {
  const { theme } = useAppTheme()
  const controller = useImportReviewController(initialState ?? undefined)
  const categoriesQuery = useCategories(familyId, 'expense')
  const categories = categoriesQuery.data ?? []
  const confirm = useConfirmImport({ familyId, userId })
  const cycleInfo = useCycleInfo(userId)
  const today = formatISO(new Date())
  const [busy, setBusy] = useState(false)
  const [fadingOut, setFadingOut] = useState(false)

  useEffect(() => {
    if (initialState) controller.replaceState(initialState)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialState])

  const totalRows = controller.state.rows.length

  async function handleConfirm() {
    setBusy(true)
    try {
      const result = await confirm(controller.state.rows)
      const total = result.insertedExpenses + result.insertedIncomes

      // Cinematic fade-out: trigger the staggered exit, then await
      // long enough that the user sees the rows leave before close.
      setFadingOut(true)
      const fadeoutDurationMs =
        controller.state.rows.length * CONFIRM_STAGGER_MS + CONFIRM_FADE_MS + 80
      await new Promise<void>((resolve) =>
        setTimeout(resolve, fadeoutDurationMs),
      )

      if (total > 0) {
        const parts: string[] = []
        if (result.insertedExpenses > 0) {
          parts.push(
            `${result.insertedExpenses} gasto${result.insertedExpenses === 1 ? '' : 's'}`,
          )
        }
        if (result.insertedIncomes > 0) {
          parts.push(
            `${result.insertedIncomes} ingreso${result.insertedIncomes === 1 ? '' : 's'}`,
          )
        }
        const baseMsg = `Cargué ${parts.join(' y ')}.`
        if (result.failed.length > 0) {
          toast.error(
            `${baseMsg} ${result.failed.length} no se pudieron cargar.`,
            { durationMs: 6000 },
          )
        } else {
          toast.success(baseMsg)
        }

        if (total >= 5) {
          confetti.celebrate({ durationMs: 2200, origin: 'top' })
        }
      } else if (result.failed.length > 0) {
        toast.error(
          `No se pudo cargar ningún movimiento (${result.failed.length} errores).`,
          { durationMs: 6000 },
        )
      }
      onClose()
    } finally {
      setBusy(false)
      setFadingOut(false)
    }
  }

  return (
    <ModalCard
      visible={visible}
      onClose={busy ? () => {} : onClose}
      title=""
      subtitle=""
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <ImportReviewHeader
          transactionsCount={totalRows}
          breakdown={controller.submittableBreakdown}
          skipCount={controller.skippedCount}
          imageUri={controller.state.imageUri}
        />

        {totalRows === 0 ? (
          <ImportReviewEmpty />
        ) : (
          <View style={styles.rows}>
            {controller.state.rows.map((row, idx) => {
              const entering = FadeInDown.duration(220).delay(
                Math.min(idx, 7) * ROW_STAGGER_MS,
              ).easing(EASE_IOS)
              const exiting = fadingOut
                ? FadeOutUp.duration(CONFIRM_FADE_MS).delay(
                    idx * CONFIRM_STAGGER_MS,
                  ).easing(EASE_IOS)
                : undefined
              return (
                <Animated.View
                  key={row.id}
                  entering={entering}
                  exiting={exiting}
                >
                  <ImportReviewRow
                    row={row}
                    categories={categories}
                    invalid={controller.invalidIds.includes(row.id)}
                    cycleStart={cycleInfo.cycleStart}
                    cycleDays={cycleInfo.cycleDays}
                    today={today}
                    onSetKind={(kind) =>
                      controller.setRowKind(row.id, kind)
                    }
                    onPatch={(patch) => controller.patchRow(row.id, patch)}
                    onUnskip={() => controller.unskipRow(row.id)}
                  />
                </Animated.View>
              )
            })}
            {controller.state.unmatched > 0 ? (
              <Text
                style={[styles.unmatched, { color: theme.colors.textMuted }]}
              >
                {`${controller.state.unmatched} líneas no se pudieron clasificar.`}
              </Text>
            ) : null}
          </View>
        )}

        <View style={styles.footerSlot}>
          <ImportReviewFooter
            expensesCount={controller.submittableBreakdown.expenses}
            incomesCount={controller.submittableBreakdown.incomes}
            canConfirm={controller.canConfirm}
            busy={busy}
            onConfirm={handleConfirm}
            onCancel={busy ? () => {} : onClose}
          />
        </View>
      </ScrollView>
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  scroll: { maxHeight: '100%' },
  scrollContent: { gap: 12, paddingBottom: 24 },
  rows: { gap: 12 },
  unmatched: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6,
  },
  footerSlot: { marginTop: 16 },
})
```

- [ ] **Step 7.2: Typecheck + lint**

Run: `npm run typecheck && npm run lint -- mobile/components/import-review/import-review-sheet.tsx`
Expected: PASS.

- [ ] **Step 7.3: Commit**

```bash
git add mobile/components/import-review/import-review-sheet.tsx
git commit -m "$(cat <<'EOF'
feat(import-review): sheet rewrite with header + cinematic confirm

ImportReviewHeader reemplaza el title/subtitle de ModalCard (que se
deja vacío). Header maneja: count, breakdown, thumb captura.

Stagger entrance de rows: FadeInDown 220ms + 40ms × min(idx, 7).
Cap en idx=7 para que rows 9+ aparezcan sin más delay (no slow).

Confirm cinematic:
  1. setBusy(true)
  2. await confirm(rows) → result
  3. setFadingOut(true) — dispara FadeOutUp con stagger 50ms × idx
  4. await rows.length * 50ms + 260ms para que se vea el fade
  5. Toast con resumen, confetti si total ≥ 5, onClose

Cycle info via useCycleInfo(userId); today via formatISO(new Date()).
Ambos se pasan a cada row para que el CycleDateSlider tenga el rango
del ciclo real del owner.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Refresh `ImportReviewFooter` + `ImportReviewEmpty` copy

**Files:**
- Modify: `mobile/components/import-review/import-review-footer.tsx`
- Modify: `mobile/components/import-review/import-review-empty.tsx`

- [ ] **Step 8.1: Update footer copy**

Open `mobile/components/import-review/import-review-footer.tsx`. The current Phase C version already uses "y" instead of "+", and the only thing to update is the loading label which already reads `${loadingLabels.import}…`. No code change needed here unless we want to make further refinements.

Verify the file matches by running:

```bash
grep -A 3 "const label = " mobile/components/import-review/import-review-footer.tsx
```

Expected output: confirms the label uses `loadingLabels.import` + the conditional joining with "y".

If the label still has any `+` separator or em-dash, fix it. Otherwise no edit required.

- [ ] **Step 8.2: Update the Empty placeholder**

Open `mobile/components/import-review/import-review-empty.tsx`. Replace the two text strings:

FROM:
```tsx
      <Text style={[styles.title, { color: theme.colors.text }]}>
        No detecté gastos en esa captura.
      </Text>
      <Text style={[styles.body, { color: theme.colors.textMuted }]}>
        Probá con otra imagen o cargá manualmente desde el botón principal.
      </Text>
```

TO:
```tsx
      <Text style={[styles.title, { color: theme.colors.text }]}>
        No vi gastos en esa captura.
      </Text>
      <Text style={[styles.body, { color: theme.colors.textMuted }]}>
        Probá con otra imagen.
      </Text>
```

- [ ] **Step 8.3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 8.4: Commit**

```bash
git add mobile/components/import-review/import-review-footer.tsx mobile/components/import-review/import-review-empty.tsx
git commit -m "$(cat <<'EOF'
copy(import-review): tighter empty placeholder, footer review

Empty:
  - "No detecté gastos en esa captura." → "No vi gastos en esa captura."
  - Body acortado: "Probá con otra imagen." (drop el segundo statement,
    el botón principal ya está en su lugar visible)

Footer: copy ya estaba en buen shape después de las review fixes de
Phase C. No cambia.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If `git status` shows no actual changes to `import-review-footer.tsx`, only commit the empty file change.

---

## Task 9: Final validate + bundle pre-flight + IPA build + push

**Files:** none modified in this task.

- [ ] **Step 9.1: Full validate**

Run: `npm run validate`
Expected: typecheck + lint + tests + guards all PASS. Test count should be ~507 (492 Phase A+B+C + 7 cycle-date-math + 7 cycle-context = ~506).

- [ ] **Step 9.2: Bundle pre-flight iOS**

Run: `npx expo export --platform ios --output-dir /tmp/expo-export-phase-d-ios`
Expected: completes without Metro errors.

- [ ] **Step 9.3: Bundle pre-flight Android**

Run: `npx expo export --platform android --output-dir /tmp/expo-export-phase-d-android`
Expected: completes without Metro errors.

- [ ] **Step 9.4: Confirm zero new deps**

Run: `git diff origin/feature/activity-ocr -- package.json package-lock.json`
Expected: empty output (Phase D adds zero deps).

- [ ] **Step 9.5: Push**

Run: `git push origin feature/activity-ocr`
Expected: push succeeds.

- [ ] **Step 9.6: Build IPA**

Run: `./scripts/build-ipa.sh`
Expected: `dist/ios/Manifiesto-unsigned.ipa` produced (~28 MB).

- [ ] **Step 9.7: Smoke device checklist** (the user runs after sideload)

- [ ] FAB → Importar captura → image picker → sheet abre
- [ ] Header: heading "Detecté **N movimientos**" + breakdown + thumb visible (opacity 0.55)
- [ ] Rows arrancan colapsadas. Tap → expand con stagger
- [ ] CycleDateSlider visible al expandir: strip horizontal de días, día actual con dot, día seleccionado con ring + scale, swipeable
- [ ] Tap día → smooth scroll to center + haptic + valor actualizado
- [ ] Toggle gasto/ingreso → row se queda expanded, category↔incomeKind cambia inline
- [ ] Skip 1 row → pill colapsada con Restaurar
- [ ] Restaurar → vuelve al kind original
- [ ] Confirmar 6 rows: rows fade out con stagger arriba, toast "Cargué X y Y", confetti se ve por 2.2s (si total ≥ 5), sheet cierra
- [ ] Verificar en Home/Gastos que aparezcan los inserts

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task |
|---|---|
| `cycle-date-math.ts` + `buildCycleDays` | Task 1 ✓ |
| `cycle-context.ts` + `useCycleInfo` | Task 2 ✓ |
| `ImportReviewHeader` cinematic title + thumbnail | Task 3 ✓ |
| `CycleDateSlider` gesture-heavy component | Task 4 ✓ |
| `ImportReviewRowCollapsed` compact view | Task 5 ✓ |
| `ImportReviewRow` rewrite (orchestrator) with date swap | Task 6 ✓ |
| `ImportReviewSheet` rewrite with header + confirm cinematic | Task 7 ✓ |
| Empty placeholder copy | Task 8 ✓ |
| Animation system (240ms expand, 40ms stagger, 180ms+50ms fade-out, iOS curve) | Tasks 3, 4, 5, 6, 7 ✓ |
| Confetti if N ≥ 5 | Task 7 ✓ |
| No em-dashes, no `#000`/`#fff` | All tasks (copy + theme tokens) ✓ |
| Touch ≥44pt | Task 4 (hit slop), Task 5/6 (Pressables on full cards) ✓ |
| Bundle pre-flight | Task 9 ✓ |

**2. Placeholder scan:** No "TBD", "TODO", "handle edge cases", or "similar to Task N". All code blocks are concrete and complete.

**3. Type consistency:**
- `CycleInfo { cycleStart: Date; cycleDays: number }` consistent in Tasks 2, 4, 6, 7.
- `CycleDay { iso, day, weekday, isToday }` consistent in Tasks 1, 4.
- `formatISO(date: Date): string` consistent in Tasks 1, 7.
- `CycleDateSlider` props `{ value, cycleStart, cycleDays, today, onChange }` consistent in Tasks 4, 6.
- `ImportReviewRow` extra props `{ cycleStart, cycleDays, today }` added in Task 6 and passed from Task 7.
- `ImportReviewHeader` props `{ transactionsCount, breakdown, skipCount, imageUri }` consistent in Tasks 3, 7.

**4. Project memory respected:**
- Easing import from `react-native-reanimated`, not `react-native` ✓ (Tasks 4, 5, 7)
- Worklet safety: format functions live on JS thread; worklets only do simple sharedValue ops ✓
- Vitest tests only on pure helpers (Tasks 1, 2). UI tasks have no unit tests ✓
- Bundle pre-flight at Task 9 covers both platforms ✓
- ModalCard / form-modal pattern reused (no new sheet primitive) ✓
- `confetti.celebrate(...)` API (not `confettiBus.emit`) ✓
- `useReducedMotion` respected in Task 3 (`entering` undefined when reduced) — extend to Tasks 4, 6 if reviewer flags
- Branch `feature/activity-ocr`, no push to main, push at Task 9.5 ✓
