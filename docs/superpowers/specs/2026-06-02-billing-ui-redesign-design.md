# Billing UI Redesign — "One Hero, Two Souls"

**Fecha:** 2026-06-02
**Scope:** Solo UI. La lógica de `use-billing.ts`, la fuente de planes (`billing-plans.ts`) y el flujo de compra/trial no se tocan en este spec.
**Archivos primarios afectados:**
- `mobile/screens/settings/billing-screen.tsx` (reescritura de la composición; reusa imports de Reanimated/Linear/Fern/Ambient ya en el archivo).
- Nuevos sub-componentes presentacionales bajo `mobile/components/billing/`.

---

## Goal

Transformar la pantalla de Planes de una grilla estática de 2 tiles + checklist en una experiencia de "una sola card cinematográfica que se transforma" entre Mensual y Anual, con animaciones únicas que extienden la identidad premium-bosque ya establecida (AmbientBlobs, FernLogo, gradiente `#0F2D06 → #297811`, acento `#A6EF8F`).

## Inspiration

- **Apple One subscription picker** — un solo hero con cambio de plan suave.
- **Arc Max upgrade modal** — ribbon de savings que entra con física.
- **Mercury pricing** — tipografía bold de precios con tabular-nums y digit-roll.
- **Stripe Climate** — gradientes vivos + transitions micro-elegantes.

## Non-goals

- No se cambia el modelo de datos de planes (`BillingPlan`).
- No se introduce un tercer plan ni un toggle "monthly equivalent" más allá del existente.
- No se conecta IAP real (RevenueCat / StoreKit / Play Billing) — eso sigue mockeado vía `useBilling`.
- No se mueven los strings a i18n (Manifiesto es es-AR-only por ahora).
- No se rediseña la FAQ ni el footer micro (se conservan tal cual; solo se reordenan en la pila si el flow lo pide).

---

## Composición de la pantalla

Orden vertical dentro de `<Screen canGoBack title="Tu plan">`:

```
┌──────────────────────────────────────┐
│ AmbientBlobs (cambia tone con plan) │  ← background
├──────────────────────────────────────┤
│ 1. CompactHero (existente)           │
│ 2. CyclePicker (NUEVO)               │
│ 3. PlanMorphCard (NUEVO, reemplaza  │
│    PlanGrid + PlanDetail)            │
│ 4. PrimaryCTA (mejorada: shimmer)    │
│ 5. TrustPills (existente)            │
│ 6. CompactFaq (existente, sin       │
│    cambios)                           │
│ 7. FooterMicro (existente)           │
└──────────────────────────────────────┘
```

Cada bloque sigue envuelto en `RiseView` con `delay` escalonado (igual que hoy). `CyclePicker` se inserta entre `CompactHero` y la card.

---

## Componentes nuevos

### 1. `BillingCyclePicker`

**Path:** `mobile/components/billing/billing-cycle-picker.tsx`

**Props:**
```ts
{
  selected: BillingCycle
  monthlyLabel: string  // "Mensual"
  yearlyLabel: string   // "Anual"
  savingsBadgeText: string | null  // "−33%" en yearly, null en monthly
  onChange: (cycle: BillingCycle) => void
  disabled?: boolean
}
```

**Visual:**
- Pill horizontal con dos segmentos del mismo ancho.
- Una "marble" (pill interna del color `theme.colors.primary` con leve sombra cream) se desliza entre segmentos.
- El segmento "Anual" muestra un mini-badge `−33%` flotante en la esquina superior derecha, siempre visible (no se mueve con la marble).
- Texto del segmento seleccionado: `#0F2D06` (forest oscuro). Texto del no seleccionado: `textMuted`.

**Animación:**
- La marble usa un `useSharedValue<number>` 0→1 con `withSpring({ damping: 18, stiffness: 200 })`. Transform: `translateX` interpolado entre `0` y `width/2`.
- El cambio de color del texto se hace con `useAnimatedStyle` y `interpolateColor` para evitar flicker.
- Haptic `selection` en cada cambio (sólo si efectivamente cambia).
- Respeta `useReducedMotion()`: cuando está activo, `withTiming(target, { duration: 1 })` (snap instantáneo).

**Accesibilidad:**
- `accessibilityRole="tablist"` en el contenedor; cada segmento es `accessibilityRole="tab"` con `accessibilityState={{ selected }}`.
- Labels: `"Plan Mensual"` y `"Plan Anual, ahorrás 33 por ciento"`.

