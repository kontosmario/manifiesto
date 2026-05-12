# Manifiesto Wrapped — comportamiento real

> Estado: vivo en prod desde 2026-05-12. Recap post-cobro del ciclo cerrado.

## Trigger

Cuando el usuario confirma su cobro en la `SalaryConfirmationSheet` (no en el onboarding) y el ciclo recién cerrado tuvo al menos un gasto, dispara automáticamente un modal full-screen con el recap del ciclo.

```
SalaryConfirmationSheet ──► onConfirm(amount | null) ──► upsert family_finance
                                                              │
                                          DB trigger          ▼
                            trg_family_finance_salary_confirm ──► try_close_previous_cycle ──► UPSERT monthly_summaries
                                                                                                       │
                       Mobile espera 700ms ──► refetchQueries(controlIntelligenceQueryKey) ◄───────────┘
                                                              │
                                                              ▼
                       summaries[0].expenses_count > 0  ──► triggerCycleWrapped(payload) ──► CycleWrappedBridge ──► CycleWrappedModal
```

## Arquitectura

```
DB (monthly_summaries) ──► Cache (controlIntelligenceQueryKey) ──► Emitter (singleton) ──► Bridge (mounted en AppStackShell) ──► Modal
```

Mismo pattern de plumbing que `AchievementUnlockBridge` — un Set de listeners al que el Bridge se subscribe + el path de prod escribe directamente en él. El dev preview usa el mismo punto de entrada para inyectar payloads sintéticos.

## Datos del recap

Cada row de `monthly_summaries` ya contiene todo lo necesario (no agregamos nuevas columnas para el Wrapped):

| Campo SQL | Mostrado como |
|---|---|
| `period_label` | Header ("Abril 2026") |
| `period_start` / `period_end` | Rango display ("15 mar – 14 abr") solo si el ciclo no es calendario |
| `savings_delta` | Hero stat — verde si >0, peach si <0, neutral si =0 |
| `total_spent`, `monthly_income` | Stat strip "Gastaste $X de $Y ingresados" |
| `expenses_count` | Stat strip "12 movimientos" |
| `delta_vs_previous_percent` | Stat strip "Vs ciclo anterior — -8% menos" |
| `category_breakdown` | Top categoría con share bar |
| `top_expense` | Card "El gasto más grande" |
| `mood` | (no usado en v1, reservado para copy variante futura) |

Achievements ganados en el rango del ciclo se cuentan desde `achievements_earned.earned_at`. Hoy se pasa array vacío al builder (los logros tampoco se filtran por rango en prod) — pendiente refinar si se quiere mostrar count real.

## Tono y UX

- **Restrained**, no IG-Stories. Vertical scrollable, no tap-to-advance. Matches el tono utilitario del resto de la app.
- **Confetti solo cuando ahorraste** (`savingsDelta > 0`). Excederte se reporta como dato, sin shame.
- **CTA único**: "Empezar el próximo" → dismiss. No invade el flow del próximo ciclo.
- Auto-haptic `success` al aparecer. No auto-dismiss — el usuario quiere leer.

## Gates

| Condición | Decisión |
|---|---|
| `isOnboardingFlow` (primer cobro, `current_cycle_anchor` era null) | ⛔ NO dispara — no hay ciclo cerrado todavía |
| `summaries[0]` no existe (cache no se hidrató después del refetch) | ⛔ NO dispara — fallback silencioso |
| `summaries[0].expenses_count === 0` | ⛔ NO dispara — ciclo vacío, sin historia |
| Todas las anteriores OK | ✅ Dispara con el payload derivado |

## Dev preview

`Settings → Desarrollo → Preview · Cierre de ciclo` (solo `__DEV__`). 3 presets sintéticos:

- **Cerraste con margen** — ahorraste 28% · positivo · confetti
- **Cerraste empatado** — gastaste exactamente el ingreso · neutral
- **Cerraste excedido** — te excediste 12% · peach · sin confetti

El path es idéntico al de prod: `triggerCycleWrapped(payload)` → mismo Bridge → mismo Modal. Imposible distinguir el origen desde el render.

## Archivos relevantes

- Emitter singleton: [`mobile/lib/cycle-wrapped-emitter.ts`](../mobile/lib/cycle-wrapped-emitter.ts)
- Modal: [`mobile/components/wrapped/cycle-wrapped-modal.tsx`](../mobile/components/wrapped/cycle-wrapped-modal.tsx)
- Bridge: [`mobile/components/bridges/cycle-wrapped-bridge.tsx`](../mobile/components/bridges/cycle-wrapped-bridge.tsx)
- Builder (DB row → payload): [`mobile/features/wrapped/build-wrapped-payload.ts`](../mobile/features/wrapped/build-wrapped-payload.ts)
- Trigger en flow real: [`mobile/components/home/home-dashboard.tsx`](../mobile/components/home/home-dashboard.tsx) (`fireWrappedForClosedCycle`)
- Dev preview screen: [`mobile/screens/dev/cycle-wrapped-preview-screen.tsx`](../mobile/screens/dev/cycle-wrapped-preview-screen.tsx)
- Source SQL del summary: [`supabase/migrations/20260424040000_monthly_rollup.sql`](../supabase/migrations/20260424040000_monthly_rollup.sql)

## Mejoras candidatas (futuras, no urgentes)

1. **Achievements count real**: hoy se pasa `achievementsEarnedAt: []` al builder porque no tenemos los timestamps en cache al momento del cobro. Reusar `useAchievements(userId)` data y pasar las fechas filtraría correctamente.
2. **Mood-driven copy**: el campo `mood` del rollup (`great`/`good`/`ok`/`tight`/`over`) está disponible. Hoy no se usa — agregar variantes de copy para el hero label.
3. **Daily streak inside cycle**: los `daily_totals` permiten armar un mini-bar-chart de gastos por día. Útil pero alarga el modal — evaluar con users primero.
4. **Compartir wrapped**: snapshot a imagen + share sheet ("mirá cómo cerré mi ciclo"). Solo si owner quiere superficie social.
