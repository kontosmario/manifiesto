# Billing UI Redesign — One-Hero Morph-Card Plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static 2-tile Plans picker with a single cinematic morph-card driven by a segmented cycle picker, with digit-roll prices, a flying savings ribbon, staggered feature reveals, ambient-tone shift, and CTA shimmer.

**Architecture:** Pure-presentational sub-components under `mobile/components/billing/` (cycle picker, digit-roller, savings ribbon, plan morph card). The screen (`mobile/screens/settings/billing-screen.tsx`) composes them; no changes to `useBilling()` or `billing-plans.ts`. All animations use Reanimated 4 already in the codebase; reduced-motion respected via existing `useReducedMotion()` hook. The digit-roller offset math is extracted as a pure function and unit-tested with vitest.

**Tech Stack:** React Native 0.81 + Expo SDK, TypeScript strict, Reanimated 4 worklets, `expo-linear-gradient`, `@expo/vector-icons` (MaterialIcons), existing theme tokens (`@/theme/palette`, `@/theme/theme-provider`), vitest for pure-function unit tests.

**Spec:** `docs/superpowers/specs/2026-06-02-billing-ui-redesign-design.md`

**Branch policy:** User has authorized direct work on `main`. Commit frequently.

---

## File map

**Create:**
- `mobile/components/billing/billing-cycle-picker.tsx` — Segmented control with sliding marble + `−33%` badge on yearly.
- `mobile/components/billing/billing-price-digits.tsx` — Digit-roller; renders only the integer + fractional digits (caller renders currency/suffix).
- `mobile/components/billing/digit-roll-math.ts` — Pure function `computeDigitOffsets(value, fractionDigits)` returning per-column target-digit-index. Unit-testable.
- `mobile/components/billing/billing-savings-ribbon.tsx` — Pill with `FadeInLeft` entrance, embedded `BillingPriceDigits` for savings counter.
- `mobile/components/billing/billing-plan-morph-card.tsx` — Big card: header, animated price block, ribbon, member-cap row, features with stagger + star icon for annual-only.

**Modify:**
- `mobile/screens/settings/billing-screen.tsx` — Replace `PlanGrid + PlanDetail` with `BillingCyclePicker + BillingPlanMorphCard`. Improve `PrimaryCTA` with shimmer. Pass dynamic `tone` to `AmbientBlobs`.

**Create test:**
- `tests/unit/digit-roll-math.test.ts`

**Unchanged:**
- `mobile/features/billing/billing-plans.ts`
- `mobile/features/billing/use-billing.ts`
- `app/(app)/settings/plan.tsx`
- `mobile/components/home/ambient-blobs.tsx` (we only pass a different `tone` prop)

---

## Task 1: Digit-roll math pure function + tests

**Files:**
- Create: `mobile/components/billing/digit-roll-math.ts`
- Test: `tests/unit/digit-roll-math.test.ts`

- [ ] **Step 1.1: Write the failing test**

Create `tests/unit/digit-roll-math.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { computeDigitColumns } from '../../mobile/components/billing/digit-roll-math'

describe('computeDigitColumns', () => {
  it('returns one column per digit for an integer with 2 fraction digits', () => {
    // 4.99 → integer part "4", fractional "99" → 3 columns total (1 int + 2 frac)
    expect(computeDigitColumns(4.99, 2)).toEqual({
      integer: [4],
      fraction: [9, 9],
    })
  })

  it('handles multi-digit integer part', () => {
    expect(computeDigitColumns(39.99, 2)).toEqual({
      integer: [3, 9],
      fraction: [9, 9],
    })
  })

  it('pads fraction with leading zeros if value has fewer decimals', () => {
    expect(computeDigitColumns(40, 2)).toEqual({
      integer: [4, 0],
      fraction: [0, 0],
    })
  })

  it('rounds away invisible decimals (no half-rendered digits)', () => {
    expect(computeDigitColumns(19.895, 2)).toEqual({
      integer: [1, 9],
      fraction: [9, 0], // 19.895 → "19.90" with 2 frac digits
    })
  })

  it('clamps zero correctly', () => {
    expect(computeDigitColumns(0, 2)).toEqual({
      integer: [0],
      fraction: [0, 0],
    })
  })

  it('throws on negative input (not expected in billing UI)', () => {
    expect(() => computeDigitColumns(-1, 2)).toThrow()
  })

  it('handles fractionDigits=0', () => {
    expect(computeDigitColumns(123, 0)).toEqual({
      integer: [1, 2, 3],
      fraction: [],
    })
  })
})
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `npx vitest run tests/unit/digit-roll-math.test.ts`
Expected: FAIL — `Cannot find module .../digit-roll-math`.

- [ ] **Step 1.3: Implement minimal pure function**

Create `mobile/components/billing/digit-roll-math.ts`:

```ts
export interface DigitColumns {
  /** Digits of the integer part, left-to-right. */
  integer: number[]
  /** Digits of the fractional part, padded with trailing zeros to fractionDigits length. */
  fraction: number[]
}

/**
 * Splits a non-negative number into its integer and fractional digits
 * suitable for rendering each digit in its own animated column.
 *
 * Rounding follows `toFixed(fractionDigits)` semantics so what we
 * animate matches what the caller would print as a fallback string.
 */
export function computeDigitColumns(
  value: number,
  fractionDigits: number,
): DigitColumns {
  if (value < 0 || !Number.isFinite(value)) {
    throw new Error(`computeDigitColumns: value must be non-negative finite, got ${value}`)
  }
  if (fractionDigits < 0 || !Number.isInteger(fractionDigits)) {
    throw new Error(`computeDigitColumns: fractionDigits must be a non-negative integer, got ${fractionDigits}`)
  }

  const fixed = value.toFixed(fractionDigits)
  const [intPart, fracPart = ''] = fixed.split('.')

  const integer = intPart.split('').map((c) => Number(c))
  const fraction = fracPart.split('').map((c) => Number(c))

  return { integer, fraction }
}
```

- [ ] **Step 1.4: Run test to verify it passes**

Run: `npx vitest run tests/unit/digit-roll-math.test.ts`
Expected: PASS — 7 tests passing.

- [ ] **Step 1.5: Run full test suite to confirm no regressions**

Run: `npm test`
Expected: PASS with the same pre-existing baseline of skipped/failing infra tests (per `[[feedback-vitest-no-react-renderer]]` memory: 3 pre-existing infra fails are baseline).

- [ ] **Step 1.6: Commit**

```bash
git add mobile/components/billing/digit-roll-math.ts tests/unit/digit-roll-math.test.ts
git commit -m "$(cat <<'EOF'
feat(billing): pure digit-column splitter for animated price roller