---

### 2. `BillingPriceDigits`

**Path:** `mobile/components/billing/billing-price-digits.tsx`

**Props:**
```ts
{
  value: number          // ej. 4.99 o 39.99
  fractionDigits?: 2     // default 2
  style?: TextStyle      // se aplica a cada dígito
  height: number         // alto fijo del bounding box (p.ej. 36)
}
```

**Visual:**
- Renderiza cada dígito como una columna fija de ancho ~`digitWidth` (calculado con `onLayout` del dígito `"8"` la primera vez, o un valor estimado de `0.58 * fontSize` como fallback estable).
- Dentro de cada columna, una pila vertical `0,1,2,…,9` se traslada en Y para que el dígito target quede centrado en la ventana visible.
- El punto decimal y el resto (currency, suffix) los renderiza el caller; este componente sólo se ocupa de los dígitos.

**Animación:**
- Cada columna tiene su propio `useSharedValue<number>`. Cuando `value` cambia, se actualiza con `withTiming(targetDigit * -digitHeight, { duration: 380, easing: Easing.bezier(0.22, 1, 0.36, 1) })`.
- Se aplica un **stagger** por columna: la columna más significativa arranca a los 0ms, la siguiente a los 60ms, la siguiente a los 120ms. Esto evita el efecto "slot machine sincronizado" y da un look más editorial / Mercury.
- Reduced motion: snap instantáneo (duración 1ms, sin stagger).

**Importante (worklet safety):**
- No usar `Intl`/`toLocaleString` adentro de worklets — el valor se convierte a string con `value.toFixed(fractionDigits)` ANTES del worklet (JS thread). Esto está documentado en `[[feedback-reanimated-worklet-globals]]`.

---

### 3. `BillingSavingsRibbon`

**Path:** `mobile/components/billing/billing-savings-ribbon.tsx`

**Props:**
```ts
{
  visible: boolean       // true en yearly, false en monthly
  savingsUsd: number     // 19.89
  effectiveCopy?: string // "Te sale como USD 3.33 al mes"
}
```

**Visual:**
- Pill rectangular full-width dentro de la card, con fondo `theme.colors.primarySurface`, borde `theme.colors.primary`, padding generoso.
- Icono `savings` a la izquierda, texto `"Ahorrás USD 19.89 al año · Te sale como USD 3.33 al mes"` a la derecha.

**Animación de entrada (visible: false → true):**
- Entrante con `entering={FadeInLeft.duration(280).springify().damping(16)}` (FadeInLeft de `react-native-reanimated`).
- El número `19.89` usa el mismo `BillingPriceDigits` para que el counter "se llene" en sincronía con el digit-roll del precio principal — refuerza la sensación de "todo se acomoda al elegir Anual".

**Animación de salida (visible: true → false):**
- `exiting={FadeOutLeft.duration(180)}`.

**Reduced motion:**
- Si está activo, no hay entering/exiting (snap visible / hidden).

---

### 4. `BillingPlanMorphCard`

**Path:** `mobile/components/billing/billing-plan-morph-card.tsx`

**Props:**
```ts
{
  plan: BillingPlan           // plan completo del cycle seleccionado
  annualOnlyFeatures: ReadonlySet<string>
  isCurrentPlan: boolean      // muestra "Tu plan activo" si aplica
}
```

**Layout (top → bottom dentro de la card):**

1. **Header:** Nombre del plan + tagline. Cambia de plan con `Animated.Text` que usa `entering={FadeIn.duration(200)}` y `key={plan.id}` para forzar remount→reentry.
2. **Bloque de precio:** Currency "USD" pequeño en una línea, debajo digit-roller bold gigantesco (`fontSize: 64, fontWeight: '900', letterSpacing: -2.4, fontVariant: ['tabular-nums']`) seguido por `,XX` (parte decimal, también digit-roller) y suffix `/año` o `/mes`. El currency y el suffix no se anian; sólo los dígitos hacen roll.
3. **Effective copy:** "Te sale como USD 3.33 al mes" — solo visible en anual, con fade in/out.
4. **`BillingSavingsRibbon`** (descripto arriba).
5. **Divider hairline.**
6. **Member cap row:** Icono `group` + "Hasta 4 personas" + subtítulo "Suma a abuelos o hijos" (cambia con el plan; mismo `key={plan.id}` reentry).
7. **Eyebrow `QUÉ INCLUYE`.**
8. **Lista de features con stagger:**
   - Cada feature row se renderiza con `Animated.View entering={FadeInDown.duration(200).delay(idx * 35)}` y `key={`${plan.id}-${feature}`}` para que reentry al cambiar de plan.
   - Features que están en `annualOnlyFeatures` usan un icono diferente: `star` con color primary en vez de `check-circle`. No usan el pill "Solo en Anual" del diseño actual; el icono ya comunica la diferencia, menos ruido visual.
