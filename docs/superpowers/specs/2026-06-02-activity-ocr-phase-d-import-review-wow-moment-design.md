# Activity OCR — Phase D: Import Review Wow Moment Design

**Fecha:** 2026-06-02
**Branch:** `feature/activity-ocr`
**Depende de:** Phase A + B + C (parser, ML Kit, funcional Import Review Sheet con commit `7904293` como baseline).

## Goal

Transformar la `ImportReviewSheet` de Phase C (funcional, edit-form-heavy) en una experiencia que **se sienta tangible y considerada**. La intención: que cargar 8 movimientos de una captura se sienta como un **momento delicioso**, no como rellenar un formulario. La transformación tiene cinco capas coordinadas, ninguna opcional — la cohesión es la diferencia entre "polished" y "wow".

Lo que cambia: la composición visual, la coreografía de animaciones, el progressive disclosure, el calendar slider para fecha, el confirm cinemático.

Lo que NO cambia: la lógica del confirm (Task 5 Phase C), el parser (A+B), el reducer (Task 3), las mutaciones existentes (`createExpense` / `useCreateIncomeEvent`).

---

## Principios de diseño (synthesized de 4 craft skills)

1. **Cohesión sobre componentes individuales**: cada animación, espaciado, easing y curva rima con la personalidad seria-pero-considerada de Manifiesto. No mezclamos bounce con punchy, no mezclamos cinematic header con rows apretadas.
2. **Spatial continuity**: el sheet entra desde el FAB petal, no del centro. El confirm reverso al cierre. El user nunca pierde el rastro de qué disparó qué.
3. **Progressive disclosure**: rows colapsadas por default. Tap → expande. El user revisa 6 movimientos en 3 segundos sin overwhelm; expande solo los que necesita ajustar.
4. **Gesture-first para fecha**: el calendar slider es el corazón táctil de la sheet. Spring physics + damping + velocity-based commit = se siente como un instrumento, no un picker.
5. **Invisible details compound**: stagger 30-50ms, scale 0.97 en press, easing exponential ease-out (iOS-like `cubic-bezier(0.32, 0.72, 0, 1)`), haptic en cada momento de commitment. Ninguno individualmente vistoso. Juntos: tactile.

---

## Decisiones de scope confirmadas con owner

| Decisión | Resultado |
|---|---|
| Scope Phase D | TOTAL: header cinemático + collapsed rows + calendar slider + confirm cinematic. La cohesión depende de hacer las 5 capas. |
| Thumbnail de captura en el header | SÍ, opacity ~0.55, border-radius generoso, posicionado a la derecha. Prueba al user que vimos lo que mostró. |
| Branch policy | Sigue en `feature/activity-ocr`. No merge a main hasta cerrar Phase D y validate device. |
| Backward compat | Phase C funcional sigue accesible si rebobinamos al commit `7904293`. Phase D reescribe `import-review-sheet.tsx` y `import-review-row.tsx` por encima. |
| Confetti | Sí, solo si N ≥ 5 inserts exitosos. Reusa el `confetti-bus` ya en el repo (instalado en P1 hardening). |

---

## Architecture overview

```
                            FAB "Importar captura" tap
                                        │
                                        ▼
                          openImportFlow() (intacto Phase C)
                                        │
                                        ▼
              parseActivity → mapToReviewRows → ReviewState
                                        │
                                        ▼
                    ImportReviewSheet abre con modal-motion
                                        │
                  ┌─────────────────────┴─────────────────────┐
                  │                                            │
                  ▼                                            ▼
       <ImportReviewHeader />                     <CycleContextProvider>
       (cinematic title +                                      │
        thumbnail captura                                      ▼
        + count summary)                       <ImportReviewRowList>
                                               (stagger entrance 40ms × N)
                                                               │
                                                               ▼
                                                <ImportReviewRow expanded?>
                                                       │
                                          ┌────────────┼──────────────┐
                                          ▼            ▼              ▼
                                     collapsed view  expanded view  (animate
                                                                     between)
                                                          │
                                          ┌───────────────┼────────────┐
                                          ▼               ▼            ▼
                                  description    CycleDateSlider   notes
                                  amount         (NEW component)
                                  category /
                                  incomeKind
                                          │
                                          ▼
                          (sticky footer with confirm CTA)
                                          │
                                          ▼
                              tap Confirmar → cinematic confirm
                              (rows fade out staggered, sheet shrinks
                               back to FAB position, confetti if N≥5)
```

---

## Componentes nuevos