Splits a non-negative number into integer/fraction digit arrays
matching toFixed() semantics, so an animated digit-roller component
can drive each column independently. Pure + tested under vitest with
no React renderer dependency.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: BillingPriceDigits component

**Files:**
- Create: `mobile/components/billing/billing-price-digits.tsx`

- [ ] **Step 2.1: Implement the component**

Create `mobile/components/billing/billing-price-digits.tsx`:

```tsx
import { memo, useEffect, useState } from 'react'
import { StyleSheet, Text, type TextStyle, View, type ViewStyle } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { computeDigitColumns } from './digit-roll-math'

interface BillingPriceDigitsProps {
  /** Non-negative value to display. */
  value: number
  /** Number of fractional digits to render. Default 2. */
  fractionDigits?: number
  /** Style applied to each digit Text (font size, weight, color, letter-spacing). */
  digitStyle: TextStyle
  /** Optional decimal separator. Default '.'. */
  separator?: string
  /** Style applied to the separator Text. */
  separatorStyle?: TextStyle
  /** Optional accessibility label override for the whole price. */
  accessibilityLabel?: string
}

const DIGIT_DURATION_MS = 380
const STAGGER_MS = 60
// Approximate ratio between digit advance and font size for tabular-nums fonts.
// Used as fallback width before onLayout measures the real "8" glyph.
const FALLBACK_DIGIT_WIDTH_RATIO = 0.62

export const BillingPriceDigits = memo(function BillingPriceDigits({
  value,
  fractionDigits = 2,
  digitStyle,
  separator = '.',
  separatorStyle,
  accessibilityLabel,
}: BillingPriceDigitsProps) {
  const reduced = useReducedMotion()
  const cols = computeDigitColumns(value, fractionDigits)
  const allTargets = [...cols.integer, ...cols.fraction]

  const fontSize = typeof digitStyle.fontSize === 'number' ? digitStyle.fontSize : 24
  const lineHeight = typeof digitStyle.lineHeight === 'number' ? digitStyle.lineHeight : fontSize * 1.1
  const fallbackWidth = Math.ceil(fontSize * FALLBACK_DIGIT_WIDTH_RATIO)

  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null)
  const digitWidth = measuredWidth ?? fallbackWidth

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? `${value.toFixed(fractionDigits).replace('.', ' con ')}`}
      style={styles.row}
    >
      {/* Hidden measurer — measures one tabular '8' glyph once for stable column width. */}
      <Text
        onLayout={(e) => {
          if (measuredWidth == null) setMeasuredWidth(Math.ceil(e.nativeEvent.layout.width))
        }}
        style={[digitStyle, styles.measurer]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        8
      </Text>

      {cols.integer.map((target, idx) => (
        <DigitColumn
          key={`int-${idx}`}
          target={target}
          delayMs={idx * STAGGER_MS}
          width={digitWidth}
          height={lineHeight}
          digitStyle={digitStyle}
          reduced={reduced}
        />
      ))}
      {cols.fraction.length > 0 ? (
        <Text style={[digitStyle, separatorStyle]} accessibilityElementsHidden importantForAccessibility="no">
          {separator}
        </Text>
      ) : null}
      {cols.fraction.map((target, idx) => (
        <DigitColumn
          key={`frac-${idx}`}
          target={target}
          delayMs={(cols.integer.length + idx) * STAGGER_MS}
          width={digitWidth}
          height={lineHeight}
          digitStyle={digitStyle}
          reduced={reduced}
        />
      ))}
    </View>
  )
})

interface DigitColumnProps {
  target: number // 0..9
  delayMs: number
  width: number
  height: number
  digitStyle: TextStyle
  reduced: boolean
}

const DigitColumn = memo(function DigitColumn({
  target,
  delayMs,
  width,
  height,
  digitStyle,
  reduced,
}: DigitColumnProps) {
  const offset = useSharedValue(-target * height)

  useEffect(() => {
    const targetOffset = -target * height
    if (reduced) {
      offset.value = targetOffset
      return
    }
    offset.value = withTiming(targetOffset, {
      duration: DIGIT_DURATION_MS,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    })
    // delay handled by phase-shifting via setTimeout in JS thread; we
    // start the timing immediately but offset launch with a small
    // JS-thread delay so each column begins its motion staggered.
  }, [target, height, reduced, offset])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
  }))

  return (
    <View style={[styles.column, { width, height, overflow: 'hidden' }]}>
      <Animated.View style={animatedStyle}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <Text
            key={d}
            style={[digitStyle, { height, lineHeight: height, textAlign: 'center' }]}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            {d}
          </Text>
        ))}
      </Animated.View>
    </View>
  )
})
```

Note on stagger: the spec calls for 60ms stagger per column. The current implementation places the stagger as the `delayMs` prop but starts the animation immediately on mount. Apply true stagger via wrapping the `withTiming` in `withDelay` from `react-native-reanimated`:

Update the `useEffect` body in `DigitColumn` to:

```ts
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'

useEffect(() => {
  const targetOffset = -target * height
  if (reduced) {
    offset.value = targetOffset
    return
  }
  offset.value = withDelay(
    delayMs,
    withTiming(targetOffset, {
      duration: DIGIT_DURATION_MS,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    }),
  )
}, [target, height, reduced, offset, delayMs])
```

And remove the JS-thread comment.

Add the styles at the bottom of the file:

```ts
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  measurer: {
    position: 'absolute',
    opacity: 0,
  },
  column: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
})
```

Final imports at top of the file:

```tsx
import { memo, useEffect, useState } from 'react'
import { StyleSheet, Text, type TextStyle, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { computeDigitColumns } from './digit-roll-math'
```

(Remove the unused `ViewStyle` type import if it remained from the initial draft.)

- [ ] **Step 2.2: Typecheck**

Run: `npm run typecheck`
Expected: PASS, no new errors.

- [ ] **Step 2.3: Lint**

Run: `npm run lint -- mobile/components/billing/billing-price-digits.tsx`
Expected: PASS.

- [ ] **Step 2.4: Commit**

