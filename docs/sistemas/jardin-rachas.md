# Sistema de rachas "Mi jardín"

Metáfora de **jardín que crece** sobre el motor de rachas existente. Cada día que
el usuario registra actividad, "planta un brote"; con el tiempo se forma un jardín.
Sin culpa: los días salteados **no marchitan** el jardín, solo no suman.

> Reemplaza la UI de la "llama" (StreakFlameIcon + StreakSheet) por el jardín.
> El motor de datos NO se reconstruyó — ver [docs canónico de rachas en las migraciones].

## Cómo se planta un brote (automático)

El jardín es de **solo lectura**. El brote se planta solo con **dos señales**, sin
ninguna acción manual:

1. **Registrar un gasto variable o pagar un fijo** → fila en `public.expenses` →
   trigger `trg_expenses_advance_streak` (AFTER INSERT) avanza la racha en el día
   **local** del usuario (`profiles.timezone`).
2. **Marcar un día sin gastos** → `mark_no_expense_day` RPC → fila en
   `streak_marked_days`. Su entrada UI vive en el **calendario de Gastos** (tocás un
   día con 0 gastos → "Marcar día sin gastos").

El jardín deriva su estado de la unión de ambas: `expenses ∪ streak_marked_days`,
en tz local (`isoDay` = `toLocaleDateString('en-CA', { timeZone })`). NO hay botón
de "plantar" manual (sería redundante).

## Derivación (pura, testeable)

`mobile/features/garden/garden-model.ts` (tests en `tests/unit/garden-model.test.ts`):

- **`deriveGardenCells`** → grilla DINÁMICA por semanas calendario L→D
  (`weeksToShow`: crece desde la semana del primer registro hasta un tope de 5;
  cuenta nueva = 1 semana, no 5 vacías). El estado del brote depende de la
  **antigüedad** del día:
  - `pre` (antes del primer registro) · `pending` (hoy sin registrar) ·
    `missed` (día pasado sin registrar, **no rompe**) ·
    `seed` (registrado, ≤6 días) · `germ` (7–13) · `fern` (≥14, helecho de marca, 24→32px).
- **`deriveWeekClose`** → score 0–7 (días registrados de la semana L→D) + madurez +
  copy. Confeti solo en 7/7.
- **`deriveWeekStrip`** → semana calendario L→D para el widget de Home
  (logged/pending/missed/future).

`mobile/features/garden/use-garden.ts` compone `useStreak` + `useExpenses` +
`useMyProfile` y expone `GardenData` (cells, weeksShown, weekClose,
weekCloseAvailable, weekCloseId, weekStrip, ...).

**Anclaje (`gardenFirstActivity`):** el jardín arranca con tu primer brote DESDE que
creaste la cuenta (`profiles.created_at`). Back-datear un gasto anterior a tu cuenta
NO extiende el jardín hacia atrás (evita semanas de "salteados" falsos); back-datear
DENTRO de tu período sí llena el brote de ese día. Días previos a tu inicio = tenues
(`pre`), nunca "salteados".

> **Nota 14 vs 35 días:** `markedDaysIso` (días sin-gasto) está limitado a 14 por el
> query de `useStreak`. Los días sin-gasto más viejos que 14 no aparecen en la grilla
> (los días con gasto real sí, vienen completos de `expenses`). Si en QA aparece un
> hueco viejo incorrecto, ampliar el `LIMIT` de `fetchMarkedDays` a 35.

## Las 4 vistas

1. **Pantalla "Mi jardín"** (`mobile/screens/garden/garden-screen.tsx`, ruta
   `/(app)/garden`, accesible desde el header de **Gastos** vía `GardenLeafIcon`):
   hero "Racha activa" (gradiente `heroGradient` + luciérnagas crema/menta + helecho
   watermark + stats integradas) · banner de cierre de semana · grilla 7×5 · footnote.
   Entrada fade-only (no pelea con el slide de navegación).
2. **Widget de Home** (`mobile/components/home/streak-week-widget.tsx`): tira semanal
   L-M-M-J-V-S-D + número de racha; tocarlo abre Mi jardín. Montado en `home-dashboard`.
3. **Floración** (`mobile/components/garden/floracion-view.tsx`): celebración de hito
   verde full-screen (luciérnagas + helecho con glow + flores coral). **Reemplaza** al
   viejo `AchievementUnlockModal` en `AchievementUnlockBridge` (mismo prop
   `{item, onDismiss}`; realtime + preview dev intactos). Intensidad por tier vía
   `floracionToneForTier` (`garden-tier.ts`). La galería de logros se re-skineó
   (emoji en bubble crema).
4. **Cierre de semana** (`mobile/components/garden/week-close-celebration.tsx`):
   recap de la semana que CERRÓ (L-D anterior). Takeover verde con los 7 brotes que
   crecen escalonados (growIn) según el score; 7/7 = helechos con flor coral + confeti.
   Se auto-dispara el lunes (primera apertura de la semana nueva) vía
   `WeekCloseBridge` (una vez por semana, flag en AsyncStorage por usuario, todas las
   semanas), y también tocando el banner de Mi jardín (`weekCloseAvailable` lo oculta
   hasta tener una semana cerrada dentro del tracking).

## Componentes reusados

`CardParticles` (luciérnagas) · `FernMark`/`FernLogo` (helecho de marca;
`FILLS.cream.leaves` = `#A9D57F` = color brote) · `CountUpText` (racha) ·
`AuroraBloom` (glow) · `ConfettiBurst` · el patrón de la card de planes
(`plan-tiles` YearlyTile) para el hero.

## Tokens

`gardenSoil` / `gardenSoilFern` / `gardenSkipped` (light + dark) en `palette.ts`. Las
cards no-hero usan `surfaceMuted` en dark (igual que la card del calendario de Gastos),
**no** `creamCard`. La celebración va siempre sobre `#163A1E` (paleta fija).

## Estado / decisiones (resueltas 2026-06-23)

- **"Sin culpa" backend:** APLICADO a prod (migración `20260623160000`). El
  recordatorio del atardecer se reformuló a la metáfora del jardín (sin deadline ni
  "se corta", severity `info`) y el aviso "La racha se cortó" se eliminó. El estado
  (`current_streak=0` = pausa del contador) y la notificación positiva del escudo
  quedan. NO toca `advance_streak` ni la programación de los crons.
- **Calendario dinámico:** la grilla crece desde la semana del primer registro
  (`weeksToShow`, tope 5), no 5 semanas fijas.
- **Cierre de semana:** lunes a domingo; recapitula la semana que cerró; auto-dispara
  el lunes (`WeekCloseBridge`) para todas las semanas + accesible por el banner.
