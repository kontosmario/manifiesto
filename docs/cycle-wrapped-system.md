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

Diseñado como una **edición de revista mensual de finanzas personales**, no como un slideshow tipo Spotify Wrapped. La gramática de stories (progress bars + tap-to-advance) se mantiene porque comunica "esto es un momento, no un popup", pero la estética se aleja deliberadamente del cliché dark + neón.

**Frameworks aplicados**: `/impeccable` (color strategy committed, no hero-metric template, no card-on-card), `/emil-design-eng` (ease-out-expo curves, stagger 60ms, scenes 4.5s, asymmetric press), `/ui-ux-pro-max` (touch targets ≥44pt, safe areas, reduced motion).

### Anti-AI-slop checklist
- ❌ Dark mode + neón → ✅ committed cream + forest green (paleta del producto)
- ❌ Hero-metric template (big number + small label + stat grid) → ✅ editorial typography weight-driven, un dominante por escena
- ❌ Card on card → ✅ full-bleed scenes, contenido en el field
- ❌ Genérico confetti spray → ✅ confetti solo en veredicto positivo

### Estructura (5 escenas)
1. **Cover** — paper cream, eyebrow "EDICIÓN {mes}", "Tu mes, en cifras." en display 60pt, rule mark, kicker
2. **El veredicto** — tinte state-driven (verde/peach/neutral), signo + número hero 56pt, copy short, delta pill vs anterior
3. **Donde más se fue** — top categoría, name como display 44pt, amount + share %, barra full-bleed
4. **El gasto que más pesó** — peach band background, description como quote display, amount + fecha long-form
5. **El próximo arranca hoy** — forest deep (statement de marca), monthly income hero, achievements pill si hay, summary row con gastaste + movimientos, CTA primary

### Navegación
- Tap left third = anterior, tap right two-thirds = siguiente / dismiss en última
- Long-press ≥160ms = pausa auto-advance
- Auto-advance 4500ms por escena con progress bar linear top
- X superior derecha = dismiss directo
- Hint adaptativo: "Mantené presionado para pausar" / "En pausa. Soltá para seguir."

### Motion
- Scrim fade 420ms ease-out-expo
- Scene crossfade 360ms con rise +8px → 0
- Progress bar linear 4500ms
- CountUpText en hero numbers (Verdict 1800ms)
- Press feedback `scale(0.97)` en CTA
- Confetti solo en escena 2 si `savingsDelta > 0`
- `useReducedMotion`: no transitions, no auto-advance, CountUp instant, swipe manual

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