```bash
git add mobile/components/billing/billing-price-digits.tsx
git commit -m "$(cat <<'EOF'
feat(billing): BillingPriceDigits — animated per-column digit roller

Renders each digit of a price as its own clipped column with a stacked
0–9 strip that translates vertically to the target digit. Stagger of
60ms per column gives an editorial 'odometer' feel without slot-
machine sync. Respects useReducedMotion (snap). Uses an off-screen '8'
glyph for stable column-width measurement.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: BillingCyclePicker component

**Files:**
- Create: `mobile/components/billing/billing-cycle-picker.tsx`

- [ ] **Step 3.1: Implement the component**

Create `mobile/components/billing/billing-cycle-picker.tsx`:

```tsx
import { memo, useEffect, useState } from 'react'
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { radii } from '@/theme/palette'
import type { BillingCycle } from '@/features/billing/billing-plans'

interface BillingCyclePickerProps {
  selected: BillingCycle
  monthlyLabel: string
  yearlyLabel: string
  /** Mini badge text shown next to the yearly segment, e.g. "−33%". null hides it. */
  savingsBadgeText: string | null
  onChange: (cycle: BillingCycle) => void
  disabled?: boolean
}

export const BillingCyclePicker = memo(function BillingCyclePicker({
  selected,
  monthlyLabel,
  yearlyLabel,
  savingsBadgeText,
  onChange,
  disabled = false,
}: BillingCyclePickerProps) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const [trackWidth, setTrackWidth] = useState(0)
  const progress = useSharedValue(selected === 'yearly' ? 1 : 0)

  useEffect(() => {
    const target = selected === 'yearly' ? 1 : 0
    if (reduced) {
      progress.value = withTiming(target, { duration: 1 })
    } else {
      progress.value = withSpring(target, { damping: 18, stiffness: 200, mass: 0.9 })
    }
  }, [selected, reduced, progress])

  const handleTrack = (e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)

  const segmentWidth = trackWidth > 0 ? trackWidth / 2 : 0
  const marbleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * segmentWidth }],
  }))

  const monthlyTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [theme.colors.text, theme.colors.textMuted]),
  }))
  const yearlyTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [theme.colors.textMuted, theme.colors.text]),
  }))

  const handlePress = (cycle: BillingCycle) => {
    if (disabled || cycle === selected) return
    void triggerHaptic('selection')
    onChange(cycle)
  }

  return (
    <View
      accessibilityRole="tablist"
      onLayout={handleTrack}
      style={[
        styles.track,
        {
          backgroundColor: theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamSoft,
          borderColor: theme.colors.line,
        },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.marble,
          { width: segmentWidth, backgroundColor: theme.colors.creamCard },
          marbleStyle,
        ]}
      />
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: selected === 'monthly' }}
        accessibilityLabel={`Plan ${monthlyLabel.toLowerCase()}`}
        onPress={() => handlePress('monthly')}
        disabled={disabled}
        style={styles.segment}
      >
        <Animated.Text style={[styles.segmentText, monthlyTextStyle]}>{monthlyLabel}</Animated.Text>
      </Pressable>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: selected === 'yearly' }}
        accessibilityLabel={savingsBadgeText ? `Plan ${yearlyLabel.toLowerCase()}, ahorrás ${savingsBadgeText}` : `Plan ${yearlyLabel.toLowerCase()}`}
        onPress={() => handlePress('yearly')}
        disabled={disabled}
        style={styles.segment}
      >
        <Animated.Text style={[styles.segmentText, yearlyTextStyle]}>{yearlyLabel}</Animated.Text>
        {savingsBadgeText ? (
          <View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
            <Text style={styles.badgeText}>{savingsBadgeText}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  )
})

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 4,
    minHeight: 48,
    position: 'relative',
  },
  marble: {
    position: 'absolute',
    top: 4,
    left: 4,
    bottom: 4,
    borderRadius: radii.md,
    shadowColor: '#0F2D06',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    minHeight: 40,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#0F2D06',
    letterSpacing: 0.3,
  },
})
```

- [ ] **Step 3.2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3.3: Lint**

Run: `npm run lint -- mobile/components/billing/billing-cycle-picker.tsx`
Expected: PASS.

- [ ] **Step 3.4: Commit**

```bash
git add mobile/components/billing/billing-cycle-picker.tsx
git commit -m "$(cat <<'EOF'
feat(billing): BillingCyclePicker segmented control with sliding marble

Spring-driven marble slides between Mensual / Anual segments. Text
colors crossfade between text/textMuted. The yearly segment hosts a
fixed −33% badge in the top-right corner. tablist/tab a11y roles +
selection haptic. Respects useReducedMotion (snap).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: BillingSavingsRibbon component

**Files:**
- Create: `mobile/components/billing/billing-savings-ribbon.tsx`

- [ ] **Step 4.1: Implement the component**

Create `mobile/components/billing/billing-savings-ribbon.tsx`:

```tsx
import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { FadeInLeft, FadeOutLeft } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useAppTheme } from '@/theme/theme-provider'
import { radii } from '@/theme/palette'
import { BillingPriceDigits } from './billing-price-digits'

interface BillingSavingsRibbonProps {
  visible: boolean
  savingsUsd: number
  effectiveCopy?: string
}

export const BillingSavingsRibbon = memo(function BillingSavingsRibbon({
  visible,
  savingsUsd,
  effectiveCopy,
}: BillingSavingsRibbonProps) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  if (!visible) return null

  const enter = reduced ? undefined : FadeInLeft.duration(280).springify().damping(16)
  const exit = reduced ? undefined : FadeOutLeft.duration(180)

  return (
    <Animated.View
      entering={enter}
      exiting={exit}
      accessibilityRole="text"
      accessibilityLabel={`Ahorrás USD ${savingsUsd.toFixed(2)} al año${effectiveCopy ? `, ${effectiveCopy}` : ''}`}
      style={[
        styles.ribbon,
        {
          backgroundColor: theme.colors.primarySurface,
          borderColor: theme.colors.primary,
        },
      ]}
    >
      <MaterialIcons name="savings" size={16} color={theme.colors.primary} />
      <View style={styles.body}>
        <View style={styles.savingsLine}>
          <Text style={[styles.lead, { color: theme.colors.text }]}>Ahorrás USD </Text>
          <BillingPriceDigits
            value={savingsUsd}
            fractionDigits={2}
            digitStyle={{
              fontSize: 14,
              fontWeight: '900',
              color: theme.colors.text,
              fontVariant: ['tabular-nums'],
              letterSpacing: -0.2,
            }}
            separatorStyle={{
              fontSize: 14,
              fontWeight: '900',
              color: theme.colors.text,
            }}
            accessibilityLabel={`USD ${savingsUsd.toFixed(2)}`}
          />
          <Text style={[styles.lead, { color: theme.colors.text }]}> al año</Text>
        </View>
        {effectiveCopy ? (
          <Text style={[styles.effective, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {effectiveCopy}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  )
})

const styles = StyleSheet.create({
  ribbon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  savingsLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'nowrap',
  },
  lead: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  effective: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.05,
  },
})
```

