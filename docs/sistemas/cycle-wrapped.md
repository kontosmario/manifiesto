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

### Estructura (3–5 escenas)

Siempre presentes: Cover + El veredicto + El próximo arranca hoy (mínimo 3).
Las escenas 3 y 4 son condicionales: se incluyen solo si el payload tiene
`topCategory` / `topExpense` respectivamente. En la práctica, cuando
`expenses_count > 0` (condición de disparo) ambas estarán presentes,
resultando en el flujo completo de 5 escenas.

1. **Cover** — paper cream, eyebrow "EDICIÓN {mes}", "Tu mes, en cifras." en display 60pt, rule mark, kicker
2. **El veredicto** — tinte state-driven (verde/peach/neutral), signo + número hero 56pt, copy short, delta pill vs anterior
3. **Donde más se fue** *(si `topCategory` no es null)* — top categoría, name como display 44pt, amount + share %, barra full-bleed
4. **El gasto que más pesó** *(si `topExpense` no es null)* — peach band background, description como quote display, amount + fecha long-form
5. **El próximo arranca hoy** — forest deep (statement de marca), monthly income hero, achievements pill si hay, summary row con gastaste + movimientos, CTA primary

### Navegación
- Tap left third = anterior, tap right two-thirds = siguiente / dismiss en última
- Long-press ≥160ms = pausa auto-advance
- Auto-advance 4500ms por escena con progress bar linear top
- X superior derecha = dismiss directo
- Hint adaptativo: "Mantené presionado para pausar" / "En pausa. Soltá para seguir."
- **Última escena (todos los modos)**: tap zones se ocultan SIEMPRE — el CTA/OptionCards reciben los taps directo, sin que el wrapper los intercepte. El chevron-back del header (visible siempre en última escena) reemplaza la tap zone izquierda para retroceder. Antes el gate dependía de pending decision → en mes neutro las tap zones quedaban activas y se comían el CTA "Empezar el próximo" (commit `7bfec8e`).

### Motion
- Scrim fade 420ms ease-out-expo
- Scene crossfade 360ms con rise +8px → 0
- Progress bar linear 4500ms
- CountUpText en hero numbers (Verdict 1800ms)
- Press feedback `scale(0.97)` en CTA
- Confetti en escena 2 si `savingsDelta > 0` (verdict positivo)
- Confetti extra **post-await** al confirmar decisión Spec B real (`meta` / `acumular` / `reserva`) — NO antes del await (M2 del code review). Skip en flow vanilla "Empezar el próximo" y en past mode (read-only).
- `useReducedMotion`: no transitions, no auto-advance, CountUp instant, swipe manual

## Spec B integration — leftover decision en la closing scene

Ver [`month-close-decision.md`](month-close-decision.md) para el modelo y RPC. Acá: cómo se integra en el wrapped.

El payload extiende con 4 fields opcionales (mutuamente exclusivos entre pending y past):

```ts
pendingLeftoverDecision?: { monthlySummaryId: string; sobrante: number }
activeGoal?: { id: string; title: string; emoji: string } | null
nextCycleAnchor?: string  // YYYY-MM-DD del inicio del nuevo cycle
onApplyLeftoverDecision?: (input: ApplyDecisionInput) => Promise<void>

pastLeftoverDecision?: {
  decision: 'meta' | 'acumular' | 'reserva' | 'skip'
  sobrante: number
  metaGoalTitle?: string | null
  decidedAt: string
}
```

### Modo pending — decisión inline en la closing scene

Cuando viene `pendingLeftoverDecision` + `onApplyLeftoverDecision`:

- La sección "EL PRÓXIMO ARRANCA HOY" (siempre presente) se compacta para hacer lugar a la sección Spec B.
- Sección Spec B: eyebrow "Y TE SOBRARON", amount con pulse animado loop 1→1.015→1 cada 2.5s, subtítulo "¿Qué hacés con esto?", stack de 3 `LeftoverOptionCard`.
- OptionCards (stagger entrance 70ms entre cards, 260ms ease-out-expo):
  - "A una meta" / "Sumar a {goalTitle}" — disabled si no hay `activeGoal`
  - "Sumar al mes actual"
  - "Guardar como reserva"
- Tap selecciona — selected state interpolado (border, bg, glow).
- CTA del footer cambia a "Confirmar y empezar" — disabled hasta que haya selección.
- **Auto-advance**: deshabilitado en la última escena con pending. El timer no arranca; el user tiene que tomar la decisión con el CTA (cerrar solo por timer sacaría la oportunidad).
- Al confirmar: `await onApplyLeftoverDecision(input)` → confetti dispara DESPUÉS del await exitoso → `onDismiss()`.

