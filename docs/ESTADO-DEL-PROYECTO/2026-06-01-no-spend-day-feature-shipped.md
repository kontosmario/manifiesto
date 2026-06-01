# Feature: "Día sin gasto" — Shipped 2026-06-01

Status: ✅ Las 3 fases mergeadas y deployadas a prod. 16 commits totales sobre `main` (incluyendo planes + summary). 3 migraciones aplicadas. `npx expo export --platform ios` verde en cada checkpoint.

## Lo que se shippeó

### Phase 1 — FAB petal real + confetti (6 commits)

| Commit | Cambio |
|--------|--------|
| `00252b7` + `d547252` | `mobile/lib/confetti-bus.ts` — pub/sub bus (con snapshot fix anti race-during-iterate) |
| `09c1fc3` | Dep `react-native-confetti-cannon@1.5.2` pinned + bundle pre-flight verified |
| `949b9d6` | `<NoSpendConfettiHost>` montado en `app-stack-shell.tsx` |
| `755353f` | Refactor del FAB petal (commit d7d7db1) → llama `useMarkNoExpenseDay()` real. State machine extraída a `decideNoSpendPetal()` pure fn + 8 unit tests |
| `a83b98f` | Petal con tint paler (alpha 0.45 light / 0.55 dark) cuando está marked |

### Phase 2 — Past-date marking via calendar (4 commits + 1 migration)

| Commit | Cambio |
|--------|--------|
| `1c760e1` | Migration `20260601005000` — RPCs `mark/unmark_no_expense_day` aceptan `p_date` + `p_force`. Validation server-side: future-date reject, past-with-expenses reject, today-with-expenses requiere force |
| `95cfe62` | Hooks mobile aceptan `{ date?, force? }` con backwards-compat para `undefined` |
| `8b34e6e` | `FocusMode` del calendario expone botones "Marcar día sin gastos" / "Revertir marca" mutuamente exclusivos. Bonus correctness fix: usa `getFullYear/Month/Date` en lugar de `toISOString().slice(0,10)` para evitar UTC shift |
| `30a6f95` | `gastos-v2-screen` wirea callbacks con confetti + haptic + toast. Errors RPC mapeados a copy es-AR |

### Phase 3 — Achievements + home metric (5 commits + 2 migrations)

| Commit | Cambio |
|--------|--------|
| `082dfa9` | Migration `20260601006000` — 4 catalog rows (3 per-ciclo + 1 lifetime) + helper `user_current_cycle_start()` + trigger after-insert sobre `streak_marked_days` |
| `ca8f494` | Migration `20260601007000` — `home_snapshot()` devuelve `no_spend_days_count_cycle` + `no_spend_days_this_cycle`. Body copiado verbatim + 2 keys agregadas |
| `ca8a71f` | `HomeSnapshotPayload` interface exposes los 2 fields (optional para backwards-compat cross-deploy) |
| `a629fd9` | Control hero stat "🌱 N sin gastos" condicional (solo si count > 0). Tap-to-streak-sheet deferred |
| `f4ac9cf` | `DayCell` del calendario pinta 8px leaf SVG en días marcados. Source switcheada de F2 placeholder (last 14) a F3 cycle-scoped |

## Achievements catalog agregados

| code | title | tier | trigger |
|------|-------|------|---------|
| `no_spend_cycle_3` | Tres veces sin gasto | bronze | 3 marcas en ciclo actual |
| `no_spend_cycle_7` | Semana templada | silver | 7 marcas en ciclo actual |
| `no_spend_cycle_15` | Mitad de ciclo zen | gold | 15 marcas en ciclo actual |
| `no_spend_lifetime_50` | Ahorrador veterano | legendary | 50 marcas lifetime |

Trigger es idempotente (vía `award_achievement` que usa `on conflict do nothing`). Errores en el trigger nunca bloquean el insert del marked-day.

## Deploy status (prod Supabase)

| Migración | Estado |
|-----------|--------|
| `20260601005000_mark_no_expense_day_with_date.sql` | ✅ deployed (F2.T5) |
| `20260601006000_no_spend_achievements.sql` | ✅ deployed (F3.T6) |
| `20260601007000_home_snapshot_no_spend_days.sql` | ✅ deployed (F3.T6) |

Edge functions: ninguna nueva en esta feature (las RPC existentes + triggers son suficientes).

## Verificación end-to-end

- `npm run validate`: 378 tests pass, 0 motion regressions (chequeado en cada fase + final)
- `npx expo export --platform ios`: 5.59MB hbc, 0 Node-stdlib leaks (chequeado en cada fase + final). **Lesson aprendida del pbkdf2 incident aplicada.**
- Migration deploys: dry-run + apply verificados, NOTICE expected (drop-if-exists trigger en primera creación)
- Push: `kontosmario/manifiesto` main al día (último: `f4ac9cf`)