- [ ] **Step 4.2: Typecheck + lint**

Run: `npm run typecheck && npm run lint -- mobile/components/billing/billing-savings-ribbon.tsx`
Expected: PASS.

- [ ] **Step 4.3: Commit**

```bash
git add mobile/components/billing/billing-savings-ribbon.tsx
git commit -m "$(cat <<'EOF'
feat(billing): BillingSavingsRibbon — fly-in pill with rolling counter

FadeInLeft + spring entrance on yearly selection, FadeOutLeft on
unselect. Embeds BillingPriceDigits for the savings number so it
counts up in sync with the main price digit-roll. Respects reduced
motion.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: BillingPlanMorphCard component

**Files:**
- Create: `mobile/components/billing/billing-plan-morph-card.tsx`

- [ ] **Step 5.1: Implement the component**

Create `mobile/components/billing/billing-plan-morph-card.tsx`:

```tsx
import { memo, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialIcons } from '@expo/vector-icons'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useAppTheme } from '@/theme/theme-provider'
import { radii } from '@/theme/palette'
import { BILLING_PLANS, type BillingPlan } from '@/features/billing/billing-plans'
import { BillingPriceDigits } from './billing-price-digits'
import { BillingSavingsRibbon } from './billing-savings-ribbon'

interface BillingPlanMorphCardProps {
  plan: BillingPlan
  isCurrentPlan: boolean
}

const STAGGER_MS = 35

// Annual-only highlights are those present in 'hogar-anual' but not in 'hogar-mensual'.
const _monthly = BILLING_PLANS['hogar-mensual']
const _annual = BILLING_PLANS['hogar-anual']
const ANNUAL_ONLY_SET: ReadonlySet<string> = new Set(
  _annual.highlights.filter((h) => !(_monthly.highlights as readonly string[]).includes(h)),
)

export const BillingPlanMorphCard = memo(function BillingPlanMorphCard({
  plan,
  isCurrentPlan,
}: BillingPlanMorphCardProps) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const isAnnual = plan.cycle === 'yearly'

  const gradientColors = useMemo<readonly [string, string]>(() => {
    return theme.isDark
      ? [theme.colors.surfaceMuted, theme.colors.surfaceMuted]
      : [theme.colors.creamCard, theme.colors.creamSoft]
  }, [theme])

  const cycleSuffix = isAnnual ? '/año' : '/mes'
  const memberCapCopy = plan.memberCap === 4 ? 'Suma a abuelos o hijos.' : 'Para ti y una persona más.'

  const fade = (delayMs: number) =>
    reduced ? undefined : FadeInDown.duration(220).delay(delayMs)
  const headerFade = reduced ? undefined : FadeIn.duration(200)

  return (
    <View style={[styles.card, { borderColor: theme.colors.line }]}>
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {isCurrentPlan ? (
        <View style={[styles.currentBadge, { backgroundColor: theme.colors.primary }]}>
          <Text style={styles.currentBadgeText}>TU PLAN</Text>
        </View>
      ) : null}

      {/* Header */}
      <Animated.View key={`header-${plan.id}`} entering={headerFade} style={styles.header}>
        <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
          {plan.name}
        </Text>
        <Text style={[styles.tagline, { color: theme.colors.textMuted }]} numberOfLines={2}>
          {plan.tagline}
        </Text>
      </Animated.View>

      {/* Price block */}
      <View style={styles.priceBlock}>
        <Text style={[styles.currency, { color: theme.colors.textMuted }]}>USD</Text>
        <View style={styles.priceLine}>
          <BillingPriceDigits
            value={plan.priceUsd}
            fractionDigits={2}
            digitStyle={{
              fontSize: 64,
              fontWeight: '900',
              color: theme.colors.text,
              letterSpacing: -2.4,
              fontVariant: ['tabular-nums'],
              lineHeight: 70,
            }}
            separator=","
            separatorStyle={{
              fontSize: 36,
              fontWeight: '900',
              color: theme.colors.text,
              lineHeight: 70,
            }}
            accessibilityLabel={`USD ${plan.priceUsd.toFixed(2)} ${isAnnual ? 'al año' : 'al mes'}`}
          />
          <Text style={[styles.suffix, { color: theme.colors.textMuted }]}>{cycleSuffix}</Text>
        </View>
        {plan.effectiveCopy ? (
          <Animated.Text
            key={`eff-${plan.id}`}
            entering={headerFade}
            style={[styles.effective, { color: theme.colors.textMuted }]}
          >
            {plan.effectiveCopy}
          </Animated.Text>
        ) : null}
      </View>

      {/* Savings ribbon */}
      <BillingSavingsRibbon
        visible={isAnnual && plan.savingsUsd > 0}
        savingsUsd={plan.savingsUsd}
        effectiveCopy={undefined}
      />

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: theme.colors.line }]} />

      {/* Member cap */}
      <Animated.View key={`cap-${plan.id}`} entering={headerFade} style={styles.capRow}>
        <MaterialIcons name="group" size={16} color={theme.colors.primary} />
        <Text style={[styles.capText, { color: theme.colors.text }]} numberOfLines={1}>
          Hasta {plan.memberCap} personas
        </Text>
        <Text style={[styles.capSub, { color: theme.colors.textMuted }]}> · {memberCapCopy}</Text>
      </Animated.View>

      {/* Eyebrow */}
      <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>QUÉ INCLUYE</Text>

      {/* Features */}
      <View style={styles.features}>
        {plan.highlights.map((feature, idx) => {
          const exclusive = isAnnual && ANNUAL_ONLY_SET.has(feature)
          return (
            <Animated.View
              key={`${plan.id}-${feature}`}
              entering={fade(idx * STAGGER_MS)}
              style={styles.featureRow}
            >
              <MaterialIcons
                name={exclusive ? 'star' : 'check-circle'}
                size={16}
                color={theme.colors.primary}
              />
              <Text style={[styles.featureText, { color: theme.colors.text }]}>{feature}</Text>
            </Animated.View>
          )
        })}
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    borderRadius: radii.xl,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    gap: 14,
    overflow: 'hidden',
    shadowColor: '#0F2D06',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
  },
  currentBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    zIndex: 1,
  },
  currentBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#0F2D06',
    letterSpacing: 0.6,
  },
  header: {
    gap: 4,
    paddingRight: 64, // leave room for the "TU PLAN" badge
  },
  name: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  tagline: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  priceBlock: {
    gap: 2,
  },
  currency: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  priceLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  suffix: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.1,
    marginBottom: 8,
  },
  effective: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  capRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  capText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.1,
    flexShrink: 0,
  },
  capSub: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  features: {
    gap: 10,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    letterSpacing: -0.05,
  },
})
```

- [ ] **Step 5.2: Typecheck + lint**

Run: `npm run typecheck && npm run lint -- mobile/components/billing/billing-plan-morph-card.tsx`
Expected: PASS.

- [ ] **Step 5.3: Commit**

```bash
git add mobile/components/billing/billing-plan-morph-card.tsx
git commit -m "$(cat <<'EOF'
feat(billing): BillingPlanMorphCard — single cinematic plan surface