9. **(Opcional) Footer interno:** Si `isCurrentPlan`, muestra una mini-pill "TU PLAN ACTIVO" en la esquina superior derecha del card (no en el CTA — el CTA se maneja afuera).

**Background sutil:**
- La card tiene un gradiente *muy* leve detrás (LinearGradient con dos stops de `theme.colors.creamCard` y `theme.colors.creamSoft`, opacity 0.6). En dark mode usa `surfaceMuted → surfaceDeep`.
- Border `theme.colors.line`, `borderRadius: radii.xl`.

**Sombra:**
- Sombra base más pronunciada que las tiles actuales (`shadowOpacity: 0.14, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }`) — la card es el protagonista.

**Cambio de plan:**
- El componente NO maneja el cycle picker; sólo recibe `plan` y reacciona. El padre cambia el prop y los re-mounts internos (vía `key={plan.id}` en bloques clave) disparan las animaciones.
- El componente raíz NO se desmonta — sólo sus hijos clave-cambiantes — para que la card en sí no parpadee.

---

### 5. `BillingPrimaryCta` (mejorada)

**Path:** se queda inline en `billing-screen.tsx` (no es reutilizable fuera) PERO se extrae internamente como sub-componente para legibilidad.

**Cambios vs. existente:**
- Mantiene la API actual: `plan`, `isCurrentPlan`, `isPurchasing`, `onSubscribe`, `onStartTrial`.
- Añade un **shimmer sweep**: cada ~4s una franja diagonal de `rgba(255,255,255,0.18)` cruza el botón de izquierda a derecha en ~700ms. Implementación con `useSharedValue` y `withRepeat(withSequence(withDelay(3300, withTiming(1, { duration: 700 })), withTiming(0, { duration: 0 })), -1)`.
- El shimmer se pausa cuando `isPurchasing` o `isCurrentPlan`.
- Reduced motion: shimmer deshabilitado completamente.
- El label sigue siendo `"Empezar por USD 39.99/año"`; cuando cambia el plan, el precio dentro del label usa el mismo digit-roll (sub-componente compartido `BillingPriceDigits`).

---

## Cambios en el background

### `AmbientBlobs` tone shift

`AmbientBlobs` ya acepta una prop `tone`. Hoy la pantalla pasa `theme.isDark ? 'calm' : 'aurora'`.

**Nuevo:** la pantalla pasa el tone basado en el plan seleccionado:
- Mensual: `'calm'` (más neutro, menos verde) en ambos themes.
- Anual: `'aurora'` (más verde-vivo, refuerza el "premium") en ambos themes.

La transición entre tones la maneja el propio `AmbientBlobs` (ya tiene cross-fade internal). Si no — y para evitar cambios en ese componente — envolvemos en dos `<AmbientBlobs>` superpuestos con opacity animada usando `withTiming(800ms)`. (Decisión: empezamos por la opción simple de pasar la prop; si la transición es brusca, agregamos el cross-fade local.)

---

## Estado y data flow

Nada cambia en `useBilling()`. El screen lleva el `selectedId` local exactamente como hoy.

```ts
const [selectedId, setSelectedId] = useState<BillingPlanId>(initialId)
const selectedCycle: BillingCycle = selectedId === 'hogar-anual' ? 'yearly' : 'monthly'
const selectedPlan = BILLING_PLANS[selectedId]
```

`CyclePicker` recibe `selected={selectedCycle}` y `onChange` mapea cycle → planId:
```ts
const onCycleChange = (cycle: BillingCycle) => {
  setSelectedId(cycle === 'yearly' ? 'hogar-anual' : 'hogar-mensual')
  void triggerHaptic('selection')
}
```

---

## Accesibilidad

- Todas las animaciones respetan `useReducedMotion()` con snaps instantáneos en lugar de transitions.
- El segmented control declara `tablist` / `tab` roles.
- Cada feature row tiene su texto completo en el accessible label (incluyendo "Solo en Anual" si aplica) para que VoiceOver no oculte el contexto.
- El CTA mantiene su label dinámico ("Empezar por USD 39.99 al año").
- Los digit-rollers tienen `accessibilityLabel="USD 39 con 99 centavos al año"` en el padre — los hijos animados son `accessibilityElementsHidden`.