### 1. `CycleDateSlider` (el componente vedette)

**Path:** `mobile/components/import-review/cycle-date-slider.tsx`

**Props:**
```ts
interface CycleDateSliderProps {
  /** Valor actual ISO YYYY-MM-DD. */
  value: string
  /** Primera fecha del ciclo del owner (Date local). */
  cycleStart: Date
  /** Cantidad de días en el ciclo (30, 31, 28, etc.). */
  cycleDays: number
  /** Fecha de hoy ISO (para indicator "today" sutil). */
  today: string
  /** Callback al seleccionar un día. ISO YYYY-MM-DD. */
  onChange: (date: string) => void
}
```

**Comportamiento visual:**

```
─────────────────────────────────────────────────
   lun   mar   mié   jue   vie   sáb   dom   lun
   28    29    30    31     1     2     3     4
                            ◯     ·
   (selected: ring 2px primary, scale 1.06)
   (today: small dot indicator under day number)
   (out-of-cycle: opacity 0.3, no taps)
─────────────────────────────────────────────────
            ←  swipe horizontal  →
```

**Implementación técnica:**

- **Container**: `Animated.ScrollView` horizontal con `snapToInterval: tileWidth`, `decelerationRate: 'fast'`, `snapToAlignment: 'center'`. Reanimated 4 worklet handles scroll.
- **Tile**: 56pt wide × 64pt tall. Touch target inflado con `hitSlop` para llegar a 44pt min.
- **Tile layout**:
  - Weekday abreviado en español (3 chars): `lun/mar/mié/jue/vie/sáb/dom` — fontSize 10, fontWeight 700, letterSpacing 0.5, color `textMuted`
  - Day number: fontSize 22, fontWeight 900 if selected else 700, color `text`
  - Today dot indicator: 4×4 circle bajo el number, primary color, only if `isToday`
- **Selected state**:
  - Ring: `borderWidth: 2, borderColor: theme.colors.primary, borderRadius: 999` (es un círculo alrededor del number)
  - Container scale: 1.06 vía `useAnimatedStyle`
  - Transition: spring `{ damping: 18, stiffness: 220, mass: 0.9 }`
- **Out-of-cycle days**:
  - Render placeholder tiles before `cycleStart` and after `cycleStart + cycleDays - 1` para que el ring de selection no esté "al filo"
  - opacity 0.3, `pointerEvents: 'none'`
- **Drag/swipe gesture**:
  - Spring physics via Reanimated's `withSpring`
  - Damping en bordes: si el user sweep más allá del último día, resistencia logarítmica (no hit wall)
  - Velocity-based commit: si `Math.abs(velocity) > 0.5`, scroll continúa hacia el snap natural
  - Snap final al `tileIndex * tileWidth` más cercano
- **Tap any day**: `scale(0.97)` en press, smooth animate to center, then `onChange(dateISO)`
- **Haptic**: `selection` cuando cambia el día seleccionado (via `triggerHaptic('selection')`)
- **Initial scroll position**: al mount, scrollTo el `value` actual (centered)
- **Reduced motion**: si `useReducedMotion()` true, snap sin animación, sin scale, sin haptic

**Cycle resolution** (helper):

```ts
function buildCycleDays(cycleStart: Date, cycleDays: number): Array<{ iso: string; day: number; weekday: number; isToday: boolean }> {
  const days = []
  const today = new Date()
  const todayISO = formatISO(today)
  for (let i = 0; i < cycleDays; i++) {
    const d = new Date(cycleStart)
    d.setDate(d.getDate() + i)
    const iso = formatISO(d)
    days.push({
      iso,
      day: d.getDate(),
      weekday: d.getDay(),
      isToday: iso === todayISO,
    })
  }
  return days
}
```

**A11y:**
- `accessibilityRole="adjustable"` en el container
- Cada tile: `accessibilityRole="button"`, `accessibilityLabel="día 15 de junio"`, `accessibilityState={{ selected: isSelected }}`
- VoiceOver: cambios de día deben anunciarse

---

### 2. `ImportReviewRowCollapsed` (la vista por default de cada row)

**Path:** `mobile/components/import-review/import-review-row-collapsed.tsx`

**Layout** (collapsed view, ~76pt height):

```
┌──────────────────────────────────────────────────────────┐
│ [ Gasto ]                                  − $55.984      │
│                                                            │
│ LA EUROPEA · vie 31 may                                    │
└──────────────────────────────────────────────────────────┘
```