Replaces the 2-tile grid + checklist with one big card that morphs
between Mensual and Anual. Header + member-cap remount per plan id
for fade-in. Price uses BillingPriceDigits for odometer roll. Annual-
only features render with a star icon instead of a 'Solo en Anual'
pill (less visual noise). Savings ribbon flies in only on yearly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Compose billing-screen.tsx with the new components

**Files:**
- Modify: `mobile/screens/settings/billing-screen.tsx`

- [ ] **Step 6.1: Rewrite the screen**

Open `mobile/screens/settings/billing-screen.tsx` and replace its full contents with:

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialIcons } from '@expo/vector-icons'
import { FernLogo } from '@/components/auth/fern-logo'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { RiseView } from '@/components/home/animated/rise-view'
import { Screen } from '@/components/ui/screen'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import {
  BILLING_PLANS,
  BILLING_TRIAL_DAYS,
  type BillingCycle,
  type BillingPlan,
  type BillingPlanId,
} from '@/features/billing/billing-plans'
import { useBilling } from '@/features/billing/use-billing'
import { useAppTheme } from '@/theme/theme-provider'
import { DARK_TAB_CANVAS, radii } from '@/theme/palette'
import { BillingCyclePicker } from '@/components/billing/billing-cycle-picker'
import { BillingPlanMorphCard } from '@/components/billing/billing-plan-morph-card'
import { BillingPriceDigits } from '@/components/billing/billing-price-digits'

const HERO_GRADIENT = ['#0F2D06', '#1F590D', '#297811'] as const
const HERO_GLOW = 'rgba(166,239,143,0.18)'
const ACCENT = '#A6EF8F'
const CREAM = '#F2EAD3'

export function BillingScreen() {
  const { theme } = useAppTheme()
  const billing = useBilling()

  const initialId: BillingPlanId = billing.status.activePlanId ?? 'hogar-anual'
  const [selectedId, setSelectedId] = useState<BillingPlanId>(initialId)
  const selectedPlan: BillingPlan = BILLING_PLANS[selectedId]
  const selectedCycle: BillingCycle = selectedPlan.cycle
  const isCurrentPlan = billing.status.activePlanId === selectedPlan.id

  const handleCycleChange = useCallback((cycle: BillingCycle) => {
    const nextId: BillingPlanId = cycle === 'yearly' ? 'hogar-anual' : 'hogar-mensual'
    if (nextId === selectedId) return
    setSelectedId(nextId)
  }, [selectedId])

  const handleSubscribe = useCallback(async () => {
    void triggerHaptic('selection')
    const result = await billing.purchasePlan(selectedPlan)
    if (result.ok) {
      void triggerHaptic('success')
      Alert.alert('¡Listo!', `Ya tienes el ${selectedPlan.name} activo. Disfruta tu plan.`)
    } else {
      void triggerHaptic('error')
      Alert.alert('Algo salió mal', result.reason)
    }
  }, [billing, selectedPlan])

  const handleStartTrial = useCallback(async () => {
    void triggerHaptic('selection')
    await billing.startFreeTrial(selectedPlan)
    void triggerHaptic('success')
    Alert.alert(
      `${BILLING_TRIAL_DAYS} días gratis`,
      'Prueba Manifiesto sin tarjeta. Te avisaremos antes de cualquier cobro.',
    )
  }, [billing, selectedPlan])

  const handleRestorePurchases = useCallback(() => {
    void triggerHaptic('selection')
    Alert.alert(
      'Restaurar compras',
      'Si ya pagaste antes con esta cuenta de App Store o Google Play, vamos a recuperar tu suscripción automáticamente.',
    )
  }, [])

  const handleManageSubscription = useCallback(() => {
    void triggerHaptic('selection')
    const url =
      Platform.OS === 'ios'
        ? 'https://apps.apple.com/account/subscriptions'
        : 'https://play.google.com/store/account/subscriptions'
    void Linking.openURL(url)
  }, [])

  const ambientTone: 'aurora' | 'calm' = selectedCycle === 'yearly' ? 'aurora' : 'calm'
  const yearly = BILLING_PLANS['hogar-anual']
  const savingsBadge = yearly.savingsPercent > 0 ? `−${yearly.savingsPercent}%` : null

  return (
    <Screen
      backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
      canGoBack
      title="Tu plan"
      contentContainerStyle={styles.screenContent}
    >
      <View style={styles.stack}>
        <AmbientBlobs tone={ambientTone} />

        <RiseView>
          <CompactHero status={billing.status} />
        </RiseView>

        <RiseView delay={120}>
          <BillingCyclePicker
            selected={selectedCycle}
            monthlyLabel="Mensual"
            yearlyLabel="Anual"
            savingsBadgeText={savingsBadge}
            onChange={handleCycleChange}
          />
        </RiseView>

        <RiseView delay={200}>
          <BillingPlanMorphCard plan={selectedPlan} isCurrentPlan={isCurrentPlan} />
        </RiseView>

        <RiseView delay={260}>
          <PrimaryCTA
            plan={selectedPlan}
            isCurrentPlan={isCurrentPlan}
            isPurchasing={billing.isPurchasing}
            onSubscribe={handleSubscribe}
            onStartTrial={handleStartTrial}
          />
        </RiseView>

        <RiseView delay={340}>
          <TrustPills />
        </RiseView>

        <RiseView delay={420}>
          <CompactFaq />
        </RiseView>

        <RiseView delay={500}>
          <FooterMicro
            hasActivePlan={billing.status.activePlanId !== null}
            onRestore={handleRestorePurchases}
            onManage={handleManageSubscription}
          />
        </RiseView>
      </View>
    </Screen>
  )
}

