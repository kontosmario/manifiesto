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

## Crecimiento del brote — modelo en HORAS (rediseño 2026-08)

`mobile/features/garden/crecimiento-model.ts` (tests en `tests/unit/crecimiento-model.test.ts`).
El brote crece con el reloj, y **registrar adelanta horas**:

```
H(d) = 24 × ageDays(d) + horaLocal + adelanto(d)
etapas: seed  H < 48   ·   germ  48 ≤ H < 168   ·   fern  H ≥ 168
```

Los umbrales caen sobre múltiplos exactos de 24, así que **con `adelanto = 0` el
modelo devuelve la MISMA etapa que la curva vieja por edad en días** (seed 0–1,
germ 2–6, fern ≥7) a cualquier hora: el rediseño es estrictamente aditivo y ningún
brote puede verse más chico que antes. Ídem el tamaño: `fernSizeForHours(24·a) ===
fernSizeForAge(a)`, pero ahora el helecho engorda de forma continua durante el día
en vez de saltar a medianoche.

**El adelanto** (`deriveAdelanto`):

| Concepto | Horas | Cómo |
|---|---|---|
| Cada gasto registrado | `6 h` | tope **24 h** = 4 registros |
| Día en calma (sin gastos, marcado) | `48 h` | el ÚNICO que supera el techo |

Un día marcado sin gastos **germina en el acto** y arraiga dos días antes que
cualquier día de gastos — es el peso semántico que pidió el owner. Si la marca se
hizo con `force` sobre un día que SÍ tuvo gastos discrecionales, el día vale 24 h
(día completo) pero no es "en calma".

**El aro** de la pantalla muestra `adelanto / 24`. **El cupo diario NO entra en el
porcentaje**: entra como TONO del aro (verde dentro del cupo · ámbar pasado ·
celeste sin datos de ingreso). Dos razones: un bonus por cupo haría BAJAR el aro al
registrar el gasto que te pasa (castigando el acto que premia), y el cupo de un día
pasado no existe en ninguna fuente (`deriveGaugeState` solo computa hoy).

**El aro nunca toca la racha**: no entra en `familyActivityDays`, ni en
`deriveWeekStrip`, ni en `deriveWeekClose`, ni en el score 0–7. La racha sigue
siendo binaria (≥1 registro o marca = día plantado) y la floración sigue exigiendo
7/7 días PLANTADOS, no 7 aros llenos.

## Derivación (pura, testeable)

`mobile/features/garden/garden-model.ts` (tests en `tests/unit/garden-model.test.ts`):

- **`familyActivityWithCounts`** → en UNA sola pasada sobre el historial del hogar:
  el `Set` de actividad + los counts por día (`todos` = espejo del filtro de la racha,
  fijos incluidos; `discrecionales` = sin `commitment_id`, la definición de "sin gastos"
  del server). `familyActivityDays` quedó como wrapper. Misma pasada = el aro y la racha
  no pueden divergir.
- **`deriveDayRings`** (en `crecimiento-model.ts`) → los 7 aros de la semana vigente:
  `pre` (antes del alta, nunca "perdido") · `future` · `today` (con el pct del adelanto)
  · `planted`/`calma` (días pasados, **llenos**: el backend ya contó ese día entero) ·
  `recovered` · `missed`. Cada aro publica `stage` y `brotSize` (continuo 15→20px).
- **`deriveGardenCells`** → la grilla de 35 celdas. **Ya no se renderiza en la pantalla**
  (el handoff la reemplazó por la fila de 7 aros + el historial de semanas), pero sigue
  viva y testeada; su segundo pase es la referencia de la floración por semana perfecta.
- **`deriveHistoryWeeks`** → hasta 4 semanas previas como dots (`full`/`calma`/`missed`/
  `recovered`/`pre`), con el mismo orden logged-first.
- **`deriveWeekClose`** → score 0–7 (días ORGÁNICOS de la semana L→D) + `variant` +
  copy. Un día recuperado por escudo se marca aparte (`recovered: true`) pero NO suma al
  score. `days[].calma` marca los días sin gastos con la misma regla que los aros.
  Las **4 variantes** (rediseño 2026-08): `perfecta` 7 · `buena` 6–5 · `floja` 4–2 ·
  `cortada` ≤1 — con una guarda: score ≤1 **con la racha viva** degrada a `floja`, porque
  si tu única actividad fue el domingo la racha cruza viva al lunes y decir "Tu racha se
  cortó" sería mentir.
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

> **Nota días marcados:** `markedDaysIso` (días sin-gasto) cubre los 35 días de la
> grilla: `fetchMarkedDays` trae hasta 105 filas (por si la familia marca varios por
> día) y deduplica a 35 días DISTINTOS (`use-streak.ts`). Los días con gasto real
> vienen completos de `expenses`. Un hueco viejo incorrecto en QA ya no puede venir
> de este límite — buscar en el anclaje (`gardenFirstActivity`) o en el replay.

