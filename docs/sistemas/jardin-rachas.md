# Sistema de rachas "Mi jardín"

Metáfora de **jardín que crece** sobre el motor de rachas existente. Cada día que
el hogar registra actividad, "planta un brote"; con el tiempo se forma un jardín.
Sin culpa: los días salteados **no marchitan** el jardín, solo no suman.

## Jardín FAMILIAR (2026-07-08, migración `20260708120000`)

La racha es **del hogar**, no del usuario: el gasto o día-marcado de CUALQUIER
miembro planta el brote del día para toda la familia.

- **Fuente de verdad**: `family_streaks` (una fila por familia). `user_streaks`
  queda **congelada** como respaldo (sin escritores) para rollback barato.
- **Día local**: se corta en la tz del DUEÑO (`family_local_timezone`), no en la
  del que registra — determinística para todo el hogar.
- **Escudos**: pozo familiar (cap 2, cadencia semanal sin cambios).
- **Logros `streak_7..90`**: se otorgan a TODOS los miembros no bloqueados al
  cruzar el umbral (trigger sobre `family_streaks`).
- **`streak_marked_days`**: conserva autoría per-usuario; la RLS pasa a
  visibilidad familiar y la derivación une por familia. `mark_no_expense_day`
  valida contra los gastos de TODO el hogar; `unmark` borra solo la marca propia
  y recomputa la racha familiar.
- **`garden_recovered_days`**: unicidad `(family_id, day)`, `user_id` nullable
  (atribución opcional), RLS familiar.
- **Ancla del jardín**: `families.created_at` (antes `profiles.created_at`);
  cliente vía `useFamily().createdAt` con fallback al perfil.
- **Query keys**: `streakQueryKey(familyId)` / `markedDaysQueryKey(familyId)` /
  `gardenRecoveredQueryKey(familyId)` — sin userId (los miembros comparten cache).
- **`gastos_snapshot`**: `streak_row` desde `family_streaks`; marked days del
  hogar con límite 35 (antes 14 per-usuario).
- **Crons** (`broken`/`at_risk`/`recovery_nudge`): iteran `family_streaks` en tz
  familiar y hacen fan-out a todos los miembros (idioma y prefs por miembro).
  `cron_emit_assistant_dormant` dejó de leer `user_streaks`: deriva la
  actividad POR USUARIO de sus gastos ∪ sus marcas (el "dormido" sigue siendo
  del usuario). `family_member_stats` muestra la racha del hogar.
- **Seed**: replay de la actividad familiar completa + clamp generoso con el
  máximo entre miembros (`current`, `longest`, `tokens`, `last_logged`) —
  nadie pierde su racha con el cambio; el efecto unión puede incluso subirla.
- **`recompute_family_streak` preserva `longest_streak`**: es récord de VIDA
  (monotónico); el replay puede reconstruir menos que lo vivido (días
  puenteados por cron sin fila de actividad, clamp del seed), así que el
  recompute (path de unmark) nunca lo degrada. `current_streak` sí es replay
  honesto — desmarcar un día puede bajarla, ese es el punto del unmark.
- **Semana perfecta / floración**: sigue exigiendo 7/7 orgánico — ahora entre
  todos ("cuidar el jardín del hogar").

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
  **antigüedad** del día **y del cierre de la semana**:
  - `pre` (antes del primer registro) · `pending` (hoy sin registrar) ·
    `missed` (día pasado sin registrar, **no rompe**).
  - por EDAD (decisión owner 2026-06-25, antes 14d): `seed` (≤1 día) ·
    `germ` (2–6) · `fern` (≥7 = 1 semana, helecho de marca, 24→32px hasta ~3½ sem).
  - por SEMANA: una semana **perfecta** (los 7 días registrados) hace florecer
    todos sus brotes → `bloom` (flor coral, glyph en `sprout.tsx`), sin importar
    la edad. *La edad lleva hasta arraigado; florecer requiere una semana completa.*
    La grilla (`garden-grid.tsx`) ahora rinde filas por-semana (`flex:1`,
    encabezados L→D) en vez de `flexWrap`+cellSize.
- **`deriveWeekClose`** → score 0–7 (días ORGÁNICOS registrados de la semana L→D) +
  madurez + copy. Confeti solo en 7/7. Un día recuperado por escudo se marca aparte
  (`recovered: true`, brote coral en la celebración) pero NO suma al score: 6 orgánicos
  + 1 recuperado = "gran semana" 6/7, nunca "perfecta".
- **`deriveWeekStrip`** → semana calendario L→D para el widget de Home
  (logged/recovered/pending/missed/future). El recuperado va coral, distinto del missed.

**Recuperación AUTOMÁTICA del hueco (auto-plant por escudo, opción A):** ya NO hay
plantado manual. Cuando faltás exactamente 1 día pero tenés ≥1 escudo, el motor de
rachas consume el escudo SOLO para mantener la racha y, en el mismo paso, inserta el
día en `garden_recovered_days` → el jardín lo muestra como brote `recovered` automático,
sin tap ni 2do escudo. Dos disparadores server-side (migración `20260630030000`):
- `_advance_streak_internal` **Case 3** (`gap = 2` + escudo): al registrar el día
  siguiente, puentea el día faltado (`p_event_date - 1`).
- `cron_emit_streak_broken` (medianoche): si faltó ayer y hay escudo, puentea ayer
  (`v_today_local - 1`) y notifica "Tu escudo salvó la racha".
El recuperado renderiza como brote `recovered` (semilla coral) en grilla, tira de Home
y celebración, y **NO florece** — la floración sigue exigiendo 7/7 ORGÁNICO (los
recuperados no están en `activity`). El RPC manual `recover_garden_day` (`20260625110000`)
queda sin caller (deprecado). El cliente refresca el set recuperado vía
`gardenRecoveredQueryKey`: invalidado en `syncAllAfterMutation` (path de gasto) y
re-fetcheado en mount con `staleTime` corto (path del cron de medianoche).

`mobile/features/garden/use-garden.ts` compone `useStreak` + `useExpenses` +
`useMyProfile` + `garden_recovered_days` y expone `GardenData` (cells, weeksShown,
weekClose, weekCloseAvailable, weekCloseId, weekStrip, ...).

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