---

## Performance

- Cada feature row es liviana (View + Icon + Text) — 9–11 elementos por plan, irrelevante.
- El digit-roller mantiene cada columna como una View con altura clipeada (`overflow: 'hidden'`) y una hija que translada. No re-renders por frame — todo en el UI thread via Reanimated.
- El shimmer del CTA es un único `withRepeat` infinito — trivial.
- AmbientBlobs no cambia su carga.

---

## Reduced motion summary

| Elemento | Normal | Reduced motion |
|---|---|---|
| CyclePicker marble | Spring 16/200 | Snap |
| Digit roller | Timing 380ms + stagger 60ms | Snap |
| SavingsRibbon | FadeInLeft + spring | Show/hide instantáneo |
| Feature stagger | FadeInDown delay 35ms × idx | Snap visible |
| CTA shimmer | Loop 700ms cada 4s | Off |
| AmbientBlobs tone | Cross-fade 800ms | Sin cambio (queda en tone inicial) |

---

## Riesgos y tradeoffs

1. **Salto visual al toggleear:** Reentry de feature rows puede sentirse "ruidoso" si se hace mal. Mitigación: stagger de sólo 35ms entre rows y duración corta (200ms). Si en device se ve nervioso, bajamos a un fade-only sin translateY o sólo animamos las features que CAMBIAN entre plans (el resto se queda).
2. **Digit roller en iOS/Android:** El layout de dígitos puede divergir si la fuente del sistema tiene un avance distinto. Mitigación: `fontVariant: ['tabular-nums']` en cada dígito + ancho fijo por columna calculado con `onLayout` de "8" (el más ancho típicamente).
3. **Una sola card vs comparación:** Algunos usuarios "comparan" tiles lado a lado. Mitigación: el savings badge `−33%` está siempre visible en el segmento Anual del picker; el ribbon refuerza el delta cuando se elige anual. Si el bounce de conversión baja, se agrega un mini "vs. mensual" debajo del precio.
4. **Reduced motion vacía la experiencia:** Si el usuario tiene reduced motion, la pantalla pierde mucha personalidad. Eso es consciente y por diseño — la jerarquía visual (tipografía, ribbon, colores) sigue funcionando sin animación.

---

## Testing

**Unit tests (vitest, no React renderer):**
- `digit-roller-math.test.ts` (si extraemos el cálculo de offsets a una pure function).

**Visual / device:**
- Smoke test en iOS y Android del swap Mensual ↔ Anual.
- Smoke test reduced motion ON (Settings → Acessibility → Reduce Motion).
- Smoke test dark mode + light mode.
- Smoke test con el plan activo siendo el Mensual: la card morph debe mostrar "Tu plan activo" sin romper layout.

**No tocar:**
- `use-billing.ts`
- `billing-plans.ts`
- El flujo de purchase/trial (sigue mockeado con Alert).

---

## Out of scope (logica diferida)

El usuario indicó "UI primero, luego la lógica". Quedan explícitamente fuera de este spec, para tratar en un spec posterior:

- Conexión real con RevenueCat / StoreKit / Play Billing.
- Manejo de errores de compra reales (network, billing declined, restore failures).
- Estados de loading visuales más allá del actual `isPurchasing`.
- Gating de features según `activePlanId` en otras pantallas de la app.
- Persistencia del plan elegido en backend (Supabase).
- Webhooks / verificación server-side de recibos.

---

## Files summary

```
NEW:
  mobile/components/billing/billing-cycle-picker.tsx
  mobile/components/billing/billing-price-digits.tsx
  mobile/components/billing/billing-savings-ribbon.tsx
  mobile/components/billing/billing-plan-morph-card.tsx

MODIFIED:
  mobile/screens/settings/billing-screen.tsx
    - Remove: PlanGrid, PlanTile, SelectIndicator, PlanDetail
    - Insert: CyclePicker between CompactHero and morph card
    - Replace: PlanGrid + PlanDetail con BillingPlanMorphCard
    - Improve: PrimaryCTA con shimmer
    - Keep: CompactHero, TrustPills, CompactFaq, FooterMicro

UNCHANGED:
  mobile/features/billing/billing-plans.ts
  mobile/features/billing/use-billing.ts
  app/(app)/settings/plan.tsx
```