- **Background**: `theme.colors.creamCard` (light) / `theme.colors.surfaceMuted` (dark). Border 1px `theme.colors.line`. Border radius 14pt.
- **Kind pill** (top-left): fontSize 11 fontWeight 900 letterSpacing 0.5 uppercase, padding 4×8, borderRadius 999. Colores:
  - `expense` → background `primarySurface`, text `primary` (forest green)
  - `income` → background `info` tinted bg, text `info` (blue)
  - `skip` → background `surfaceMuted`, text `textMuted` (gray)
- **Amount** (top-right): fontSize 18 fontWeight 900, `fontVariant: ['tabular-nums']`, color depends on sign (`text` if positive, slight subtle for negative — both readable but signal). Includes the sign character.
- **Secondary line** (below): merchant + " · " + relative date label ("hoy", "ayer", "vie 31 may"). FontSize 12, fontWeight 500, color `textMuted`. `numberOfLines: 1`, `ellipsizeMode: 'tail'`.
- **Warning indicator** (right of secondary, optional): small dot color `warning` if row has any warning. Tap entire row to expand and see why.
- **Tap entire row** → `onExpand()`. The whole card is a Pressable with `scale(0.97)` on press, transition 120ms ease-out.
- **`invalid` state** (description empty or amount<=0): border becomes `danger` color, no other visual disruption.
- **`skip` state**: render the existing `cardSkipped` style from Phase C (pill colapsada con "Restaurar"). No-op for collapsed.

---

### 3. `ImportReviewRow` (rewrite)

**Path:** `mobile/components/import-review/import-review-row.tsx` (rewrite, not new)

**Behavior:**
- Holds local state `[expanded, setExpanded] = useState(false)`
- Tap collapsed → `setExpanded(true)` + haptic `selection` + animate
- Expanded view shows all editable fields (current Phase C content, with the date field SWAPPED for `CycleDateSlider`)
- Tap header of expanded → `setExpanded(false)` + animate back
- Reduced motion: snap, no animation
- Initial state: `expanded = false` for all rows (collapsed default)
- Optionally: rows with `warning` length > 0 could auto-expand the first time (configurable in spec — default behavior is collapsed even with warnings; user discovers warnings via the dot indicator)

**Expand/collapse animation:**
- Use Reanimated's `Layout` animation OR explicit shared values
- Height transitions from collapsed (~76pt) → expanded (~500pt) via `useAnimatedStyle` with `withTiming(target, { duration: 240, easing: Easing.bezier(0.32, 0.72, 0, 1) })`
- Inner content fades in with stagger 50ms per field
- **Critical**: do NOT animate `height` directly on outer container (per impeccable: never animate layout properties). Instead use `maxHeight` with overflow hidden + scale + opacity for inner content.

Actually simpler approach: render expanded content always but with `display: none` / opacity 0 / transform when collapsed. The performance is acceptable for 6-8 rows visible.

Cleanest implementation: use Reanimated's `entering={FadeInDown.duration(220).delay(idx * 40)}` for expanded fields, and the collapsed view has its own `<Animated.View entering={FadeIn}>` etc.

### 4. `ImportReviewHeader` (NEW)

**Path:** `mobile/components/import-review/import-review-header.tsx`

**Layout**:

```
┌──────────────────────────────────────────────────────────┐
│                                              ┌────────┐   │
│  Detecté 6 movimientos                      │        │   │
│  en tu captura                              │ [thumb]│   │
│                                              │        │   │
│  3 gastos, 2 ingresos, 1 a saltear          └────────┘   │
└──────────────────────────────────────────────────────────┘
```

- **Heading** (line 1): fontSize 22, fontWeight 900, letterSpacing -0.4, lineHeight 28, color `text`. NO em dashes. Copy: "Detecté **N movimientos**" where N is bold/heavier weight. Use `fontWeight: '700'` for non-bold, `'900'` for the number.
- **Heading (line 2)**: "en tu captura" — same size, lighter weight (700), `textMuted`. Two-line max.
- **Breakdown** (below): "X gastos, Y ingresos, Z a saltear" — fontSize 12, fontWeight 600, `textMuted`. Updates reactively as user changes kind.
- **Thumbnail** (right): square 72×72, border radius 12, opacity 0.55, `resizeMode: 'cover'`, source `{ uri: state.imageUri }`. Has a subtle inset border (`borderWidth: 1, borderColor: theme.colors.line`). If `imageUri` is empty (edge case), skip the thumbnail and let heading expand full width.