### Modo past — replay read-only

Cuando viene `pastLeftoverDecision` (y no `pending`):

- Sección Spec B con eyebrow "YA DECIDISTE", amount sin pulse, sin subtítulo "¿qué hacés?".
- Las 3 OptionCards renderean con la elegida marcada (`selected: true`, `readOnly: true`) y las otras inertes.
- Subtítulos contextuales: "Aporte realizado" / "Hecho" / "Guardado" en la opción elegida.
- Hint debajo: "Decidiste el {fecha}".
- CTA vanilla "Empezar el próximo" (no aplica nada — sólo dismiss).
- `skip` no se visualiza como past (no es interesante mostrar "decidiste saltarlo") — fallback a closing scene vanilla.

### Mutua exclusión

`pending` y `past` son mutuamente exclusivos en spec. Si por bug llegan los dos, `past` gana (mostrar read-only es safer que dejar al user re-decidir un mes ya cerrado).

### Replay desde Control v2

La card "vs mes anterior" de Control v2 ofrece "Reproducir cierre" — invoca `triggerCycleWrapped` con el payload del summary apuntado. Si ese cycle ya tiene decisión persistida, el payload incluye `pastLeftoverDecision` → wrapped entra en modo read-only (commit `ec1783c`).

## Bridge re-trigger guard

[`mobile/components/bridges/cycle-wrapped-bridge.tsx`](../../mobile/components/bridges/cycle-wrapped-bridge.tsx). Owner reportó que el wrapped se "reiniciaba" al cerrar con "Empezar el próximo" en mes neutro. Causa indeterminada — algún re-render del home dashboard dispara `triggerCycleWrapped` dos veces dentro de ms. El primer payload se renderea, el user dismisses, y el segundo arrives → `setActive(newPayload)` → modal se re-abre con scenes reset.

Fix pragmático: el bridge rechaza nuevos payloads dentro de `REOPEN_GUARD_MS = 1500` desde el último `onDismiss`. Suficiente para cubrir el doble-fire sin romper el flow legítimo (el replay manual desde Control v2 requiere ≥2 segundos de interacción).

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

- Emitter singleton: [`mobile/lib/cycle-wrapped-emitter.ts`](../../mobile/lib/cycle-wrapped-emitter.ts)
- Modal: [`mobile/components/wrapped/cycle-wrapped-modal.tsx`](../../mobile/components/wrapped/cycle-wrapped-modal.tsx)
- Bridge: [`mobile/components/bridges/cycle-wrapped-bridge.tsx`](../../mobile/components/bridges/cycle-wrapped-bridge.tsx)
- Builder (DB row → payload): [`mobile/features/wrapped/build-wrapped-payload.ts`](../../mobile/features/wrapped/build-wrapped-payload.ts)
- Trigger en flow real: [`mobile/components/home/home-dashboard.tsx`](../../mobile/components/home/home-dashboard.tsx) (`fireWrappedForClosedCycle`)
- Dev preview screen: [`mobile/screens/dev/cycle-wrapped-preview-screen.tsx`](../../mobile/screens/dev/cycle-wrapped-preview-screen.tsx)
- Source SQL del summary: [`supabase/migrations/20260424040000_monthly_rollup.sql`](../../supabase/migrations/20260424040000_monthly_rollup.sql)

## Mejoras candidatas (futuras, no urgentes)

1. **Achievements count real**: hoy se pasa `achievementsEarnedAt: []` al builder porque no tenemos los timestamps en cache al momento del cobro. Reusar `useAchievements(userId)` data y pasar las fechas filtraría correctamente.
2. **Mood-driven copy**: el campo `mood` del rollup (`great`/`good`/`ok`/`tight`/`over`) está disponible. Hoy no se usa — agregar variantes de copy para el hero label.
3. **Daily streak inside cycle**: los `daily_totals` permiten armar un mini-bar-chart de gastos por día. Útil pero alarga el modal — evaluar con users primero.
4. **Compartir wrapped**: snapshot a imagen + share sheet ("mirá cómo cerré mi ciclo"). Solo si owner quiere superficie social.

<!-- ✓ Sincronizado contra código el 2026-06-08 (Spec B integration + bridge guard + tap zones fix) -->