## Las 4 vistas

1. **Pantalla "Mi jardín"** (`mobile/screens/garden/garden-screen.tsx`, ruta
   `/(app)/garden`, accesible desde el header de **Gastos**) — **rediseñada 2026-08**:
   compone el kit de `mobile/components/redesign/jardin/` (spec literal del handoff
   `design/jardin-2026-08/`). De arriba a abajo: header · **hero de 6 estados**
   (empezar / a tiempo / plantado / floreciendo / en riesgo ≥20h / cortada, vía
   `deriveHeroState`) · **card de crecimiento** (aro grande de 130px con el brote
   adentro + fila de 7 aros de 40px + acción "Marcar día sin gastos" + fila de historial
   tocable) · card "Semana pasada" · card de acceso a Logros · nota educativa.
   La grilla del mes y el hero de stats viejo se retiraron. Un `useMinuteTick` (60s +
   AppState) hace que el estado "en riesgo" prenda en vivo y que el día rote a medianoche.
2. **Widget de Home** (`mobile/components/home/streak-week-widget.tsx`): tira semanal
   L-M-M-J-V-S-D + número de racha; tocarlo abre Mi jardín. Montado en `home-dashboard`.
3. **Floración** (`mobile/components/garden/floracion-view.tsx`): celebración de hito
   verde full-screen (luciérnagas + helecho con glow + flores coral). **Reemplaza** al
   viejo `AchievementUnlockModal` en `AchievementUnlockBridge` (mismo prop
   `{item, onDismiss}`; realtime + preview dev intactos). Intensidad por tier vía
   `floracionToneForTier` (`garden-tier.ts`). La galería de logros se re-skineó
   (emoji en bubble crema).
4. **Cierre de semana** (`mobile/components/garden/week-close-cierre.tsx`, que arma el
   VM y monta la `CierreSemanaView` del kit): recap de la semana que CERRÓ (L-D anterior),
   en **4 variantes**. Perfecta: fondo verde full-bleed + partículas + mini-Brots `cheer`
   + confeti + el logro desbloqueado de esa semana. Buena: próximo logro con barra. Floja
   y cortada: coach de Brot. Suma la línea "N días en calma" cuando los hubo, y los stats
   salen de la racha REAL. Se auto-dispara el lunes vía `WeekCloseBridge` y también desde
   la card "Semana pasada". **`use-week-close-seen.ts` separa dos flags**: `…_shown_` (lo
   reclama el bridge, mantiene el 1×/semana) y `…_seen_` (se escribe al CERRAR) — sin esa
   separación el dot naranja de "cierre sin ver" nunca podría prenderse.

5. **Pantalla de Logros** (`/settings/achievements`, `achievements-gallery-screen.tsx`):
   rediseñada con el kit (`logros-screen.tsx`). Tres secciones — DESBLOQUEADOS, EN
   PROGRESO y SECRETOS — sobre el catálogo REAL de 18. Sin cambios de schema:
   `achievement-progress.ts` deriva el progreso solo donde hay fuente confiable
   (`streak_*` desde `currentStreak`, `no_spend_cycle_*` desde
   `home_snapshot.no_spend_days_this_cycle`) y define secreto = `legendary && !earned`
   (hoy exactamente 2). Las medallas son un **mix**: Brot para los 4 hitos que son la
   metáfora del jardín (`first_expense`→seed, `goal_completed`→cheer, `streak_90`→radiant,
   `no_spend_lifetime_50`→zen, y solo cuando están desbloqueados) e ícono existente para
   los otros 14.

## Componentes reusados

`BrotParticles` con el preset `hero` (el mismo patrón que las otras 4 tabs; el jardín
era la última superficie hero con `CardParticles`) · `BrotMascot` · `FernMark`/`FernLogo`
· `CountUpText` · `AuroraBloom` · `ConfettiBurst` · `NoSpendConfirmSheet` (el retry con
`force` al marcar un día que ya tiene gastos) · `confetti.celebrate()`.

`day-brot.tsx` existe porque la intro PRE-AUTH (`intro-slides.tsx`) importa `DayBrot` y
`poseForDay`: se extrajeron ahí al retirar `week-close-celebration.tsx`.

## Tokens

`mobile/components/redesign/jardin/jardin-spec.ts` — `JARDIN_SPEC` (light/dark) +
`JARDIN_GEOMETRY` + `ringGeometry()`, transcripción literal del handoff con los desvíos
documentados por letra. El fondo es el GLOBAL de la app (`neoTokens(mode).bg`), no el
`#EEEDE9` que proponía el handoff. El día en calma tiene tokens propios (`calmaRing` /
`calmaWell`) para no confundirse con el pozo de HOY (`#E4F3DC`/`#24402C`).

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
