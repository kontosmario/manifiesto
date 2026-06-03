# Patrón de validación de formularios

> Patrón compartido entre `add-expense`, `add-income`, `add-fijo` y el wizard del import-review. Cubre: no pre-seleccionar campos críticos, primary CTA visual-only disabled pero tappable, per-field warning marks con glide animado, helper line bajo el botón.
>
> **Estado:** ✅ LIVE 2026-06-03. Rolloueado a los 4 forms del producto.

---

## Por qué existe

Tres anti-patrones que arruinan la UX de formularios:

1. **Pre-seleccionar valores críticos** (primera categoría, primer kind) → el usuario acepta defaults sin pensar → data miscategorizada / mislabeled. La integridad del dato vale más que el tap ahorrado.
2. **Botón disabled sin feedback** → el usuario no sabe qué falta → tap repetido frustrado o abandono.
3. **Marcar el card entero en rojo** cuando hay un campo faltante → "invasivo y visualmente horrible" (feedback directo del owner) → ansiedad sin clarity sobre qué fixear.

El patrón resuelve los tres.

---

## Reglas del patrón

### 1. No pre-seleccionar campos "category-like"

Si el campo es una elección entre N opciones discretas (categoría, kind, frecuencia), arranca null/vacío.

| Form | Campo | Estado inicial |
|---|---|---|
| Import review wizard | categoryId | `null` |
| Add expense | categorySelection | `''` |
| Add income | kind | `null` |
| Add fijo | categoryId | `null` |
| Add fijo | freqChoice | `null` |

Excepción razonable: campos con sentido temporal (fecha = hoy) o campos opcionales (notes). Para los required + discretos, no preselect.

### 2. Required fields → `missingFields: string[]`

Cada form expone una lista de nombres human-readable de campos requeridos faltantes.

```ts
// use-add-expense-controller.ts
const missingFields = useMemo<string[]>(() => {
  const missing: string[] = []
  if (!hasValidAmount) missing.push('monto')
  if (description.trim().length === 0) missing.push('descripción')
  if (!selectedCategoryId) missing.push('categoría')
  return missing
}, [hasValidAmount, description, selectedCategoryId])
```

Naming: castellano con minúscula (`'monto'`, `'descripción'`, `'categoría'`, `'tipo de ingreso'`, `'frecuencia'`, `'nombre'`, `'fecha de pago'`, `'día del mes'`). El helper `formatMissingFields()` los junta en lenguaje natural ("Completá monto y categoría para continuar.").

### 3. `canSubmit = missingFields.length === 0`

Una sola fuente de verdad. No tener `canSubmit` derivado de chequeos separados (ej. `hasValidAmount && Boolean(category)`) porque agregar un required field nuevo no actualiza el flag pero sí entra a `missingFields`, generando skew entre el gate del CTA y la lista que enumera el usuario.

### 4. Primary CTA: `lookDisabled` ≠ `disabled`

El CTA tiene dos estados de "no operativo":

- **`hardDisabled`**: blocking. Press no llega. Reservado para in-flight network (`isBusy`/`loading`).
- **`lookDisabled`**: visual disabled (opacity 0.45, sin haptic) **pero el press LLEGA**. El handler decide qué hacer con él.

`AppButton` soporta esto via:
```tsx
<AppButton
  loading={isBusy}      // hard-block
  disabled={false}      // no hard-block por validación
  lookDisabled={!canSubmit}   // visual disabled
  onPress={handlePrimaryPress}
/>
```

El wizard usa su propio `PrimaryCTA` con la misma semántica (`hardDisabled` + `lookDisabled` props).

### 5. Press routing del CTA

```ts
function handlePrimaryPress() {
  if (!canSubmit) {
    void triggerHaptic('warning')
    setHighlightToken(t => t + 1)   // o llamar la action del controller
    return
  }
  onSubmit()
}
```

Tap en CTA dimmed → warning haptic + bump highlightToken. Tap en CTA habilitado → submit.

### 6. `highlightToken: number` → `isFlagged: boolean`