**Entrance:**
- Heading: `FadeIn.duration(240)`
- Breakdown: `FadeInDown.duration(220).delay(80)`
- Thumbnail: `FadeIn.duration(280).delay(60)` + slight scale from 0.95 → 1.0
- Total header settles in ~340ms

---

### 5. `cycle-context.ts` helper

**Path:** `mobile/features/import-review/cycle-context.ts`

Resolves the current cycle for the family (start date + length) from the existing `useHomeSnapshot` hook. Encapsulates the logic so the sheet doesn't need to know about `salary_payment_day`.

```ts
import { useHomeSnapshot } from '@/features/home/use-home-snapshot'

export interface CycleInfo {
  cycleStart: Date  // Local date, midnight
  cycleDays: number // Total days in cycle (typically 28-31)
}

export function useCycleInfo(userId?: string): CycleInfo {
  const snapshot = useHomeSnapshot(userId)
  // home_snapshot RPC returns cycle_start and cycle_days fields.
  // If not loaded yet, compute from salary_payment_day + today.
  const data = snapshot.data
  if (data?.cycle_start && data?.cycle_days) {
    return {
      cycleStart: new Date(data.cycle_start),
      cycleDays: data.cycle_days,
    }
  }
  // Fallback: compute heuristic cycle from today
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  return { cycleStart: start, cycleDays: 31 }
}
```

If `useHomeSnapshot` doesn't expose `cycle_start` and `cycle_days` (need to verify in recon), we compute them from `salary_payment_day` + today using the same formula `home_snapshot()` RPC uses internally. Helper:

```ts
function computeCycleFromSalaryDay(salaryDay: number, today: Date): CycleInfo {
  // Same logic as home_snapshot() RPC:
  //   if today.day >= salaryDay → start = day(salaryDay) of current month
  //   else → start = day(salaryDay) of previous month
  // length = 1 month from start
  const day = today.getDate()
  const year = today.getFullYear()
  const month = today.getMonth()
  const monthOffset = day >= salaryDay ? 0 : -1
  const start = new Date(year, month + monthOffset, salaryDay)
  const next = new Date(start)
  next.setMonth(next.getMonth() + 1)
  const cycleDays = Math.round((next.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  return { cycleStart: start, cycleDays }
}
```

---

## ImportReviewSheet (rewrite)

**Path:** `mobile/components/import-review/import-review-sheet.tsx` (rewrite — Phase C version replaced)

**Structure**:

```tsx
<ModalCard visible={...} onClose={...} title="" subtitle="">
  <Animated.ScrollView>
    <ImportReviewHeader
      transactionsCount={...}
      breakdown={controller.submittableBreakdown}
      skipCount={controller.skippedCount}
      imageUri={controller.state.imageUri}
    />

    {totalRows === 0 ? (
      <ImportReviewEmpty />
    ) : (
      <Animated.View>
        {rows.map((row, idx) => (
          <Animated.View
            key={row.id}
            entering={FadeInDown.duration(220).delay(idx * 40)}
          >
            <ImportReviewRow
              row={row}
              cycleStart={cycleInfo.cycleStart}
              cycleDays={cycleInfo.cycleDays}
              today={today}
              categories={categories}
              invalid={controller.invalidIds.includes(row.id)}
              onSetKind={...}
              onPatch={...}
              onUnskip={...}
            />
          </Animated.View>
        ))}

        {controller.state.unmatched > 0 ? (
          <Text style={...}>
            {`${controller.state.unmatched} líneas no se pudieron clasificar.`}
          </Text>
        ) : null}
      </Animated.View>
    )}

    <View style={styles.footerSlot}>
      <ImportReviewFooter ... />
    </View>
  </Animated.ScrollView>
</ModalCard>
```

**Confirm cinematic** (when user taps Confirmar):

```ts
async function handleConfirm() {
  setBusy(true)
  try {
    const result = await confirm(controller.state.rows)
    const total = result.insertedExpenses + result.insertedIncomes

    // Cinematic fade-out: each row fades out with stagger
    setFadingOut(true)
    await new Promise(resolve => setTimeout(resolve, controller.state.rows.length * 50 + 200))

    // Toast
    if (total > 0) { /* existing toast logic */ }

    // Confetti for ≥5
    if (total >= 5) {
      confettiBus.emit({ kind: 'celebration' })
    }

    onClose()
  } finally {
    setBusy(false)
  }
}
```

When `fadingOut` is true, the rows render with `exiting={FadeOutUp.duration(180).delay(idx * 50)}` (Reanimated `exiting`). The whole sheet then closes via the ModalCard.