// ─── Compact hero (unchanged from current) ─────────────────────────
function CompactHero({ status }: { status: ReturnType<typeof useBilling>['status'] }) {
  const reduced = useReducedMotion()
  const isActive = status.activePlanId !== null
  const activePlan = isActive ? BILLING_PLANS[status.activePlanId!] : null
  const expiresLabel = useMemo(() => {
    if (!status.expiresAt) return null
    const date = new Date(status.expiresAt)
    return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
  }, [status.expiresAt])

  return (
    <LinearGradient
      colors={HERO_GRADIENT}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      <View style={styles.heroGlow} pointerEvents="none" />
      <View style={styles.heroLeft}>
        <View style={styles.heroLogoBadge}>
          <FernLogo size={36} palette="mono-light" animate={!reduced} iconMode />
        </View>
      </View>
      <View style={styles.heroBody}>
        <View style={styles.heroPill}>
          <MaterialIcons name="auto-awesome" size={10} color="#0F2D06" />
          <Text style={styles.heroPillText} numberOfLines={1}>PLAN DEL HOGAR</Text>
        </View>
        <Text style={styles.heroLine} numberOfLines={2}>
          {isActive && activePlan
            ? `${activePlan.name}${expiresLabel ? `, se renueva el ${expiresLabel}` : ''}.`
            : 'Lleven juntos las cuentas de la casa.'}
        </Text>
      </View>
    </LinearGradient>
  )
}

// ─── Primary CTA with shimmer ──────────────────────────────────────
function PrimaryCTA({
  plan,
  isCurrentPlan,
  isPurchasing,
  onSubscribe,
  onStartTrial,
}: {
  plan: BillingPlan
  isCurrentPlan: boolean
  isPurchasing: boolean
  onSubscribe: () => void
  onStartTrial: () => void
}) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const shimmer = useSharedValue(0)
  const cycleSuffix = plan.cycle === 'yearly' ? '/año' : '/mes'

  const isIdleActive = !isCurrentPlan && !isPurchasing
  useEffect(() => {
    if (!isIdleActive || reduced) {
      shimmer.value = 0
      return
    }
    shimmer.value = 0
    shimmer.value = withRepeat(
      withSequence(
        withDelay(3300, withTiming(1, { duration: 700, easing: Easing.bezier(0.4, 0, 0.2, 1) })),
        withTiming(0, { duration: 0 }),
      ),
      -1,
      false,
    )
  }, [isIdleActive, reduced, shimmer])

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: shimmer.value === 0 ? 0 : 0.6,
    transform: [{ translateX: -100 + shimmer.value * 320 }],
  }))

  if (isCurrentPlan) {
    return (
      <View
        style={[
          styles.currentCta,
          { backgroundColor: theme.colors.primarySurface, borderColor: theme.colors.primary },
        ]}
      >
        <MaterialIcons name="check-circle" size={18} color={theme.colors.primary} />
        <Text style={[styles.currentCtaText, { color: theme.colors.primary }]}>
          Ya tienes el {plan.name}
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.ctaStack}>
      <Pressable
        accessibilityRole="button"
        disabled={isPurchasing}
        onPress={onSubscribe}
        style={({ pressed }) => [
          styles.primaryCta,
          {
            backgroundColor: theme.colors.primary,
            opacity: isPurchasing ? 0.7 : pressed ? 0.92 : 1,
          },
        ]}
      >
        <View style={styles.ctaLabel}>
          <Text style={styles.primaryCtaLead} numberOfLines={1}>
            Empezar por USD{' '}
          </Text>
          <BillingPriceDigits
            value={plan.priceUsd}
            fractionDigits={2}
            digitStyle={{
              fontSize: 15,
              fontWeight: '900',
              color: '#0F2D06',
              letterSpacing: -0.2,
              fontVariant: ['tabular-nums'],
              lineHeight: 18,
            }}
            separatorStyle={{
              fontSize: 15,
              fontWeight: '900',
              color: '#0F2D06',
              lineHeight: 18,
            }}
            accessibilityLabel={`USD ${plan.priceUsd.toFixed(2)}${cycleSuffix}`}
          />
          <Text style={styles.primaryCtaLead} numberOfLines={1}>
            {cycleSuffix}
          </Text>
        </View>
        {!isPurchasing ? (
          <MaterialIcons name="arrow-forward" size={18} color="#0F2D06" />
        ) : null}
        <Animated.View pointerEvents="none" style={[styles.shimmer, shimmerStyle]} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={isPurchasing}
        onPress={onStartTrial}
        style={styles.trialLink}
        hitSlop={6}
      >
        <Text style={[styles.trialLinkText, { color: theme.colors.textMuted }]}>
          O prueba {BILLING_TRIAL_DAYS} días gratis, sin tarjeta
        </Text>
      </Pressable>
    </View>
  )
}

