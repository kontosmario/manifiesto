# Plans UI Redesign — Shipped 2026-06-02

Status: ✅ UI shipped 2026-06-02. **13 commits** sobre `main` (spec + plan + 6 implementación + 5 polish + 1 fix). 0 migraciones — esta iteración es solo UI. La lógica de billing (RevenueCat, IAP real, recibo server-side) queda explícitamente diferida para un spec posterior.

> 📖 **Si solo querés saber qué cambió hoy en la pantalla `Settings → Tu plan`:** leé [`Resumen visual`](#resumen-visual) y [`Wording inclusivo`](#wording-inclusivo). Para detalles de implementación, ver [`Componentes nuevos`](#componentes-nuevos).

## Resumen visual

La pantalla pasó de una grilla estática de 2 tiles + checklist a **una sola card cinematográfica que se transforma** entre Mensual y Anual, manejada por un cycle picker arriba. La estructura nueva:

```
Hero (FernLogo full + "TU MANIFIESTO" + reaseguro inclusivo)
↓
CyclePicker (segmented control con marble + −33% badge)
↓
PlanMorphCard (precio digit-roll + savings ribbon + features stagger)
↓
CTA primario: "Probar 14 días gratis" (verde, shimmer)
CTA secundario: "Empezar ahora por USD X" (outlined, digit-roll del precio)
↓
TrustPills + FAQ + FooterMicro (sin cambios)
```

Animaciones únicas que se sumaron:
- **Digit-roll por columna** del precio principal — cada dígito es una columna independiente clipeada con la tira 0–9 trasladándose. Stagger de 60ms por columna.
- **Marble spring** del cycle picker (spring 18/200/0.9).
- **Savings ribbon fly-in** desde la izquierda al elegir Anual; FadeOutLeft al volver a Mensual.
- **Feature stagger** (35ms × índice) al cambiar de plan.
- **CTA shimmer** loop cada 4s con franja diagonal blanca semitransparente. El ancho del barrido ahora se mide en runtime con `onLayout` (fix `9cc7369`), no hardcoded.
- **Ambient tone shift** del `<AmbientBlobs>` entre `calm` (Mensual) y `aurora` (Anual).

Todas respetan `useReducedMotion()` con snap instantáneo. Trigger del shimmer se pausa cuando hay plan activo o compra en curso.

## Wording inclusivo

Por instrucción del owner: "que nadie se sienta excluido, sobre todo la gente soltera sin grupo familiar". Se removió el framing default de "hogar/casa/familia". El plan ahora se posiciona como "para vos, solo o con quien sumes"; el caso *grupo familiar* sigue siendo legítimo pero como caso particular, no como asunción.

| Antes (excluyente) | Después (inclusivo) |
|---|---|
| `Hogar Mensual` / `Hogar Anual` | `Plan Mensual` / `Plan Anual` |
| `El plan más elegido por las familias.` | `El plan más elegido.` |
| `Todos en casa ven los mismos números` | `Una sola fuente de números, contigo y con quien sumes` |
| `Hasta 2 personas en tu hogar` | `Hasta 2 personas en tu plan` |
| `Hasta 4 personas, ideal si suman abuelos o hijos` | `Hasta 4 personas, ideal para tu grupo familiar` |
| Pill hero `PLAN DEL HOGAR` | `TU MANIFIESTO` |
| `Lleven juntos las cuentas de la casa.` | `Tus cuentas en orden. Solo o con quien quieras sumar.` |
| Subtítulo 2 personas `Para ti y una persona más.` | `Para ti solo o con una persona más.` |
| Subtítulo 4 personas `Suma a abuelos o hijos.` | `Ideal para tu grupo familiar.` |
| FAQ `¿Por qué tiene un costo si es para familias?` | `¿Por qué tiene un costo?` |
| FAQ resp. `vender los datos de las familias` | `vender tus datos` |
| FAQ `¿Y si somos más personas que el límite?` | `¿Y si necesito más cuentas?` |

**No tocado:** los IDs internos `'hogar-mensual'` / `'hogar-anual'` quedan como están — son product keys de StoreKit / Play Console, no se ven en UI. Cambiar esos IDs requeriría coordinar con App Store Connect; sin valor real para esta iteración.

## Hero card refresh

Pasó por tres iteraciones:

1. **Estado original** — `iconMode` (leaves-only crop) dentro de un cream-tinted rounded-square badge 52×52.
2. **Logo full + badge fuera** (commit `c876837`) — `iconMode={false}`, size 36→56, padding 14→18, line 14→15pt. La silueta full se renderiza directo sobre el gradiente forest sin marco.
3. **Sin animación de entrada** (commit `226c9c7`) — `animate={false}`. El owner prefirió silueta estática al stem-draw entrance (que sí está disponible en `FernLogo`).

El logo full proviene de `assets/brand/manifiesto-fern-v2-transparent.svg` — silueta cream + dos hojas verde-claro. Con palette `mono-light` las tres capas son cream `#FDFEF9` puro sobre el gradiente verde profundo.

## CTA hierarchy invertida (trial primario)

Estado original: botón verde grande "Empezar por USD X/año" + link diminuto "O prueba 14 días gratis".

Estado actual (commit `eca3d3c`):

```
┌──────────────────────────────────────┐
│  🎁  Probar 14 días gratis    →     │  ← primario verde 56pt + shimmer
└──────────────────────────────────────┘
┌──────────────────────────────────────┐
│       Empezar ahora por USD 39.99/año │  ← secundario cream/outlined 52pt + digit-roll
└──────────────────────────────────────┘
   Sin tarjeta para la prueba. Cancelas cuando quieras.
```

**Por qué:** la trial es el camino de menor fricción para usuarios nuevos (solteros y grupos por igual). Que viva como linkcito y la compra como CTA primario era un anti-pattern de conversión. Ahora la trial recibe la jerarquía visual principal + el shimmer; el pago directo queda accesible como secundario sustancial (52pt, mismo ancho, digit-roll del precio del plan elegido).

Ambos CTAs siguen al `selectedPlan` del cycle picker — la trial activa el plan que está en el momento seleccionado. Funciona idéntico para Mensual y Anual.

## Componentes nuevos

Todos viven en `mobile/components/billing/`. Pure-presentational; no consumen `useBilling`.

| Archivo | Responsabilidad |
|---|---|
| [`digit-roll-math.ts`](../../mobile/components/billing/digit-roll-math.ts) | Pure fn `computeDigitColumns(value, fractionDigits)` que parte un número en arrays de dígitos integer/fraction siguiendo semántica `toFixed`. **7 unit tests** en `tests/unit/digit-roll-math.test.ts` (vitest env node — pattern documentado en memoria `[[feedback-vitest-no-react-renderer]]`). |
| [`billing-price-digits.tsx`](../../mobile/components/billing/billing-price-digits.tsx) | Component animado que renderiza cada dígito en su columna clipeada con tira 0–9 trasladándose. Stagger 60ms via `withDelay`. Snapea cuando `useReducedMotion()`. Mide ancho del glifo `8` con `onLayout` para columnas estables tabular-nums. |
| [`billing-cycle-picker.tsx`](../../mobile/components/billing/billing-cycle-picker.tsx) | Segmented control con marble que se desliza vía `withSpring({damping:18, stiffness:200, mass:0.9})`. Badge fijo `−33%` flotante sobre el segmento Anual. Roles `tablist`/`tab` + haptic `selection`. |
| [`billing-savings-ribbon.tsx`](../../mobile/components/billing/billing-savings-ribbon.tsx) | Pill `FadeInLeft.springify().damping(16)` que entra al elegir Anual con el counter `BillingPriceDigits` embebido para que el monto se "llene" sync con el digit-roll principal. `FadeOutLeft` al salir. |
| [`billing-plan-morph-card.tsx`](../../mobile/components/billing/billing-plan-morph-card.tsx) | Card grande con header + price block + savings ribbon + member cap + features. Cada bloque clave usa `key={`${plan.id}-…`}` para que reentry al cambiar plan dispare `FadeIn`/`FadeInDown`. Features marcadas "annual-only" se renderizan con icono `star` en vez de `check-circle`. |

## Modificado

[`mobile/screens/settings/billing-screen.tsx`](../../mobile/screens/settings/billing-screen.tsx) — orquesta los nuevos componentes. Remueve `PlanGrid`, `PlanTile`, `SelectIndicator`, `PlanDetail`. Mantiene `CompactHero`, `TrustPills`, `CompactFaq`, `FooterMicro` (ahora con copy inclusivo). El `PrimaryCTA` quedó refactorizado con trial primario y compra secundaria.

[`mobile/features/billing/billing-plans.ts`](../../mobile/features/billing/billing-plans.ts) — solo cambios de copy (plan names, taglines, highlights). Estructura, precios, member caps y product IDs sin tocar.

## Sin tocar

- [`mobile/features/billing/use-billing.ts`](../../mobile/features/billing/use-billing.ts) — la lógica de compra/trial sigue mockeada con `Alert`. La conexión real con RevenueCat / StoreKit / Play Billing es scope diferido.
- [`app/(app)/settings/plan.tsx`](../../app/(app)/settings/plan.tsx) — ruta wrapper en `RequireAuth`.
- [`mobile/components/home/ambient-blobs.tsx`](../../mobile/components/home/ambient-blobs.tsx) — solo le cambiamos la prop `tone` desde el screen.

## Commits

```
eca3d3c feat(billing): trial gratis ahora es el CTA primario grande
06e235c copy(billing): wording inclusivo solteros + grupos en Planes
226c9c7 fix(billing): static fern logo in Plans hero, no entrance animation
c876837 feat(billing): hero card uses full fern silhouette, drops boxy frame
9cc7369 fix(billing): shimmer width measured at runtime, not hardcoded
543d2ae feat(billing): compose Plans screen with morph card + cycle picker
452a609 feat(billing): BillingPlanMorphCard — single cinematic plan surface
7c7606c feat(billing): BillingSavingsRibbon — fly-in pill with rolling counter
ebd4007 feat(billing): BillingCyclePicker segmented control with sliding marble
a0baaa8 feat(billing): BillingPriceDigits — animated per-column digit roller
6ff4dc2 feat(billing): pure digit-column splitter for animated price roller
61678f1 docs(billing): implementation plan for one-hero morph-card Plans UI
5a7a8f0 docs(billing): spec — one-hero morph-card Plans UI
```

Spec: [`docs/superpowers/specs/2026-06-02-billing-ui-redesign-design.md`](../superpowers/specs/2026-06-02-billing-ui-redesign-design.md)
Plan: [`docs/superpowers/plans/2026-06-02-billing-ui-redesign.md`](../superpowers/plans/2026-06-02-billing-ui-redesign.md)

## Verificación

- `npm run validate` — typecheck + lint + 392 tests pass / 11 skipped / 0 fail. Guards: legacy-spacing ✓, forbidden-copy ✓, motion-tokens ✓ (4 `@motion-allow:` annotations con razón: 1ms reduced-motion snap, marble spring custom, 700ms shimmer sweep, instant shimmer reset).
- `npx expo export --platform ios --output-dir /tmp/expo-export-billing-check` — bundle 8.57 MB sin errores Metro. Pre-flight pattern de la memoria `[[feedback-validate-is-not-bundle]]` cumplido.
- Smoke device — pendiente que el owner valide en su dispositivo y reporte cualquier polish residual.

## Decisiones consciente que quedan pendientes

1. **Conexión RevenueCat / StoreKit real.** Sigue mockeado vía `Alert`. Esto es el "logic" que el owner difirió explícitamente: "Vamos a enfocarnos en la UI y luego en la logica de los planes". Cuando se atienda, va a necesitar productos creados en App Store Connect (`com.manifiesto.app.subscription.monthly` / `.yearly`), trial offers configurados, y un edge function para verificación server-side de recibos.
2. **Persistencia del plan elegido.** Hoy `useBilling().status.activePlanId` viene de un mock. Cuando se conecte la compra real, hay que persistir en Supabase y exponerlo al resto de la app (gating de features según tier).
3. **Estados de error de compra reales.** `purchasePlan` devuelve `{ ok, reason }` mock. El handler `handleSubscribe` ya tiene los Alerts armados para success/failure — solo falta cablearlo a errores reales (network, billing declined, restore failures, family-sharing, etc.).
4. **Mensajería de cycle picker cuando hay plan activo.** Hoy si el usuario tiene Mensual activo y selecciona Anual, ve el CTA "Probar 14 días gratis" y "Empezar ahora por USD 39.99". El flow de "upgrade del Mensual al Anual" probablemente quiere copy distinto (`"Pasar a Anual y ahorrá USD 19.89"`). Defer hasta tener purchase real.
5. **Trial elegibilidad.** Hoy se asume que cualquiera puede empezar trial. En StoreKit real, el usuario tiene una sola trial por familia de productos — habría que esconder o desactivar el CTA primario cuando el usuario ya consumió su trial. Defer hasta tener el SDK.

Estas 5 quedan documentadas como out-of-scope explícito de este ship — no son bugs, son scope que viene en la fase de logic.