---

## ModalCard entrance: spatial origin from FAB

The ModalCard currently presents from center. For Phase D, we need it to animate from the FAB position (right side, near bottom). Two approaches:

**Approach A (preferred — uses existing ModalCard)**: Add a prop `originFrom: { x: number; y: number }` to ModalCard. The internal Animated.View scales from `{ x, y }` to fill. Default to center if not provided.

If ModalCard doesn't support custom origin, **Approach B**: wrap our content in a separate `Animated.View` that uses a shared value to scale from the FAB position. ModalCard's `<Modal>` shell remains centered; our inner content does the spatial dance.

**Approach C (simplest)**: keep ModalCard centered, add a brief 200ms "echo" animation where the FAB pulses outward at the moment of tap, providing a visual link without changing ModalCard's internals.

Implementation choice: Approach C for v1 (minimum risk to existing ModalCard). Approach A in a follow-up if the spatial origin really moves the needle.

---

## Copy improvements (impeccable: every word earns its place; no em dashes)

| Phase C (current) | Phase D (new) | Why |
|---|---|---|
| "Revisar importación" | "Detecté **N movimientos**\nen tu captura" | Active voice, specific number, declares accomplishment. |
| "Detecté N movimientos." (subtitle) | (gone — folded into the heading) | DRY |
| "No detecté gastos en esa captura." | "No vi gastos en esa captura.\nProbá con otra imagen." | Shorter, action-forward |
| "Probá con otra imagen o cargá manualmente desde el botón principal." | (rebalanced into above) | |
| "Confirmar 3 gastos + 1 ingreso" | "Confirmar 3 gastos y 1 ingreso" | Use "y" not "+", less computerese |
| "Cargando importación…" | "Cargando…" reading "Importando 3 gastos y 1 ingreso…" | Action-specific |
| "Necesito acceso a tus fotos para importar capturas." | (kept; clean already) | |
| Warning: "⚠ Moneda no soportada (EUR/BTC/etc). Editá el monto en ARS para importar." | "Moneda no soportada. Editá el monto en ARS." | Drop the ⚠ emoji; the visual chip already signals warning. Shorter. |
| Warning: "⚠ Es un swap de monedas. Verificá antes de cargar." | "Cambio de moneda. Verificá antes de cargar." | "Cambio" is more native than "swap"; drops emoji |
| Warning: "⚠ Sin descripción detectada. Completá antes de confirmar." | "Sin descripción. Completá antes de confirmar." | Drop emoji and redundant word |
| Warning: "⚠ Sin fecha detectada. Default: hoy." | "Sin fecha clara. Asumimos hoy." | Drop emoji; friendlier |
| Warning: "⚠ Monto $0. Editá antes de confirmar." | "Monto 0. Editá antes de confirmar." | Drop emoji and the $ (which renders weird inline) |

---

## Files summary

```
NEW:
  mobile/components/import-review/cycle-date-slider.tsx         (~280 lines)
  mobile/components/import-review/import-review-row-collapsed.tsx (~120 lines)
  mobile/components/import-review/import-review-header.tsx       (~110 lines)
  mobile/features/import-review/cycle-context.ts                  (~50 lines)
  tests/unit/import-review-cycle-context.test.ts                  (~80 lines, pure helper tests)
  tests/unit/cycle-date-slider-math.test.ts                       (~60 lines, helper math: buildCycleDays)

REWRITE:
  mobile/components/import-review/import-review-row.tsx          (collapsed↔expanded orchestrator)
  mobile/components/import-review/import-review-sheet.tsx        (header + row list + cinematic confirm)
  mobile/components/import-review/import-review-empty.tsx        (smaller copy refactor)
  mobile/components/import-review/import-review-footer.tsx       (copy + total amount summary)

UNCHANGED (Phase A+B+C):
  mobile/features/activity-ocr/*  (todo el parser)
  mobile/features/import-review/types.ts
  mobile/features/import-review/map-to-review-rows.ts
  mobile/features/import-review/review-reducer.ts
  mobile/features/import-review/use-import-review-controller.ts
  mobile/features/import-review/use-confirm-import.ts
  mobile/features/import-review/open-import-flow.ts
  mobile/components/navigation/add-expense-tab-button.tsx
  mobile/components/navigation/add-quick-actions-overlay.tsx
```

---

## Animation / motion system

All durations and easings, centralized in this section so the implementer doesn't need to invent values:

**Easing**:
- Primary curve: `Easing.bezier(0.32, 0.72, 0, 1)` (iOS-like drawer)
- Exit curve: `Easing.bezier(0.55, 0, 0.1, 1)` (faster ease-in to feel responsive)
- ALL via Reanimated's `Easing` (NOT react-native's) — per `[[feedback-reanimated-easing-runtime]]`

**Durations**:
- Press feedback (scale 0.97): 120ms
- Row collapse/expand: 240ms
- Header entrance: 240ms (heading) + 220ms (breakdown, 80ms delay)
- Row entrance stagger: 220ms each + 40ms × index delay
- Confirm fade-out stagger: 180ms each + 50ms × index delay
- Calendar slider snap: spring `{ damping: 18, stiffness: 220, mass: 0.9 }`
- Sheet open (ModalCard): managed by ModalCard, ~300ms

**Reduced motion**:
- All `entering`/`exiting` → `undefined`
- All `withTiming`/`withSpring` → snap instant
- All `Animated.ScrollView` snap behavior preserved (essential for usability)

---

## Edge cases explicitly handled

| Case | Behavior |
|---|---|
| 0 transactions (parseActivity returned empty) | `ImportReviewEmpty` rendered (no rows, no calendar). Footer says "Nada para cargar", disabled. |
| `cycleInfo` not loaded yet (snapshot loading) | Use heuristic cycle (current month, day 1 → 31). User can still pick a date. Update reactively when snapshot lands. |
| `imageUri` is empty string | Header thumbnail just renders nothing; the heading expands to full width. |
| 30+ rows | The ScrollView handles long lists fine. Stagger entrance caps at index 8 (rows 9+ enter without per-row delay to avoid feeling slow). |
| Row expanded while user scrolls down | Tap collapse from header to collapse. Or tap another row to expand (multiple rows can be expanded at once — by design, no "single-expand" lock). |
| User confirms while a row is expanded | The row collapses as part of the confirm fade-out. No special case. |
| All rows skipped | Footer reads "Nada para cargar", disabled. User cancels. |
| Confirm with 1 row succeeded, 1 failed | Toast: "Cargué 1 gasto. 1 no se pudo cargar." Sheet still closes (no inline retry in v1). |
| Reduced motion ON | All entrance animations are FadeIn (no translate); confirm doesn't stagger; confetti suppressed. |
| Dark mode | All colors use theme tokens. Cycle slider tested: ring contrast OK against `surfaceMuted` and `creamCard`. |

---

## Out of scope (v1 of Phase D)

- Inline retry of failed rows (user has to re-pick the captura)
- Editing the captura crop / re-running parser
- Persistent drafts across app launches (sheet state resets if user closes)
- Multiple captures in one flow (one captura per sheet)
- Sharing intent / share extension entry (still future)

---

## Aceptación

- [ ] Sheet abre con modal-motion (echo from FAB OK as v1; full spatial origin in Phase D.1 if user wants)
- [ ] Header muestra "Detecté N movimientos en tu captura" + breakdown + thumbnail (opacity 0.55)
- [ ] Rows arrancan collapsed por default. Tap → expand con stagger 50ms de los campos.
- [ ] CycleDateSlider reemplaza el input ISO YYYY-MM-DD. Swipe horizontal con spring physics + damping en bordes. Tap día → scroll to center + select + haptic.
- [ ] Días fuera del ciclo: greyed (opacity 0.3), no clickeables.
- [ ] Today: dot indicator sutil bajo el number.
- [ ] Selected: ring 2px primary + scale 1.06.
- [ ] Confirm cinematic: rows fade out con stagger, checkmark briefly visible, sheet closes, toast appears.
- [ ] Confetti si N ≥ 5 inserts exitosos.
- [ ] Reduced motion: snap everywhere, no confetti.
- [ ] Dark mode: contrast OK en todos los componentes.
- [ ] 78 tests Phase A+B + 22 tests Phase C + 2-3 nuevos del cycle context y date math = ~100+ tests passing.
- [ ] Bundle pre-flight verde iOS + Android.
- [ ] No em dashes in copy.
- [ ] No `#000`/`#fff` puros — todo tinted hacia brand.
- [ ] Touch targets ≥44pt en cycle slider tiles, kind toggle, picker buttons.
- [ ] Smoke device: cargar captura con 6 transacciones, expandir 2, ajustar fecha de 1 via slider, skip 1, confirmar 4. Verificar en Home/Gastos que los gastos/ingresos cargados aparecen.