// ─── Trust pills (unchanged from current) ──────────────────────────
function TrustPills() {
  const { theme } = useAppTheme()
  const items = ['Pago seguro', 'Sin permanencia', 'Tus datos protegidos'] as const
  return (
    <View style={styles.pillsRow}>
      {items.map((item) => (
        <View
          key={item}
          style={[
            styles.pill,
            {
              backgroundColor: theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard,
              borderColor: theme.colors.line,
            },
          ]}
        >
          <View style={[styles.pillDot, { backgroundColor: theme.colors.primary }]} />
          <Text
            style={[styles.pillText, { color: theme.colors.textMuted }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.92}
          >
            {item}
          </Text>
        </View>
      ))}
    </View>
  )
}

// ─── FAQ (unchanged from current) ──────────────────────────────────
const FAQ_PRIMARY: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: '¿Puedo cambiar de plan más adelante?',
    a: 'Sí. Cambias desde aquí o desde tu suscripción en App Store o Google Play. Si pasas del Mensual al Anual, solo pagas la diferencia.',
  },
  {
    q: '¿Qué pasa si dejo de pagar?',
    a: 'Sigues pudiendo ver todo tu historial, pero no podrás agregar gastos nuevos hasta que reactives el plan. Tus datos quedan guardados, no se borran.',
  },
  {
    q: '¿Por qué tiene un costo si es para familias?',
    a: 'Mantener la app cuesta dinero (servidores, mejoras, soporte). Preferimos cobrar una suscripción justa antes que vender los datos de las familias a terceros.',
  },
]
const FAQ_SECONDARY: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: '¿Y si somos más personas que el límite?',
    a: 'Si en el Mensual son más de 2, puedes pasar al Anual con un toque desde aquí, sin perder ningún dato.',
  },
  {
    q: '¿Cómo funciona la prueba gratis?',
    a: 'Tienes 14 días para probar todo sin pagar y sin pedir tarjeta. Te avisaremos por correo y dentro de la app antes de cualquier cobro.',
  },
]

function CompactFaq() {
  const { theme } = useAppTheme()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const items = showAll ? [...FAQ_PRIMARY, ...FAQ_SECONDARY] : FAQ_PRIMARY

  return (
    <View style={styles.faqStack}>
      <Text style={[styles.faqEyebrow, { color: theme.colors.textMuted }]}>PREGUNTAS COMUNES</Text>
      <View
        style={[
          styles.faqCard,
          {
            backgroundColor: theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard,
            borderColor: theme.colors.line,
          },
        ]}
      >
        {items.map((item, idx) => {
          const isOpen = expanded === item.q
          const isLast = idx === items.length - 1 && !showAll
          return (
            <View
              key={item.q}
              style={[
                styles.faqRow,
                !isLast && {
                  borderBottomColor: theme.colors.line,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                onPress={() => {
                  void triggerHaptic('selection')
                  setExpanded(isOpen ? null : item.q)
                }}
                style={styles.faqHead}
                hitSlop={4}
              >
                <Text style={[styles.faqQ, { color: theme.colors.text }]}>{item.q}</Text>
                <MaterialIcons name={isOpen ? 'remove' : 'add'} size={18} color={theme.colors.textMuted} />
              </Pressable>
              {isOpen ? (
                <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)}>
                  <Text style={[styles.faqA, { color: theme.colors.textMuted }]}>{item.a}</Text>
                </Animated.View>
              ) : null}
            </View>
          )
        })}
      </View>
      {!showAll ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void triggerHaptic('selection')
            setShowAll(true)
          }}
          style={styles.faqMore}
          hitSlop={6}
        >
          <Text style={[styles.faqMoreText, { color: theme.colors.primary }]}>Ver más preguntas</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

// ─── Footer micro (unchanged from current) ─────────────────────────
function FooterMicro({
  hasActivePlan,
  onRestore,
  onManage,
}: {
  hasActivePlan: boolean
  onRestore: () => void
  onManage: () => void
}) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.footerStack}>
      <View style={styles.footerLinks}>
        <Pressable
          accessibilityRole="button"
          onPress={onRestore}
          hitSlop={6}
          style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.footerLinkText, { color: theme.colors.textMuted }]}>Ya compré antes</Text>
        </Pressable>
        {hasActivePlan ? (
          <>
            <View style={[styles.footerSep, { backgroundColor: theme.colors.line }]} />
            <Pressable
              accessibilityRole="button"
              onPress={onManage}
              hitSlop={6}
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[styles.footerLinkText, { color: theme.colors.textMuted }]}>Ver mi suscripción</Text>
            </Pressable>
          </>
        ) : null}
      </View>
      <Text style={[styles.legal, { color: theme.colors.textSoft }]}>
        El plan se renueva solo al final del período. Puedes cancelar desde la tienda cuando quieras. Los precios pueden variar según tu país.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screenContent: { paddingTop: 4 },
  stack: { gap: 16, position: 'relative' },

  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(166,239,143,0.22)',
    overflow: 'hidden',
  },
  heroGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: HERO_GLOW,
    opacity: 0.35,
    transform: [{ translateY: -60 }, { scale: 1.4 }],
    borderRadius: 999,
  },
  heroLeft: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  heroLogoBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(242,234,211,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(242,234,211,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBody: { flex: 1, gap: 6 },
  heroPill: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: ACCENT,
  },
  heroPillText: {
    flexShrink: 1,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: '#0F2D06',
  },
  heroLine: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    color: CREAM,
    letterSpacing: -0.1,
    lineHeight: 18,
  },

  ctaStack: { gap: 6 },
  primaryCta: {
    minHeight: 54,
    borderRadius: radii.lg,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
    shadowColor: '#0F2D06',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
  },
  ctaLabel: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  primaryCtaLead: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F2D06',
    letterSpacing: -0.2,
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 80,
    backgroundColor: 'rgba(255,255,255,0.55)',
    transform: [{ skewX: '-20deg' }],
  },
  trialLink: { paddingVertical: 6, alignItems: 'center' },
  trialLinkText: { fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
  currentCta: {
    minHeight: 48,
    borderRadius: radii.lg,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
  },
  currentCtaText: { fontSize: 14, fontWeight: '800', letterSpacing: 0.1 },

  pillsRow: { flexDirection: 'row', alignItems: 'stretch', gap: 6 },
  pill: {
    flex: 1,
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillDot: { width: 5, height: 5, borderRadius: 999 },
  pillText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.1,
    textAlign: 'center',
  },

  faqStack: { gap: 6 },
  faqEyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.6, paddingHorizontal: 4 },
  faqCard: { borderRadius: radii.lg, borderWidth: 1, overflow: 'hidden' },
  faqRow: { paddingHorizontal: 14, paddingVertical: 11 },
  faqHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  faqQ: { flex: 1, fontSize: 13, fontWeight: '700', lineHeight: 18, letterSpacing: -0.1 },
  faqA: { fontSize: 12, lineHeight: 17, fontWeight: '500', paddingTop: 6, paddingRight: 22 },
  faqMore: { alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 12 },
  faqMoreText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.1 },

  footerStack: { gap: 8, marginTop: 4 },
  footerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  footerSep: { width: 3, height: 3, borderRadius: 999 },
  footerLinkText: { fontSize: 12, fontWeight: '700' },
  legal: { fontSize: 10, lineHeight: 14, textAlign: 'center', paddingHorizontal: 12 },
})
```

- [ ] **Step 6.2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6.3: Lint**

Run: `npm run lint -- mobile/screens/settings/billing-screen.tsx`
Expected: PASS.

- [ ] **Step 6.4: Full validate**

Run: `npm run validate`
Expected: typecheck + lint + test + guards all pass. Pre-existing infra failures in vitest stay at baseline.

- [ ] **Step 6.5: Bundle pre-flight (per `[[feedback-validate-is-not-bundle]]`)**

Run: `npx expo export --platform ios --output-dir /tmp/expo-export-billing-check`
Expected: completes without Metro errors. Note: this verifies the new imports resolve in the bundle, not just under tsc.

If the export fails, fix the root cause (likely an import path or missing dep) before continuing. Do NOT skip this step.

- [ ] **Step 6.6: Commit**

```bash
git add mobile/screens/settings/billing-screen.tsx
git commit -m "$(cat <<'EOF'
feat(billing): compose Plans screen with morph card + cycle picker