## Smoke test sugerido para el owner

### F1 — FAB petal
1. Long-press FAB → 4 petals (no-spend / income / fijo / gasto).
2. Tap "Día sin gasto" sin gastos hoy → confetti 2s + haptic + toast "Día sin gastos registrado".
3. Re-abrir FAB → petal dice "Marcado ✓" con tinte verde claro.
4. Tap "Marcado ✓" → toast "Marca removida", haptic selection, sin confetti.
5. Cargar un gasto + tap "Día sin gasto" → Alert "Hoy tenés gastos cargados".

### F2 — Calendar past-date
6. Gastos → tap un día PASADO vacío → day-detail muestra "Marcar día sin gastos" (botón con hoja).
7. Tap → confetti + haptic + toast.
8. Re-abrir ese día → "Revertir marca de sin gastos".
9. Tap día PASADO con gastos → solo aparece "Registrar gasto olvidado" (no mark).
10. Tap día FUTURO → solo "Registrar gasto olvidado".

### F3 — Achievements + visibility
11. Marcar 3 días en el ciclo actual → al 3er mark, achievement "Tres veces sin gasto" se desbloquea (modal celebratorio aparece via `useAchievementUnlocks`).
12. Control screen → si N > 0 marks, stat "🌱 N sin gastos" aparece en el hero footer.
13. Calendar → días marcados muestran un pequeño leaf verde (8px) debajo del day number.
14. Marcar más días → achievements `_7`, `_15`, `_lifetime_50` se desbloquean en sus thresholds.

## Cosas que NO se hicieron (out of spec, deferred)

- Tap-to-streak-sheet desde el Control hero stat: `<FooterStat>` quedó no-clickable. Requiere thread de callback prop o restructuring del footer row + mount del sheet en Control screen (hoy solo está en gastos-v2). Backlog.
- Sharing / social del achievement unlock: no estaba en spec.
- Backfill manual de marked-days pre-existentes para emitir achievements retroactivos: documented in plan F3.T6.2 como OPTIONAL. NO ejecutado.
- "Cerrar mi semana" screen dedicada: rejected during brainstorming (Q3 elegimos calendar day-detail).
- Auto-revert toast surfacing cuando el trigger backend remueve un mark por inserción de gasto: el auto-revert ya está en prod (migration `20260427160000`) pero un toast frontend "Marca removida automáticamente" no se implementó. Backlog si UX lo necesita.

## Files map (mobile)

```
mobile/lib/confetti-bus.ts                                  NEW
mobile/components/ui/no-spend-confetti-host.tsx             NEW
mobile/components/navigation/add-quick-actions-overlay.tsx  MOD (visualState prop)
mobile/components/navigation/add-expense-tab-button.tsx     MOD (FAB handler + state machine)
mobile/components/navigation/add-expense-tab-button-no-spend-decision.ts   NEW (pure fn for tests)
tests/unit/no-spend-petal-state.test.ts                     NEW (8 vectors)
mobile/components/root/app-stack-shell.tsx                  MOD (mount NoSpendConfettiHost)
mobile/features/streaks/use-streak.ts                       MOD ({date?, force?} input + markedDaysIso field)
mobile/components/gastos/gastos-month-calendar.tsx          MOD (mark/unmark FocusMode buttons + DayCell leaf)
mobile/screens/home/gastos-v2-screen.tsx                    MOD (wire mutations + use snapshot cycle dates)
mobile/screens/dev/achievements-streak-preview-screen.tsx   MOD (StreakData literal fix)
mobile/features/home/use-home-snapshot.ts                   MOD (2 new HomeSnapshotPayload fields)
mobile/components/control-hero-preview/control-hero-states.ts          MOD (noSpendDaysCount field)
mobile/components/control-hero-preview/control-hero-a-titular.tsx      MOD (4th FooterStat)
mobile/components/control-v2/control-v2-hero.tsx            MOD (adapter prop)
mobile/screens/home/control-v2-screen.tsx                   MOD (feed snapshot into hero)
```

## Plans referencia

- Spec: [`docs/superpowers/specs/2026-06-01-no-spend-day-feature-design.md`](../superpowers/specs/2026-06-01-no-spend-day-feature-design.md)
- F1 plan: [`docs/superpowers/plans/2026-06-01-no-spend-day-f1-fab-petal-real.md`](../superpowers/plans/2026-06-01-no-spend-day-f1-fab-petal-real.md)
- F2 plan: [`docs/superpowers/plans/2026-06-01-no-spend-day-f2-past-date-calendar.md`](../superpowers/plans/2026-06-01-no-spend-day-f2-past-date-calendar.md)
- F3 plan: [`docs/superpowers/plans/2026-06-01-no-spend-day-f3-achievements-home-metric.md`](../superpowers/plans/2026-06-01-no-spend-day-f3-achievements-home-metric.md)
