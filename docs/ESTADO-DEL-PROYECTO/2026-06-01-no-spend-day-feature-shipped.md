# Feature: "Día sin gasto" — Shipped 2026-06-01 (con polish 06-02)

Status: ✅ Feature core (F1+F2+F3) shipped 2026-06-01. Polish posterior shipped 2026-06-02 (cache invalidation fix, ModalCard sheet con expenses listing, FAB menu UI iteration, proyección robusta del Vs Mes card). **20 commits** sobre `main` desde el inicio del feature. 3 migraciones deployed a prod.

> 📖 **Si solo querés saber qué hay en prod hoy**, leé las secciones [`Lo que se shippeó`](#lo-que-se-shippe) (core feature) y [`Post-ship polish`](#post-ship-polish-2026-06-02) (refinements). El bloque [`Diagnosis kontosmario@gmail.com`](#diagnosis-kontosmariogmailcom-2026-06-02) documenta una sesión de troubleshooting que terminó arreglando el algoritmo de proyección.

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

---

## Post-ship polish (2026-06-02)

Después de probar el feature en device, el owner identificó 3 issues que se cerraron en commits adicionales:

### 1. Cache invalidation fix (commit `3a609f9`)

**Síntoma:** marcar/revertir desde el FAB o el calendar NO actualizaba la UI del calendario (leaf-dot) ni el stat del Control hero hasta reload de la app.

**Root cause:** F3.T5 cambió la fuente del calendar a `snapshot.no_spend_days_this_cycle`, pero las mutations `useMarkNoExpenseDay` / `useUnmarkNoExpenseDay` solo invalidaban `streakQueryKey` + `markedDaysQueryKey` — NO `homeSnapshotQueryKey`. El campo se quedaba stale.

**Fix:** ambas mutations ahora invalidan también `homeSnapshotQueryKey(userId)` en `onSuccess`. Todo el tree (FAB petal, calendar dots, Control hero stat) refetches en un pass y converge.

### 2. ModalCard sheet con expenses listing (commit `3a609f9`)

**Síntoma:** el prompt "Hoy ya tenés gastos cargados" era un `Alert.alert` genérico de React Native. No alineado con el proyecto (ModalCard pattern) y no mostraba qué gastos eran.

**Fix:** nuevo componente `NoSpendConfirmSheet` sobre `ModalCard` (bottom-sheet con drag-to-dismiss). Muestra:
- Summary card con total + count del día
- Lista scrolleable de cada gasto (dot de color de categoría, descripción, categoría, monto)
- Tip card explicando cómo revertir si fue equivocación
- Footer: "Marcar igual" (primary con loading state) + "Cancelar" (ghost)

### 3. Bonus bug fix: `force: true` no se pasaba al confirm (commit `3a609f9`)

**Síntoma latente:** cuando el user tapeaba "Marcar igual" en el Alert previo, el RPC fallaba con `EXPENSES_EXIST_ON_DATE` porque el `doMark()` llamaba `mutate(undefined, ...)` sin force.

**Fix:** `doMark()` acepta `{ force?: boolean }`. El sheet's onConfirm pasa `{ force: true }`. El clean-mark path (no expenses today) sigue sin force.

### 4. FAB menu wider + semantic accent rings (commit `c3546f7`)

**Síntoma:** 4 petals en arco 90° con radius 130 = adjacent centers ~67px → labels (96px) se montaban. Visualmente colapsado.

**Fix:**
- Arc 90° → 120° (angles `[150,110,70,30]`, 40° spacing)
- Radius 130 → 170 (adjacent centers ~116px, 6px breathing room para labels)
- LABEL_WIDTH 96 → 110 (room para "Día sin gasto")
- Nueva prop opcional `QuickAction.accentColor` → 3px ring colored segun rol:
  - 🌱 Día sin gasto: `#7DD18D` verde celebración
  - 💸 Ingreso: `#5B9DF9` azul info
  - 📅 Gasto fijo: `#A0A4A8` gris neutral
  - + Gasto: SIN ring (primary action stays chromatically minimal)

## Diagnosis kontosmario@gmail.com (2026-06-02)

El owner reportó que el "Vs mes" card mostraba "$8.0M, $5.3M más que en Abril" y se sentía alto. Se hizo inspección directa a la DB (autorizada explícitamente).

**Findings:**
- Math del card: correcta end-to-end ($2,710,238 Abril + $3,339,400 variable este ciclo / 13 closed days × 31 = $7,963,179 ≈ "$8.0M" ✓)
- Data en DB: limpia. Los 9 expenses con scope='fixed_expense' son commitment payments legítimos (linkeados con `commitment_id` a `fixed_expenses`). El filtro `!commitment_id` del adapter los excluye correctamente.
- **Root cause de la sensación "alto":** 2 outliers reales en el ciclo (23-may $865k + 25-may $885k, ambos "Varios" / "Otros") inflaban el promedio diario.

### Fix: Proyección robusta (commit `060398b`)

**Nuevo módulo:** [`mobile/features/insights/robust-daily-average.ts`](../../mobile/features/insights/robust-daily-average.ts)

Algoritmo:
1. Si N < 5 closed days → fallback a plain mean (no hay suficiente data para mediana confiable).
2. Compute median de daily totals.
3. Threshold = `max(median × 3, $50,000)` (floor absoluto para evitar false positives cuando median es tiny).
4. Días > threshold → outliers (excluidos del mean).
5. `typicalAverage = mean de days no-outlier`.

**Resultado para kontosmario:**

| Métrica | Antes | Ahora |
|---------|-------|-------|
| Promedio diario | $256,877 (mean over 13 días) | $144,414 (mean over 11 non-outlier days) |
| Proyección | $7,963,179 → "$8.0M" | $4,476,834 → "$4.5M" |
| Diff vs Abril | "$5.3M más" | "$1.8M más" |
| UI nuevo | — | Chip "Días atípicos fuera del ritmo típico: 2 (suman $1.8M)" |

**UI** (`control-v2-vsmes-card.tsx`):
- Nuevo chip transparente al pie del recap section
- Solo aparece si `outlierDaysExcluded > 0`
- Texto: "Días atípicos fuera del ritmo típico: N (suman $X). La proyección los excluye para no inflar el cierre."

**Tests:** [`tests/unit/robust-daily-average.test.ts`](../../tests/unit/robust-daily-average.test.ts) — 7 vectors (empty, N<5 fallback, real kontosmario scenario, flat distribution, $50k floor, all-equal, boundary).

## Updated files map (post-polish)

Archivos modificados/creados POST-shipped del feature core:

```
mobile/features/streaks/use-streak.ts                        MOD (cache invalidation: + homeSnapshotQueryKey)
mobile/components/gastos/no-spend-confirm-sheet.tsx          NEW (ModalCard sheet con expenses listing)
mobile/components/navigation/add-expense-tab-button.tsx      MOD (sheet wired, doMark accepts force)
mobile/components/navigation/add-quick-actions-overlay.tsx   MOD (wider fan + accentColor prop)
mobile/features/insights/robust-daily-average.ts             NEW (outlier detection algorithm)
mobile/features/insights/control-v2-mock.ts                  MOD (use robust avg + expose outlier fields)
mobile/components/control-v2/control-v2-vsmes-card.tsx       MOD (chip "Días atípicos" en recap)
mobile/screens/home/control-v2-screen.tsx                    MOD (thread outlierDaysExcluded/Total props)
tests/unit/robust-daily-average.test.ts                      NEW (7 vectors)
```

## Commits totales (2026-06-01 → 2026-06-02)

Core feature (16):
- `00252b7`, `d547252`, `09c1fc3`, `949b9d6`, `755353f`, `a83b98f` (F1)
- `1c760e1`, `95cfe62`, `8b34e6e`, `30a6f95` (F2)
- `082dfa9`, `ca8f494`, `ca8a71f`, `a629fd9`, `f4ac9cf` (F3)
- `6734168` (closeout doc)

Post-ship polish (4):
- `3a609f9` (cache invalidation + sheet + force bug)
- `c3546f7` (FAB menu UI iteration)
- `060398b` (robust projection)
- (este commit) — doc update