Un contador que se incrementa cada vez que el user toca el CTA dimmed. El form captura el valor inicial en un ref al mount y compara:

```ts
const initialTokenRef = useRef(highlightToken)
const isFlagged = highlightToken > initialTokenRef.current
```

**Por qué un counter y no un boolean**: porque el flag tiene que persistir desde el primer tap hasta que se complete TODO. Un boolean `setHasFlagged(true)` también funcionaría — pero el counter da una semántica más limpia (cada tap es una intención registrada, incluso después del primer flag) y permite extender en el futuro (ej. shake animation que se replay cada tap).

### 7. Per-field warning marks

Por cada field requerido faltante, derivar un `flag<Field>` y pasarlo al componente:

```ts
const flagAmount = isFlagged && missingFields.includes('monto')
const flagDescription = isFlagged && missingFields.includes('descripción')
const flagCategory = isFlagged && missingFields.includes('categoría')

// Render
<AmountCard warning={flagAmount} ... />
<DescriptionRow warning={flagDescription} ... />
<CategoryHorizontalRail warning={flagCategory} ... />
```

Mismo patrón en todos los forms. Si el componente no soporta `warning`, extenderlo (ver siguiente sección).

### 8. Helper line bajo el CTA

```tsx
{showMissingHelper ? (
  <View style={styles.helperRow}>
    <MaterialIcons name="error-outline" size={14} color={theme.colors.warning} />
    <Text style={[styles.helperText, { color: theme.colors.warning }]} numberOfLines={2}>
      {formatMissingFields(missingFields)}
    </Text>
  </View>
) : null}
```

`formatMissingFields()` está en [`mobile/lib/form-missing-fields.ts`](../../mobile/lib/form-missing-fields.ts). Caps a 3 visibles con ellipsis tail.

---

## Cómo soportar `warning` en un componente

El patrón es siempre el mismo: animar suavemente entre el color "normal" y el `theme.colors.warning` con `warningProgress: SharedValue` + nested `interpolateColor`, **sin cambiar `borderWidth`** ni ningún valor que afecte el layout.

### Receta para inputs con animated border

```ts
const warningProgress = useSharedValue(warning ? 1 : 0)

useEffect(() => {
  warningProgress.value = reduceMotion
    ? (warning ? 1 : 0)
    : withTiming(warning ? 1 : 0, {
        duration: motionDurations.standard,
        easing: Easing.bezier(0.32, 0.72, 0, 1),   // iOS-cubic
      })
}, [warning, reduceMotion, warningProgress])

const borderStyle = useAnimatedStyle(() => {
  'worklet'
  // 1. "¿Qué color tendría el border en modo normal al nivel de focus actual?"
  const normalColor = interpolateColor(
    focusProgress.value,
    [0, 1],
    [theme.colors.line, theme.colors.primary],
  )
  // 2. "¿Qué color tendría en modo warning al nivel de focus actual?"
  const warnColor = interpolateColor(
    focusProgress.value,
    [0, 1],
    [theme.colors.warning, theme.colors.warning],
  )
  // 3. Blend entre los dos por warningProgress.
  return {
    borderColor: interpolateColor(
      warningProgress.value,
      [0, 1],
      [normalColor, warnColor],
    ),
    borderWidth: 1 + focusProgress.value,   // NO depende de warning
  }
})
```

Reanimated v3 devuelve strings de color desde `interpolateColor` y acepta strings como anchors → la blend nested funciona limpio.

### Receta para componentes con label (eyebrow)

Cuando el componente tiene un `<Text>` label arriba del input, también animar su color:

```ts
const labelAnimatedStyle = useAnimatedStyle(() => ({
  color: interpolateColor(
    warningProgress.value,
    [0, 1],
    [theme.colors.textMuted, theme.colors.warning],
  ),
}))

// Renderizar como Animated.Text:
<Animated.Text style={[typography.eyebrow, labelAnimatedStyle]}>
  {label}
</Animated.Text>
```

### Receta para componentes "tile picker" (kind, frequency)

Cuando son botones outlined que se seleccionan (income kind, fijo frequency):

