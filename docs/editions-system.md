# Ediciones — archivo de Manifiesto Wrappeds

> Estado: vivo en prod desde 2026-05-12. El archivo persistente del Wrapped post-cobro.

## Por qué existe

El Wrapped post-cobro es un momento que se ve UNA vez y desaparece. Las **Ediciones** convierten ese momento en una **colección** que el usuario acumula. Cada ciclo cerrado queda como una edición persistente que se puede revisitar.

Estratégicamente: amortiza la inversión en el Wrapped multiplicándola por 12 (un año de ediciones) sin pedir más data ni infra. Cada mes el usuario tiene un motivo para volver al archivo.

## Flow

```
Settings → Tu progreso → Ediciones → EditionsScreen
                                            │
                                  useMonthlyEditions(familyId)
                                            │
            ┌───────────────────────────────┴───────────────────────────────┐
            ▼                                                               ▼
  Lee del cache de control-intelligence                          Si no hay cache:
  (poblado por home_snapshot + cobro flow)                       fetch monthly_summaries (12 ciclos)
            │                                                               │
            └───────────────────────────────┬───────────────────────────────┘
                                            ▼
                          Filtra ciclos con expenses_count > 0
                                            ▼
                                    Lista en EditionsScreen
                                            │
                          Tap row → triggerCycleWrapped(payload)
                                            │
                          CycleWrappedBridge → CycleWrappedModal (reusa todo)
```

## Estructura visual

Aplicados `/impeccable` (color committed, no card-grid, no hero-metric template), `/emil-design-eng` (press scale, stagger, ease-out-expo), `/ui-ux-pro-max` (touch targets, tabular nums, contrast AA).

### Masthead (hero block)

- Eyebrow "TU MANIFIESTO HASTA HOY"
- `CountUpText` 36pt con total ahorrado YTD (solo savings positivos suman, los excesos individuales siguen visibles per-row)
- Rule mark verde + caption "en N ediciones cerradas"

Es un **masthead editorial** estilo título de revista, no el hero-metric SaaS template (big-number + small-label + stat grid). El total no es la métrica principal, es contexto.

### Row list

Una row por edición:

- **Tier dot** (8pt) izquierda: verde / gris / peach según margen / empatado / excedido. Es el at-a-glance scanner.
- **Body** central: month label como display 15pt + meta row (period range si no es calendario + count de movimientos)
- **Amount block** derecha: sign + abs value en 16pt 900 weight, label "MARGEN" / "EMPATADO" / "EXCEDIDO" en 9pt eyebrow
- **Chevron** indica navegación

Press feedback `usePressScale(0.97)`, stagger `Math.min(80 + idx * 40, 480)` ms.

### Empty state

`EmptyState` primitive con icono `auto-stories`, copy "Tu primera edición está en camino" + "Cuando confirmes tu próximo cobro, este archivo se va a empezar a llenar."

## Datos

`useMonthlyEditions(familyId)`:

- Lee del cache `controlIntelligenceQueryKey` si está poblado (home_snapshot lo siembra en cold start). Evita fetch extra.
- Si no, fetcheia hasta 12 ciclos de `monthly_summaries` (vs 6 del control intelligence).
- Filtra `expenses_count === 0` (ciclos vacíos no son "ediciones").
- `staleTime: 5 min` + invalidation natural cuando el Wrapped flow refetchea controlIntelligenceQueryKey.

## Tap → reusa Wrapped

```ts
triggerCycleWrapped(
  buildWrappedPayloadFromSummary({ summary, categoryNameById, achievementsEarnedAt: [] })
)
```

El `buildWrappedPayloadFromSummary` ya existe (compartido con el flow post-cobro). El emitter singleton dispara el mismo modal que el flow real, indistinguible visualmente.

## Archivos relevantes

- Hook: [`mobile/features/wrapped/use-monthly-editions.ts`](../mobile/features/wrapped/use-monthly-editions.ts)
- Screen: [`mobile/screens/settings/editions-screen.tsx`](../mobile/screens/settings/editions-screen.tsx)
- Route: [`app/(app)/settings/editions.tsx`](../app/\(app\)/settings/editions.tsx)
- Settings entry: `Settings → Tu progreso → Ediciones` ([settings-screen.tsx](../mobile/screens/settings/settings-screen.tsx))
- Builder reusado: [`mobile/features/wrapped/build-wrapped-payload.ts`](../mobile/features/wrapped/build-wrapped-payload.ts)
- Modal reusado: [`mobile/components/wrapped/cycle-wrapped-modal.tsx`](../mobile/components/wrapped/cycle-wrapped-modal.tsx)

## Próximas mejoras (queued)

1. **Pull-to-refresh** en la lista para forzar refetch.
2. **YTD breakdown**: hoy el masthead solo muestra savings total. Podría agregar "X meses con margen, Y empatados, Z excedidos" como pill.
3. **Year separators**: cuando el archivo tenga 12+ ediciones, agrupar por año.
4. **Export edición**: snapshot a imagen + share sheet. Solo si owner quiere superficie social.