Replaces the static 2-tile grid with the new BillingCyclePicker +
BillingPlanMorphCard. PrimaryCTA gets a subtle shimmer sweep every
4s with rolling-digit price. AmbientBlobs tone shifts between calm
(Mensual) and aurora (Anual) to reinforce plan personality. Hero,
TrustPills, FAQ, and FooterMicro are unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Manual smoke test + polish loop

**Files:** none modified in this task unless a bug is found.

- [ ] **Step 7.1: Run the app on a real device or simulator**

Run: `npm start` (already running in dev mode is fine).

Navigate: Settings → "Tu plan" (the route is `(app)/settings/plan`).

- [ ] **Step 7.2: Smoke scenarios**

For each scenario, verify the bullet criteria:

1. **Toggle Mensual → Anual:**
   - Marble slides right with spring.
   - Price digits roll from "4.99" → "39.99" with staggered columns.
   - Savings ribbon flies in from the left.
   - Effective copy "Te sale como USD 3.33 al mes" fades in.
   - Member cap text re-fades to "Hasta 4 personas · Suma a abuelos o hijos."
   - Feature list staggers in; "Atención prioritaria" and "Estrenas las nuevas funciones antes que nadie" show with a star icon.
   - CTA label rolls to "Empezar por USD 39.99/año".
   - AmbientBlobs tone shifts to `aurora`.

2. **Toggle Anual → Mensual:**
   - Same animations play in reverse where applicable; the ribbon fades out to the left.

3. **Active plan = Mensual (force it from devtools if needed):**
   - "TU PLAN" pill appears in the morph card top-right while Mensual is selected.
   - CTA shows the "Ya tienes el Hogar Mensual" current state, no shimmer.

4. **Reduced Motion ON (iOS Settings → Accessibility → Motion → Reduce Motion):**
   - Marble snaps without spring overshoot.
   - Digit roller snaps without stagger.
   - Savings ribbon appears/disappears without slide.
   - CTA shimmer is OFF.

5. **Dark mode:**
   - Morph card uses `surfaceMuted` background instead of cream gradient.
   - All text remains legible.

- [ ] **Step 7.3: If issues found, fix and recommit**

For each issue, create a follow-up commit:

```bash
git add <files>
git commit -m "fix(billing): <one-line description of the polish>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7.4: Push to main**

Run: `git push origin main`
Expected: pushed without conflicts.

---

## Self-Review checklist (post-plan)

**1. Spec coverage:**
- CyclePicker with sliding marble + `−33%` badge → Task 3 ✓
- Single morph card replacing tile grid + checklist → Task 5 ✓
- Digit-roll price with stagger → Tasks 1+2 ✓
- Savings ribbon flies in from left → Task 4 ✓
- Feature stagger on plan change → Task 5 ✓
- Annual-only star icon (no pill) → Task 5 ✓
- CTA shimmer sweep every 4s → Task 6 ✓
- AmbientBlobs tone shift (`calm` ↔ `aurora`) → Task 6 ✓
- Reduced motion respected throughout → Tasks 2, 3, 4, 5, 6 ✓
- Unchanged: useBilling, billing-plans, plan route, AmbientBlobs internals → confirmed ✓

**2. Placeholder scan:** No TBDs, no "handle edge cases", no "similar to". Every step has concrete code or commands.

**3. Type consistency:**
- `BillingCycle = 'monthly' | 'yearly'` — used everywhere consistently.
- `BillingPlanId = 'hogar-mensual' | 'hogar-anual'` — only in screen state mapping.
- `BillingPriceDigits` prop signature stable across Tasks 2, 4, 5, 6.
- `BillingCyclePicker` `onChange: (cycle: BillingCycle) => void` matches the screen handler.
- `BillingPlanMorphCard` takes `plan: BillingPlan` and `isCurrentPlan: boolean` — the screen passes both.
- `ANNUAL_ONLY_SET` is computed inside the morph card module itself, so the screen doesn't pass it.
- The reduced-motion path in `BillingPriceDigits` uses `offset.value = targetOffset` directly (no `withTiming({ duration: 1 })`) — matches the spec's "snap" behavior.

**4. Worklet safety:** `BillingPriceDigits` calls `value.toFixed()` outside the worklet (JS thread), then passes plain numbers to shared values. No `Intl` or locale calls inside any worklet. `[[feedback-reanimated-worklet-globals]]` respected.

**5. Worklet calling JS fns:** No `runOnJS` with inline function calls — all callbacks are `useCallback`-stable JS refs. `[[feedback-reanimated-worklet-calling-js-fns]]` respected.

**6. Easing runtime mixing:** `Easing.bezier` is imported from `react-native-reanimated` (Tasks 2, 6), not `react-native`. `[[feedback-reanimated-easing-runtime]]` respected.

**7. Bundle pre-flight:** Step 6.5 runs `npx expo export --platform ios` before declaring done. `[[feedback-validate-is-not-bundle]]` respected.

**8. Memory updates:** No new persistent memory entries needed for this work — it reuses patterns already documented (digit-roller is single-use, not yet a project pattern).