```tsx
// El tile seleccionado se queda con el brand color (recovery state unambiguous).
// Los unselected tintan al warning cuando flag.
borderColor: selected
  ? theme.colors.primary
  : flag
    ? theme.colors.warning
    : theme.colors.line
```

Si el tile tiene su propia animación de selección, replicar el patrón nested con `selectedProgress` + `warningProgress`.

### Anti-patrones a evitar

- ❌ `borderWidth: warning ? 1.5 : 1 + focusProgress.value` — el +0.5px de salto reshapea el layout sutilmente.
- ❌ Wrap externo con padding/border alrededor del componente cuando se activa warning — agrega chrome, salta el sibling layout.
- ❌ Swap instantáneo del color sin `withTiming` — feels jittery.
- ❌ `transform: warning ? [{ scale: 0.97 }] : undefined` — RN bridge coerce `undefined → null`, `processTransform.forEach()` crashea. Ver memoria [`feedback_transform_undefined_crash`](../../.claude/projects/-Users-mario-apps-manifiesto/memory/feedback_transform_undefined_crash.md).

---

## Componentes que ya soportan `warning`

| Componente | Path | Notas |
|---|---|---|
| `TextField` | [`mobile/components/ui/text-field.tsx`](../../mobile/components/ui/text-field.tsx) | Label + border glides |
| `AmountCard` | [`mobile/components/home/amount-card.tsx`](../../mobile/components/home/amount-card.tsx) | Border interpolación nested |
| `DescriptionRow` | [`mobile/components/home/description-row.tsx`](../../mobile/components/home/description-row.tsx) | Forwardea al TextField interno |
| `CategoryHorizontalRail` | [`mobile/components/home/category-horizontal-rail.tsx`](../../mobile/components/home/category-horizontal-rail.tsx) | Label glide + text flip a "Elegí una categoría" |
| `NameInput` (fijo) | [`mobile/screens/home/add-fijo-v2-screen.tsx`](../../mobile/screens/home/add-fijo-v2-screen.tsx) | Inline. Mismo patrón nested. |
| `FreqTile` (fijo) | [`mobile/screens/home/add-fijo-v2-screen.tsx`](../../mobile/screens/home/add-fijo-v2-screen.tsx) | Inline. Tile picker variant. |
| `AppButton` | [`mobile/components/ui/button.tsx`](../../mobile/components/ui/button.tsx) | `lookDisabled` prop |

---

## Cómo aplicar a un form nuevo

Checklist:

1. ✅ **No pre-seleccionar** category-like fields. Estado inicial null/empty.
2. ✅ Derivar `missingFields: string[]` con `useMemo`.
3. ✅ Computar `canSubmit = missingFields.length === 0`.
4. ✅ `useState(0)` para `highlightToken`, `useRef(0)` para `initialTokenRef`.
5. ✅ Derivar `isFlagged = highlightToken > initialTokenRef.current`.
6. ✅ Por cada required field, derivar `flag<Field> = isFlagged && missingFields.includes(...)`.
7. ✅ Pasar `warning={flag<Field>}` a cada input correspondiente.
8. ✅ `handlePrimaryPress`: si `!canSubmit`, bump highlightToken + warning haptic; si canSubmit, submit.
9. ✅ `<AppButton lookDisabled={!canSubmit} disabled={false} ...>` (o el equivalente bespoke).
10. ✅ Helper line bajo el CTA con `formatMissingFields(missingFields)`.

Si todo es uniforme, está rolloutable a un form nuevo en menos de 30 minutos.

---

## Forms que aplican el patrón hoy

| Form | Required fields | Notas |
|---|---|---|
| Import review wizard (cada step) | descripción, monto, categoría (si gasto) | Plus jump-to-invalid en confirm attempt |
| Add expense | monto, descripción, categoría | — |
| Add income | monto, descripción, tipo de ingreso | Kind tiles con warning border |
| Add fijo (step 1) | nombre, monto, categoría, frecuencia | FreqTile con warning border |
| Add fijo (step 2) | día del mes | Copy-driven CTA: "Elige el día del mes" — sin lista explícita porque hay un solo input |
