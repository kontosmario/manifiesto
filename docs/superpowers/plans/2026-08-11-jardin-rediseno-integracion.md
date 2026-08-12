# Plan de integración — Rediseño "Mi jardín" (handoff jardin 2026-08) · v3

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Las tareas están en orden de ejecución: ejecutalas por número.**

**Goal:** Integrar el handoff `design_handoff_jardin` (vista Mi jardín con aros de crecimiento, hero de 6 estados, cierre de semana de 4 variantes y pantalla de Logros) sobre la lógica real del proyecto, con el catálogo de 18 logros existente y un modelo que fusiona el crecimiento por tiempo con el acto de registrar.

**Architecture:** Proceso canónico de handoffs del repo: bundle → `design/` → spec literal + kit réplica auto-conducida en `mobile/components/redesign/jardin/` → preview en Settings→Dev con gate de aprobación del owner → cableado componiendo los sub-componentes exportados del kit → swap de ruta. La lógica nueva vive en módulos puros testeados ANTES del cableado. Cero migraciones de backend en el alcance base.

**Tech Stack:** React Native 0.81 (New Arch) + Expo · Reanimated v4 · react-native-svg · Skia (BrotMascot/BrotParticles) · React Query + Supabase · vitest (env node) · i18n ES/EN.

## ✅ Estado: EJECUTADO (2026-08-11)

Las 6 decisiones abiertas las resolvió el owner y están cerradas en §2. **El plan se ejecutó completo (T0–T13) en 13 commits** sobre `feat/ui-redesign`, por orden directa del owner ("completa el plan, quiero que esté todo integrado") — lo que incluyó **saltear el gate antes del cableado**, con el mismo precedente que Control.

Verificación al cierre: `tsc` limpio · **1786 tests verdes** (baseline 1708 + 78 nuevos) · `eslint` 0 errores · guards de i18n, spacing y forbidden-copy OK · `expo export --platform ios` bundlea (11 MB). El guard `motion-tokens` falla, pero **ya fallaba antes** del rediseño y ninguno de sus archivos es del jardín nuevo.

**Pendiente lo que no se puede hacer sin device (T14):** QA visual de la matriz de 35 estados y la aprobación del owner en Settings → Desarrollo → "Jardín · aros de crecimiento". El chip sigue en `'pendiente'` a propósito: falta la mirada, no el trabajo. T15 (logros nuevos con migración) queda opcional, sin ejecutar.

## Global Constraints

- **Gate de aprobación** (memoria `feedback_redesign_approval_gate`): réplica literal del `Jardín Rediseño.dc.html` en Settings→Desarrollo, claro y oscuro. La regla original era **no tocar ninguna pantalla live hasta el flip `'jardin': 'aprobada'`**; el owner la levantó explícitamente al pedir la integración completa (ver Estado). Los desvíos `[OWNER-1]`…`[OWNER-6]` de §2 se aplican ya en la réplica.
- **Commits**: identidad git del usuario, sin atribución de IA. Mensajes en español (`feat(jardin): …`).
- **Copy**: español latino neutro, tuteo, sin voseo — en todo lo nuevo y corrigiendo los 8 residuales (§2·D1). Suite completa en cualquier cambio de copy.
- **Contraste**: toda tinta nueva sobre superficie clara se verifica AA (precedente `[B] todayInk = #A84A2F`). El celeste `#5FB8C9` sirve como stroke de aro; como tinta de texto sobre claro NO llega a AA → el texto del chip usa `neoInk(mode).accent`.
- **Reanimated**: sin `Intl`/locale en worklets · `Easing` del mismo runtime que `withTiming` · loops CSS con delay NEGATIVO · nunca `transform: undefined` · `runOnJS` para JS · no importar `useReducedMotion` directo (import trap con regla ESLint).
- **Layout**: no montar ScrollView propio dentro de `Screen`; padding horizontal DENTRO del contentContainer.
- **Android API<29**: `boxShadow` inset se descarta en silencio → conservar `SUPPORTS_INSET_SHADOW` + token `hairline`.
- **Brot**: la tinta sobresale `BROT_INK_BLEED_TOP=12` unidades de viewBox. **Ningún contenedor de un Brot lleva `overflow:'hidden'`** — vale para los pozos de los aros y para las medallas.
- **QA**: en Apple Silicon no hay simulador (ML Kit) → device. expo-web no rinde Skia (Brot y BrotParticles salen vacíos) ni `experimental_backgroundImage`.
- **Bash**: `source ~/.nvm/nvm.sh` antes de `tsc`/`vitest`. `npm run validate` no cubre el bundle: también `npx expo export --platform ios`.

---

## §1 · Resumen

El handoff encaja bien: las 12 poses de Brot ya existen (más `zen`), `particles.js` ya está portado, Nunito ya está registrada, y el conteo de gastos por día se deriva client-side sin backend nuevo.

El cambio de fondo es el **modelo de crecimiento** (§3): el handoff define el aro como "riego" (cantidad de registros); el owner pidió que sea **crecimiento**, fusionando la curva de edad existente con el acto de registrar, medido en horas. El modelo resultante es **estrictamente aditivo** sobre el actual —con adelanto 0 da exactamente la misma etapa que hoy— y el adelanto **mueve de verdad la madurez del brote**, no solo un anillo.

Hallazgo que amplía el alcance visual: **hoy la curva de crecimiento no se ve en ninguna parte**. `seed`, `germ`, `fern` y `bloom` se dibujan idénticos (mismo Brot `idle` a 32px); `GardenCell.fernSize` es dato muerto y `sprout.tsx` no tiene un solo importador. El rediseño no cambia cómo se ve el crecimiento: **lo estrena**.

---

## §2 · Decisiones cerradas

### D1 — Copy: español latino neutro, sin voseo `[OWNER-1]`

Todo el copy nuevo en tuteo neutro; los copys del handoff (que vienen en voseo) se neutralizan **ya en la réplica**. Registro de voz vigente: imperativo tuteo sin tilde final (Registra, Carga, Marca, Sigue, Define, Agrega, Empieza) · "tu/ti" · "aquí" no "acá" · presente 2ª persona.

**Voseo residual a corregir** (8 strings; `garden.json` y `achievements.json` ya están limpios):

| Archivo:línea | Key | Actual → Nuevo |
|---|---|---|
| `es/home.json:63` | `configureSalary` | "Configurá tu sueldo ›" → "Configura tu sueldo ›" |
| `es/home.json:113` | `fixedReservedA11y` | "Todavía tenés que pagar…" → "Todavía tienes que pagar…" |
| `es/home.json:395` | `addFirstFixed` | "Agregá tu primer fijo…" → "Agrega tu primer fijo…" |
| `es/home.json:404` | `streak.dayZeroSub` | "Registrá tu primer gasto hoy y plantá un brote" → "Registra tu primer gasto hoy y planta un brote" |
| `es/home.json:414` | `goal.emptyRaiseSub` | "Definí un objetivo de ahorro" → "Define un objetivo de ahorro" |
| `es/home.json:415` | `goal.emptyDashedSub` | "Definí un objetivo y el sobrante trabaja para vos" → "Define un objetivo y el sobrante trabaja para ti" |
| `es/fijos.json:358` | `emptySubNoFijos` | "Sumá alquiler…" → "Suma alquiler…" |
| `es/fijos.json:363` | `outOfCycleSub` | "Confirmá tu cobro…" → "Confirma tu cobro…" |

### D2 — Fondo: el global de la app `[OWNER-2]`

Se descarta el `#EEEDE9` del handoff. El jardín usa `neoTokens(mode).bg` (`#DCDFCD` claro / `#0F1A13` oscuro) y las sombras canónicas del sistema (`raisedLg` claro `rgba(151,160,136,0.42)`), igual que las otras cuatro tabs. Vale también en la réplica del preview: el owner juzga el diseño sobre el canvas real de la app. Cero cambios en `neo-tokens.ts`.

### D3 — Medallas: mix Brot + íconos existentes `[OWNER-3]`

Brot para los cuatro hitos que SON la metáfora del jardín; el ícono existente para los otros catorce. Sin números.

| Code | Medalla | Pose / motivo |
|---|---|---|
| `first_expense` | **Brot** | `seed` — el título es "El primer brote" |
| `goal_completed` | **Brot** | `cheer` — "Meta florecida" |
| `streak_90` | **Brot** | `radiant` — "Leyenda viva" |
| `no_spend_lifetime_50` | **Brot** | `zen` — la quietud del no-gasto |
| Los otros 14 | `FilledAchievementIcon` | Registry existente (precedencia filled→outline→emoji) |

**Regla dura**: Brot solo en DESBLOQUEADOS. `BrotMascot` no tiene prop de tinte ni opacidad y la variante apagada solo la dispara la pose `wilted`; no hay forma de dibujar un Brot "bloqueado" sin tocar `drawBrot` (1635 líneas con paints cacheados). Los cuatro, cuando están locked, muestran su ícono filled en estado locked.

**Bloqueador a resolver en la misma tarea**: `styles.iconBubble` (`achievements-gallery-screen.tsx:459`) y `styles.iconDisc` (`badge-detail-sheet.tsx:167`) llevan `overflow:'hidden'` para clipear el cuadrado forest del ícono filled — eso **guillotina al Brot**. Fix: mover ese `overflow:'hidden'` a un `<View>` interno que envuelva SOLO al `FilledAchievementIcon`. Centrado óptico del Brot: `translateY = BROT_INK_BLEED_TOP / 2 × size / 108` (≈ +2.1px a size 38).

### D4 — Día sin gastos: el único día que crece doble `[OWNER-4]`

Hoy un día sin gastos vale exactamente lo mismo que un día con gastos. Cuatro capas para que pese de verdad. **El canal principal es la identidad visual, no el número** — el tamaño del brote en un pozo de 28px no puede cargar la diferencia (entre etapas hay 2px), así que el peso se comunica donde se lee:

1. **Identidad propia y permanente.** `noSpend` es un flag (no un `BroteStage`, §3.5) que le da al día un tratamiento que ningún día de gasto puede tener, **en las tres superficies donde vive un día**: aro con **anillo doble** + verde profundo (token propio `calmaRing`), Brot **`zen`** en vez de `idle`, y el glyph `crecimiento/brote-bebe` (sticker que ya existe en el registry y nunca se usó). Se ve así hoy, en la fila de 7, en el historial y en el cierre de semana — **para siempre**, no solo el día que lo marcaste. **No se reusa el tinte `#E4F3DC`/`#24402C`**: ese es el pozo de HOY en el handoff (README:48) y confundiría los dos estados.
2. **Crece el doble.** El adelanto por registrar topea en 24 h; el día en calma otorga **48 h**, el único camino que supera el techo: llega a `fern` (arraigado) **dos días antes** que un día de gastos, y es el único que completa el aro **sin registrar nada**. Es un efecto real y sostenido, pero sutil por diseño — el tamaño del brote se mueve de forma continua (§3.2), no a saltos; quien comunica el estado es la capa 1.
3. **Reconocimiento acumulado**: los 4 logros `no_spend_*` y el `confetti.celebrate()` que ya existen; el cierre de semana suma la línea "N días en calma" cuando hay ≥1.
4. **Acceso desde el jardín**: hoy se marca desde el FAB (`add-expense-tab-button.tsx`, con `NoSpendConfirmSheet` + retry `force`), desde el calendario de Gastos (`neo-gastos-screen.tsx:2101-2169`) y desde el `StreakSheet` legacy. El jardín suma el suyo — es la pantalla del hábito.

### D5 — Partículas: el patrón de las hero cards del rediseño `[OWNER-5]`

Las 4 tabs live (Home, Gastos, Fijos, Control) usan `BrotParticles`; el jardín quedó con `CardParticles` (la familia Ajustes también, pero no es hero de tab). Se alinea al patrón dominante, que además es el que el handoff especifica (`<brot-particles>`):

```tsx
<View style={styles.heroParticles} pointerEvents="none">
  <BrotParticles {...neoParticlePresets.hero} borderRadius={JARDIN_GEOMETRY.heroRadius} />
</View>
// heroParticles: { position:'absolute', top:0,left:0,right:0,bottom:0, borderRadius: 32, overflow:'hidden' }
```

Preset `hero` = `['#C9F3C6','#FBD9BC','#EFF6E2']`, **count 10**. El doble clip (wrapper + prop `borderRadius`) es load-bearing: en Android el clip de esquinas sobre `<Canvas>` de Skia no es confiable. La capa de partículas nunca es la card con `boxShadow`. `BrotParticles` se auto-gatea por foco y reduced motion; `CardParticles` no.

### D6 — El porcentaje es CRECIMIENTO `[OWNER-6]`

Ver §3 completo.

---

## §3 · El modelo de crecimiento

### 3.1 La idea

El brote ya crece con el reloj: hoy madura por edad en días (`seed` 0–1, `germ` 2–6, `fern` ≥7). El rediseño mide ese crecimiento **en horas** y permite **adelantarlo**: registrar tus gastos le regala horas al brote, y un día sin gastos le regala dos días enteros.

> **El aro es cuánto le adelantaste hoy a tu brote.**

Frase del chip de ayuda: *"Cada gasto que registras adelanta el crecimiento de tu brote. Un día sin gastos lo hace crecer el doble."*

### 3.2 La ecuación

```
H(d) = 24 × ageDays(d)  +  horaLocal  +  adelanto(d)
       └─ el reloj, igual que hoy ─┘     └── lo ganado ──┘
```

- `ageDays(d)` es exactamente el de `deriveGardenCells` (`garden-model.ts:158`); `horaLocal ∈ [0,24)` en la tz de `isoDay()`.
- Etapas: `seed` `H < 48` · `germ` `48 ≤ H < 168` · `fern` `H ≥ 168`.

**Compatibilidad (verificada por el juez de fidelidad línea por línea):** los dos umbrales caen sobre múltiplos exactos de 24, así que **con `adelanto = 0` el modelo devuelve la MISMA etapa que hoy, a cualquier hora**. `ageDays=1 → H∈[24,48) → seed` ✓ · `ageDays=6 → H∈[144,168) → germ` ✓ · `ageDays=7 → H∈[168,192) → fern` ✓. Ningún brote puede verse más chico que hoy.

Tamaño del helecho, también exacto (porque `0.4/24 = 1/60`):

```ts
fernSizeForHours(h) = Math.round(24 + Math.min(Math.max((h - 168) / 60, 0), 8))
// fernSizeForHours(24 * a) === fernSizeForAge(a) para todo a ≥ 7
```

### 3.3 El adelanto

```
adelanto(d) = marcadoSinGastos(d) ? 48 : min(24, 6 × registros(d))
pctAro(d)   = min(1, adelanto(d) / 24)
```

| Concepto | Horas | Cómo |
|---|---|---|
| Cada gasto registrado | `6 h` | tope **24 h** = 4 registros (la meta redonda del handoff, 25% c/u) |
| Día en calma | `48 h` | marcar el día sin gastos — el único que pasa el techo (D4) |

**Por qué el cupo NO entra en el porcentaje.** Dos razones duras:

1. **Un bonus por cupo hace bajar el aro al AGREGAR.** Se evalúa contra `spentToday`, que cambia durante el día: el cuarto gasto grande te sacaría del cupo y el aro caería de 100% a 75%, retirando un "día completo" ya anunciado y castigando exactamente el acto que el modelo premia. Sin el cupo, **el aro nunca baja por registrar**. (Sí baja si DESHACÉS: borrar un gasto o desmarcar el día en calma — ambas acciones existen hoy, `useDeleteExpense` y `useUnmarkNoExpenseDay`, y son alcanzables desde el calendario de Gastos. Eso es correcto y esperable: es la consecuencia directa de una acción explícita del usuario, no una sorpresa. Los dos casos van a QA en T14.)
2. **El cupo de un día pasado no existe en ninguna fuente.** `deriveGaugeState` solo computa hoy, así que un adelanto que dependa del cupo sería incalculable para los otros seis aros de la fila y para el historial.

Por eso **el cupo entra como TONO, no como suma**:

- `dentroDelCupo === true` (gauge `status !== 'over'`) → el aro se dibuja en el verde del sistema.
- `dentroDelCupo === false` → el mismo porcentaje, en ámbar (`#C96F3F` claro / `#F2A87E` oscuro).
- `dentroDelCupo === null` (sin datos de ingreso) → celeste neutro, sin mención de cupo.

El tono es **estado**, no progreso: puede cambiar en ambas direcciones sin mentir. Así el aro sigue siendo monótono (registrar nunca lo baja) y el cupo sigue siendo la referencia que pidió el owner, visible en la misma pieza.

**Qué cuenta como registro**: gastos del HOGAR con `created_by` no-null — la misma definición de `familyActivityDays` (`garden-model.ts:69-80`), pagos de fijos incluidos, derivada de la MISMA pasada (§3.6) para que el aro y la racha no puedan divergir.

**De dónde sale el tono**: `deriveGaugeState` (`mobile/features/home/derive-gauge-state.ts:138-172`) → `tone = state === null ? 'water' : state.status === 'over' ? 'amber' : 'green'`.

⚠️ **El hook del cupo NO entra en `use-garden.ts`.** `useGarden` tiene 6 call sites, incluido `WeekCloseBridge` (montado en `app-stack-shell.tsx:178`, fuera del Stack ⇒ vivo en las 5 tabs) y `streak-week-widget.tsx:43`, que lo llama con `familyId: undefined`. Montar ahí `useHomeMetrics` (que además exige `familyId: string`, no compila con `undefined`, y arrastra `useFamilyDashboard` + `usePayCycle` + `useMonthlyAccounting` + `useCategories` + `useSavingsGoal`) cargaría media Home en toda la app. **El tono se calcula en `garden-screen.tsx`** —el único lugar que lo necesita— y se pasa hacia abajo. `deriveGaugeState` necesita `budgetDays`, que `useHomeMetrics` no expone (viene de `useFamilyDashboard`); para no montar los dos, el jardín usa el predicado equivalente sobre campos que `HomeHeroMetrics` ya trae: `spentToday > openingDailyBudget → 'amber'`. Si el costo resultara alto en QA, el fallback documentado es `'water'` fijo, sin perder nada del modelo.

### 3.4 Lo que el usuario ve

| Situación | Aro | Etapa del brote |
|---|---|---|
| 0 gastos hoy | 0% | `seed` |
| 1 gasto | 25% | `seed` |
| 4+ gastos | 100% | `seed` hoy → **`germ` mañana a las 00:00** (en vez del día 2) |
| Día en calma | **100% + anillo doble** | **`germ` HOY MISMO** (48 h de una) → `fern` el día 5 |
| Dentro del cupo | tono verde | — |
| Pasado del cupo | mismo %, tono ámbar | — |
| Sin datos de ingreso | mismo %, celeste | — |

Chips: "2 de 4 gastos registrados hoy" · "Día completo · tu brote creció un día entero" · "Día en calma · tu brote creció el doble" · "Tu brote espera el primer gasto de hoy".

**Los días PASADOS de la fila van llenos** (verde), no al porcentaje alcanzado — desvío consciente del handoff: el backend ya contó ese día entero y mostrarlo a medias mentiría sobre una racha viva. El "cuánto creció" **sí se ve**, en la etapa y el tamaño del brote dentro del pozo (§3.2), que es lo que hoy no se ve nunca. Perdidos: track vacío + `wilted` 45%. Recuperados por escudo: lleno coral.

### 3.5 Alcance de la pantalla: la grilla del mes se retira

El handoff reemplaza la grilla de 35 celdas por **la fila de 7 aros + el historial de semanas anteriores**: su jerarquía son 6 bloques y ninguno es una grilla (README:28-35). La grilla actual (`garden-grid.tsx`) y el hero de stats actual (`garden-hero.tsx`) **salen de la pantalla** en T9 y se borran en T13.

Consecuencias buenas de esta decisión: desaparece la posibilidad de que el aro (etapa por horas) y la grilla (etapa por edad) se contradigan en la misma pantalla, y el jardín deja de renderizar 35 canvas de Skia. `deriveGardenCells` **no se toca** — sigue viva para quien la use y como referencia del segundo pase de floración; simplemente esta pantalla ya no la consume.

### 3.5b Invariantes que NO se tocan

- **La racha sigue siendo binaria.** El aro no entra en `familyActivityDays`, ni en `deriveWeekStrip`, ni en `deriveWeekClose`, ni en el score 0–7. **Nunca corta ni completa una racha.** Esto corrige la regla 4 del handoff, que leída literal contradice el backend.
- **La floración sigue exigiendo 7/7 días PLANTADOS**, no 7 aros llenos.
- **`noSpend` es un FLAG, no un `BroteStage`**: agregar un stage sería falla silenciosa (`poseForStage` tiene `default: return null` e `isPlanted` es cadena de `||` — TypeScript no lo marcaría y la celda saldría gris, solo visible en device), y además se perdería en el segundo pase de `bloom`, que pisa el stage.
- **Sin culpa**: días previos al alta de la cuenta y salteados nunca se pintan como perdidos (§3.6, `startIso`).
- **Jardín familiar**: los 4 registros pueden venir de dos personas.

### 3.6 Datos, costo y bordes

- Los counts por día salen de la **misma pasada** que ya hace `familyActivityDays` (T9 Step 1) — cero recorridas nuevas sobre un cache que trae el historial completo del hogar. Ese memo depende de `expenses`, **no del reloj**: el tick de minuto solo mueve `horaLocal`/`todayIso`, que son escalares.
- Los inserts optimistas prependan al cache ⇒ el aro avanza al instante. Si el insert falla, el rollback lo retrocede (aceptado: el aro es informativo, no transaccional).
- **Días anteriores al alta**: `deriveDayRings` recibe `startIso` = **`firstActivityIso`** (la misma fuente que usa `deriveGardenCells` para su estado `'pre'`, `garden-model.ts:163` — no el `accountCreatedIso` que recibe `deriveWeekStrip`; los dos valores difieren siempre que la cuenta se creó antes del primer registro, justo los días que no hay que culpar) y los marca `'pre'`, nunca `'missed'`.
- **Día con marca Y gastos**: el server permite marcar un día que tiene pagos de fijos (el guard excluye `commitment_id`) o gastos de otro miembro. La marca manda para el adelanto (48 h), pero el estado visual `'calma'` exige que no haya gastos **discrecionales** (`commitment_id === null`) — si los hay, el día es `'planted'` y el chip informa el conteo. Se cuentan las dos cosas en la misma pasada.

---

## §4 · Mapa handoff → sistema

| Pieza | Fuente real | Tarea |
|---|---|---|
| Hero 2a–2f | `StreakData` + `plantedToday` + hora | T7/T9 |
| Aro grande + fila de 7 | `crecimiento-model` (§3) | T7/T9 |
| Etapa y tamaño del brote | `etapaPorHoras`/`fernSizeForHours` por celda | T7/T9 |
| "Marcado hoy a las 21:00" | `streak_marked_days.marked_at` (el select actual solo trae `marked_date`) | T9 |
| Historial (dots + sheet) | semanas L→D previas; caps 35 marked / 60 recovered alcanzan | T7/T9 |
| Semana pasada + cierre ×4 | `deriveWeekClose` remapeado | T10 |
| Logro desbloqueado en el cierre | `achievements_earned.earned_at` dentro de la semana | T10 |
| Pantalla Logros | catálogo 18 + earned + progreso derivado | T8/T11 |
| Brot (12 poses + `zen`) · Partículas | `BrotMascot` · `BrotParticles` | Cero porte |

**Logros del handoff — veredicto** (nuestro catálogo tiene 18; el mock muestra 13 demo):

| Logro del mock | Veredicto |
|---|---|
| Primer brote · Racha de 7/30 · Días sin gastos | **YA ESTÁ** (`first_expense`, `streak_7`/`streak_30`, familia `no_spend_*`) |
| Jardín de 10/50/100 · Dos ediciones | **AGREGAR** (opcional, T15): `total_days_logged` y `monthly_summaries` ya existen |
| Semana perfecta ×N · "10 semanas florecidas" | **DESCARTAR**: el cierre es 100% cliente, no hay fuente server, y un logro repetible no cabe en el PK `(user_id, code)`. Además "10 semanas florecidas" no está ni en la lista de 13 del propio handoff |
| Récord personal | **DESCARTAR**: es un stat dinámico, no un hito |
| Constancia mensual | **DESCARTAR**: redundante con `streak_30` |

**Secretos y progreso** (sin cambios de schema): SECRETOS = `tier === 'legendary' && !earned` → hoy exactamente 2 (`streak_90`, `no_spend_lifetime_50`), como el mock. Barras solo donde hay fuente: `streak_*` (desde `currentStreak`) y `no_spend_cycle_*` (desde `home_snapshot.no_spend_days_this_cycle`, la fuente cycle-scoped canónica que ya usa Gastos — **no** `markedDaysIso`, que el código en vivo marca explícitamente como placeholder, ni `usePayCycle`, cuya ventana no es la del server). Los otros 9 locked se muestran **sin barra**: medalla-pozo + título + body, como el estado "por desbloquear" de la galería actual.

---

## §5 · Estructura de archivos y contrato

```
design/jardin-2026-08/                     ← bundle (T0)
mobile/components/redesign/jardin/         ← área NUEVA (no pisa redesign/garden/, load-bearing en 5 archivos live)
  jardin-spec.ts · parts/growth-ring.tsx · parts/medal.tsx
  jardin-screen.tsx · cierre-screen.tsx · logros-screen.tsx
mobile/features/garden/crecimiento-model.ts          (T7)
mobile/features/achievements/achievement-progress.ts (T8)
tests/unit/crecimiento-model.test.ts · tests/unit/achievement-progress.test.ts
mobile/screens/dev/redesign/redesign-jardin-preview-screen.tsx + ruta + índice + gate (T6)
— post-gate — use-garden.ts · use-streak.ts · garden-screen.tsx · use-minute-tick.ts (T9)
garden-model.ts + week-close-bridge.tsx + use-week-close-seen.ts (T10) · achievements-gallery-screen.tsx (T11)
i18n (T12) · limpieza+docs (T13) · QA (T14) · opcional (T15)
```

**Contrato kit↔live** (el kit exporta, el cableado llena):

```ts
export type HeroKind = 'empezar' | 'aTiempo' | 'plantado' | 'floreciendo' | 'enRiesgo' | 'cortada'
export interface HeroVM {
  kind: HeroKind; label: string; title: string; sub: string
  chip: { text: string; kind: 'neutral' | 'ok' | 'risk' | 'lost' }
  cta?: { text: string; tone: 'green' | 'amber'; onPress: () => void }
  pill?: string
  brotPose: BrotPose; particleCount: number
}
export type DayRingState = 'pre' | 'future' | 'today' | 'planted' | 'calma' | 'missed' | 'recovered'
export type RingTone = 'green' | 'amber' | 'water'          // el tono del cupo (§3.3)
export interface DayRingVM {
  letter: string; state: DayRingState; pct: number; tone: RingTone
  noSpend: boolean                                           // día en calma — vale también con state 'today'
  stage: 'seed' | 'germ' | 'fern'                            // etapa por horas (§3.2)
  brotPose: BrotPose | null; brotSize: number                // tamaño continuo en horas
}
export interface CrecimientoVM {
  // El focus es el pozo grande: su Brot va SIEMPRE a JARDIN_GEOMETRY.ringFocus.brot (52),
  // no al brotSize de la fila. `stage` se comunica en palabras en el chip, no por tamaño.
  focus: Omit<DayRingVM, 'brotSize'> & { chipDot: 'sand' | 'water' | 'green'; chipText: string }
  days: DayRingVM[]                                          // 7, L→D
  footer: { kind: 'cta' | 'pill'; text: string; onPress?: () => void }
  secondary?: { text: string; onPress: () => void }          // "Marcar día sin gastos" (D4)
  history: { rows: Array<Array<'full' | 'calma' | 'missed' | 'recovered' | 'pre'>>; onOpen: () => void } | null
}
export type WeekCloseVariant = 'perfecta' | 'buena' | 'floja' | 'cortada'
export interface SemanaPasadaVM { variant: WeekCloseVariant; title: string; sub: string; unseenDot: boolean; onOpenCierre: () => void }
export type MedalVM =
  | { kind: 'brot'; pose: BrotPose }                           // SOLO earned (D3)
  | { kind: 'icon'; code: string; earned: boolean }            // earned=false → ícono en gris
  | { kind: 'progress'; current: number }                      // pozo con el número actual
  | { kind: 'secret' }                                         // pozo profundo + candado

// Regla única status → rama (nadie más decide):
//   unlocked                    → medalForCode(code, true)  → 'brot' | 'icon'(earned)
//   inProgress CON barra        → 'progress'
//   inProgress SIN barra        → 'icon' con earned:false   (incluye los 4 codes de Brot bloqueados)
//   secret                      → 'secret'
export interface LogrosAccessVM { medals: MedalVM[]; countText: string; onPress: () => void }
export interface CierreVM {
  variant: WeekCloseVariant
  title: string; chipText: string
  days: Array<{ letter: string; state: 'logged' | 'calma' | 'recovered' | 'missed' | 'seed' }>
  stats: Array<{ value: string; label: string }>
  calmDays?: number
  unlocked?: { code: string; title: string; body: string; medal: MedalVM }
  nextGoal?: { title: string; current: number; target: number }
  coach?: string
  cta: { text: string; onPress: () => void }; secondary: { text: string; onPress: () => void }
}
export interface LogroRowVM {
  code: string; title: string; body: string
  status: 'unlocked' | 'inProgress' | 'secret'
  medal: MedalVM
  progress?: { current: number; target: number }              // ausente = fila sin barra
  onPress?: () => void
}
```

**Tabla de poses (única fuente; nadie más decide poses):**

| Estado | Pose | Tamaño |
|---|---|---|
| `focus` 0 registros | `seed` | **52 fijo** (pozo grande) |
| `focus` parcial (1–3) | `sprout` | 52 |
| `focus` completo (4+) | `love` | 52 |
| `focus` con `noSpend` | `zen` | 52 |
| `focus` en semana florecida | `radiant` | 52 |
| día `today` en la fila | la misma pose que el `focus` (por registros / `noSpend`) | `brotSize` |
| día `planted` | `idle` | `brotSize` |
| día `calma` (o `today` + `noSpend`) | `zen` | `brotSize` |
| día `recovered` | `seed` | `brotSize` |
| día `missed` | `wilted` (45% opacidad) | `brotSize` |
| día `pre` / `future` | `null` | — |

`brotSize` es **continuo en horas** (§3.2), no tres escalones: `15 + clamp(H / 168, 0, 1) × 5` → de 15 px (recién plantado) a 20 px (arraigado), dentro del rango `ringDay.brotMin/brotMax`. Así las 48 h del día en calma se traducen en un crecimiento real y sostenido en vez de perderse dentro de una banda.

---

## §6 · Tareas (en orden de ejecución)

**Fase A — Réplica (T0–T6)** · **Fase B — Lógica pura (T7–T8)**, no toca UI live · 🚦 **GATE** · **Fase C — Cableado (T9–T12)** · **Fase D — Limpieza, QA y opcional (T13–T15)**.

### Task 0: El handoff entra al repo

**Files:** Create: `design/jardin-2026-08/` + `PLAN-INTEGRACION.md`

- [ ] **Step 1:** `mkdir -p design/jardin-2026-08 && cp "/Users/mario/Downloads/design_handoff_jardin/"* design/jardin-2026-08/` y copiar este plan.
- [ ] **Step 2:** Verificar los 5 archivos + el plan. NO portar `brot.js`/`particles.js` (byte-idénticos a los portados salvo la transición de pose, que no se porta).
- [ ] **Step 3:** Commit: `feat(jardin): el handoff del rediseño entra entero — 35 estados, cierre y logros`

### Task 1: `jardin-spec.ts`

**Files:** Create: `mobile/components/redesign/jardin/jardin-spec.ts`
**Produces:** `JARDIN_SPEC: Record<'light'|'dark', JardinSpec>`, `JARDIN_GEOMETRY`, `ringGeometry(size, stroke)`

- [ ] **Step 1:** Transcribir LITERAL del HTML con la convención de `gastos-spec.ts` (strings CSS para `experimental_backgroundImage`, strings `boxShadow`, cero "mejoras"):
  - Aros: celeste `#5FB8C9`/`#7FD0DE` · verde `#63B168`/`#8FCF95` · **ámbar de cupo excedido `#C96F3F`/`#F2A87E`** · track `#E3E1DA`/`#2A4032` · pozo `#E8E6E0`/`#142519` · **pozo de HOY `#E4F3DC`/`#24402C`** (es el tinte de HOY, README:48 — no el de calma) · dashed `#D8D5CC`/`#3A5040` · dots historial `#63B168`/`#A9CE8E`/`#D6C29E` claro y `#8FCF95`/`#5F8A66`/`#4A3A26` oscuro · label HOY `#2E7C39`/`#A4E3A6`.
  - Hero POR ESTADO: 2a `#4C7A50→#5FA064→#6FB074` · 2b–2e `#337B39→#4C9A52→#5FAC64` · 2f `#3C4A3D→#2E3A2F` · oscuro `#234931→#1B3A26→#16301F` (2a difiere de 2b–2e: no tokenizar uno solo).
  - CTAs: verde `radial-gradient(circle at 32% 28%, #63B168, #2E7434 85%)` / oscuro `#9FDC9F→#5FA968 85%` texto `#0F1E14` · ámbar `#E8A664→#C96F3F 85%` · pill inset `rgba(13,34,18,0.24)` · CTA crema del cierre `linear-gradient(145deg,#F7F4E6,#E2DEC8)`.
  - Cierre, medallas (`#63B168→#2E7434 85%` + `0 8px 16px rgba(46,116,52,0.35)`), pozo en-progreso, card secreta inset, candado.
  - **Token propio de día en calma** (no existe en el handoff): `calmaRing` = verde profundo `#2E7434`/`#8FCF95` + `calmaWell` (pozo del verde de "completo") — se distingue del pozo de HOY.
- [ ] **Step 2:** `JARDIN_GEOMETRY`: `ringFocus {size:130, stroke:10, well:100, brot:52}` · `ringDay {size:40, stroke:4, well:28, brotMin:15, brotMax:20}` · radios `{hero:32, card:28, cardSm:24, nota:20, sheet:[30,30,34,34], chip:14, medalAccess:34, medalRow:54}` · `historyDot:10` · `sheetDot:12` · `backSize:44`. (hero **32** = el del mockup del teléfono, HTML:483–485; el 30 del README son las cards sueltas.) Y:
```ts
export function ringGeometry(size: number, stroke: number): { r: number; c: number } {
  const r = (size - stroke) / 2 - 1
  return { r, c: 2 * Math.PI * r }
}
```
- [ ] **Step 3:** Docblock con los desvíos: `[OWNER-1]` tuteo · `[OWNER-2]` fondo global, no `#EEEDE9` · `[OWNER-3]` mix de medallas · `[OWNER-4]` token de calma propio · `[OWNER-5]` `BrotParticles` preset `hero` count 10 · `[OWNER-6]` el aro es crecimiento · `[A]` días pasados llenos · `[B]` celeste solo como stroke, texto con `neoInk(mode).accent`. Y una sección "INCONSISTENCIAS DEL HANDOFF" (informativa): chip demo "65% · 3 gastos" · "HOY encoge 56→40px" sin ningún aro de 56 en los mockups · el sheet historial solo existe en claro (tokens oscuros derivados) · "próximo: 10 semanas florecidas" no está en su propia lista de 13.
- [ ] **Step 4:** `source ~/.nvm/nvm.sh && npx tsc --noEmit`.
- [ ] **Step 5:** Commit: `feat(jardin): spec literal del handoff — tokens y geometría de aros`

### Task 2: `GrowthRing`

**Files:** Create: `mobile/components/redesign/jardin/parts/growth-ring.tsx` · Test: `tests/unit/ring-geometry.test.ts`
**Produces:** `GrowthRing({ size, stroke, pct, color, trackColor, double?, animated?, children })` (`double` = anillo exterior del día en calma).

- [ ] **Step 1 (test primero):**
```ts
import { describe, expect, it } from 'vitest'
import { ringGeometry } from '@/components/redesign/jardin/jardin-spec'

describe('ringGeometry', () => {
  it('aro grande 130/10 → r=59, C≈370.71', () => {
    const g = ringGeometry(130, 10)
    expect(g.r).toBe(59)
    expect(g.c).toBeCloseTo(370.708, 2)
  })
  it('aro día 40/4 → r=17, C≈106.81', () => {
    const g = ringGeometry(40, 4)
    expect(g.r).toBe(17)
    expect(g.c).toBeCloseTo(106.814, 2)
  })
})
```
- [ ] **Step 2:** `npx vitest run tests/unit/ring-geometry.test.ts` → FAIL.
- [ ] **Step 3:** Implementar: `Svg` con dos `Circle` (track debajo; progreso con `strokeDasharray={c}` y `strokeDashoffset` animado por `useAnimatedProps` + `withTiming(c*(1-pct), { duration: 600, easing: Easing.out(Easing.cubic) })`, `transform rotate(-90)` sobre el centro, `strokeLinecap="round"`). El color se anima con `interpolateColor` para el cambio de tono. Gotchas: cast `React.FC` para children de svg · `Easing` de reanimated · `AnimatedCircle = Animated.createAnimatedComponent(Circle)` · `animated={false}` → offset directo. **El pozo (children) va FUERA del `Svg`, absoluto centrado, SIN `overflow:'hidden'`** (bleed del Brot).
- [ ] **Step 4:** Test pasa. Commit: `feat(jardin): GrowthRing — aro de crecimiento SVG con progreso y tono animados`

### Task 3: Kit réplica — Mi jardín

**Files:** Create: `mobile/components/redesign/jardin/jardin-screen.tsx`
**Produces:** `JardinHeader, JardinHero, CrecimientoCard, SemanaPasadaCard, LogrosAccessCard, NotaEducativa, HistorialSheet` + tipos VM (§5) + `JardinFinalScreen({ mode, initialSeed })`.

- [ ] **Step 1:** Línea 1: `// @i18n-ignore-file — kit de rediseño bajo gate; copy literal (tuteo neutro por [OWNER-1]), i18n en el pase posterior`.
- [ ] **Step 2:** Transcribir con datos demo del mock: header (back 44 raised + título 30/900 + sub 12.5/700) · hero 2a–2f (HTML:333–444, **sin** la fila chip+7dots, eliminada del hero real por README:30) · `CrecimientoCard` (aro 130 + pozo 100 + Brot 52 + chip + fila de 7 aros 40 con pozos 28 y Brots 15–20 + futuro dashed 2.5px + labels + fila historial tocable) · `SemanaPasadaCard` (HTML:507–514) · `LogrosAccessCard` (HTML:515–526, stack 3 medallas 34 solape −12) · `NotaEducativa` (inset radius 20) **con "×"** (inset 24px arriba a la derecha — la matriz ⑤2 lo exige sin darle visual) · `HistorialSheet` (grabber 44×5, 4 filas rango+7dots+chip; variante oscura derivada).
- [ ] **Step 3:** Piezas propias, marcadas como tales en el preview: acción secundaria **"Marcar día sin gastos"** (12/800 muted, D4) · **día en calma** (anillo doble + verde profundo + Brot `zen` + glyph `crecimiento/brote-bebe`) · **tono ámbar** del aro cuando se pasó del cupo (§3.3) · leyenda del README:52 · día perdido (track vacío + `wilted` 45%) · día `pre` (celda tenue, nunca marchita).
- [ ] **Step 4:** `JardinFinalScreen` con `useReducer` sobre `{ heroKind, focusState, tone, semanaPasadaVariant, showSheet, noteDismissed, loading }`.
- [ ] **Step 5:** Animaciones de loop/estado: seed sway 2.5s · saludo cada 6s (nativo) · partículas preset `hero` count 10 (D5) · press raised→inset 120/180ms · halo pulse 3s (2d) · borde ámbar fade-in 400ms al entrar a 2e (barra izquierda `inset 4px 0 0 #E8A664`) · CTA pulse c/4s (2e) · cheer loop 4s en SemanaPasada perfecta · **skeleton de pozos + shimmer 1.2s** (estado ①8).
- [ ] **Step 6 — Reduced motion:** todo loop/partícula/transición pasa por el gate existente del repo (el de BrotMascot/BrotParticles; no importar `useReducedMotion` directo): RM activo → loops off, fades 150ms, `count 0`. Aplica también a T4/T5/T9.
- [ ] **Step 7:** `npx tsc --noEmit` + revisión visual contra el HTML. Commit: `feat(jardin): kit réplica de Mi jardín — hero, aros de crecimiento, semana pasada, logros y nota`

### Task 4: Kit réplica — Cierre de semana

**Files:** Create: `mobile/components/redesign/jardin/cierre-screen.tsx`
**Produces:** `CierreSemanaView({ mode, vm: CierreVM })` + `CierreFinalScreen` con las 4 variantes.

- [ ] **Step 1:** Transcribir HTML:624–1073. Común: kicker "CIERRE DE SEMANA" ls 0.22em → título 37/31px → chip → Brot 116–122 → fila 7 días → 3 tiles → card extra → CTA + link. Perfecta: full-bleed verde + halo 196px + partículas + 7 mini-Brots `cheer` 34 + card "¡LOGRO DESBLOQUEADO!" con medalla 48 (usa `MedalVM`, D3). Buena: tiles 38 inset con `wilted` en S/D + card "PRÓXIMO LOGRO" con barra. Floja: coach (`coach` 46). Cortada: L–S `wilted` + D `seed`.
- [ ] **Step 2:** Piezas propias: tile de **día en calma** (`zen` + verde profundo) y de **recuperado** (`seed` + coral `#F0B488`); línea "N días en calma" cuando `calmDays > 0`.
- [ ] **Step 3:** `npx tsc --noEmit` + commit: `feat(jardin): kit réplica del cierre de semana — perfecta, buena, floja y cortada`

### Task 5: Kit réplica — Logros + `medal.tsx`

**Files:** Create: `mobile/components/redesign/jardin/parts/medal.tsx`, `logros-screen.tsx`
**Produces:** `Medal({ vm: MedalVM, size, mode })` (las 5 ramas de `MedalVM`), `LogrosResumen`, `LogroRow`, `LogrosFinalScreen`.

- [ ] **Step 1:** `Medal` con las 5 ramas de `MedalVM` (§5): `brot` = disco radial verde + `BrotMascot` **sin clip**, con `translateY = BROT_INK_BLEED_TOP/2 × size/108` · `icon` = disco + `FilledAchievementIcon` dentro de un `<View>` interno con `overflow:'hidden'` + `borderRadius` (el clip se mueve ahí) · `progress` = pozo inset con el número actual · `locked` = pozo con "?" · `secret` = pozo profundo + "?" + candado SVG (`rect x4 y10 w16 h10 rx2.5` + `path M8 10V7a4 4 0 0 1 8 0v3`, stroke 2.6 round).
- [ ] **Step 2:** `logros-screen.tsx` (HTML:1079–1215): header (back + "Logros" 30/900 + "Tu jardín, medalla a medalla." + Brot `zen` 52 shadow=false) · card resumen (X de N + % + barra 12px + nudge) · section headers 10.5/900 ls 0.14em · filas por status: **unlocked** (medalla 54 + título + body + check 26 inset) · **inProgress CON barra** (pozo + barra 8px + "X/Y") · **inProgress SIN barra** (pozo + título + body, sin barra — son 9 de los 18 códigos, §4) · **secret** (card entera INSET + candado).
- [ ] **Step 3:** `LogrosFinalScreen` sembrada con el catálogo REAL de 18 (7 earned demo) para que el owner vea el mix D3 con los códigos verdaderos. Estados ④: próximo ≤2 días ("?" tiembla c/8s) · logro nuevo sin ver (dot naranja + pop) · colección completa (shine sweep 1 vez) · usuario nuevo (0 earned, siluetas).
- [ ] **Step 4:** `npx tsc --noEmit` + commit: `feat(jardin): kit réplica de Logros — mix de Brot e íconos, progreso y secretos`

### Task 6: Preview dev + gate

**Files:** Create: `mobile/screens/dev/redesign/redesign-jardin-preview-screen.tsx`, `app/(app)/settings/dev/redesign-jardin.tsx` · Modify: `redesign-index-screen.tsx`, `redesign-approval-status.ts`

- [ ] **Step 1:** Preview con chrome dev flotante (toggle 🌙/☀️, ciclador 🧪, ✕ — patrón de `redesign-gastos-preview-screen.tsx`, `GASTOS_SEEDS` + devChrome ~38–100) y `JARDIN_SEEDS` **cubriendo la matriz del Apéndice A**: `2a-vacio` · `2b-parcial` · `2c-completo` · `2d-floreciendo` · `2e-riesgo` · `2f-cortada` · `regando` (②2, con la animación por gasto) · `dia-en-calma` · `dia-perdido` · `cupo-excedido` (tono ámbar) · `semana-florecida` (②5) · `medianoche` (②7) · `primera-semana` (②9/③6, sin historial ni semana pasada) · `carga-skeleton` (①8) · `sheet-historial` · `cierre-perfecta` · `cierre-buena` · `cierre-floja` · `cierre-cortada` · `cierre-sin-ver` (③5) · `logros-18` · `logros-nuevo-sin-ver` (④2) · `logros-proximo` (④3) · `logros-completo` (④4) · `logros-usuario-nuevo` (④5) · `nota-descartada` (⑤2). `key={seed.key}` remonta.
- [ ] **Step 2:** Ruta con `__DEV__ + require()` + `<Redirect href="/(app)/settings" />` (copiar de `redesign-gastos.tsx`).
- [ ] **Step 3:** Entry en `ENTRIES` + `REDESIGN_APPROVAL['jardin'] = 'pendiente'`.
- [ ] **Step 4:** Smoke en device. Commit: `feat(jardin): preview dev del rediseño con seeds de la matriz — gate pendiente`

### Task 7: `crecimiento-model.ts` (TDD)

**Files:** Create: `mobile/features/garden/crecimiento-model.ts` · Test: `tests/unit/crecimiento-model.test.ts`
**Consumes:** `isoDay`, `fernSizeForAge` de `garden-model.ts`.

- [ ] **Step 1 (tests primero):**
```ts
import { describe, expect, it } from 'vitest'
import { fernSizeForAge } from '@/features/garden/garden-model'
import {
  ADELANTO_MAX, BONO_CALMA, agrupaGastosPorDia, deriveAdelanto, deriveDayRings, deriveHeroState,
  etapaPorHoras, fernSizeForHours, horasDeCrecimiento,
} from '@/features/garden/crecimiento-model'

const TZ = 'America/Argentina/Buenos_Aires'
const gasto = (iso: string, hour = 12, commitmentId: string | null = null) =>
  ({ created_at: `${iso}T${String(hour).padStart(2, '0')}:00:00-03:00`, created_by: 'u1', commitment_id: commitmentId })

describe('compatibilidad con la curva actual', () => {
  it('con adelanto 0 la etapa por horas es idéntica a la etapa por edad, a cualquier hora', () => {
    for (const [age, esperado] of [[0, 'seed'], [1, 'seed'], [2, 'germ'], [6, 'germ'], [7, 'fern'], [30, 'fern']] as const) {
      for (const hora of [0, 6, 12, 23.99]) {
        expect(etapaPorHoras(horasDeCrecimiento({ ageDays: age, horaLocal: hora, adelanto: 0 }))).toBe(esperado)
      }
    }
  })
  it('fernSizeForHours(24*a) === fernSizeForAge(a) para todo a >= 7', () => {
    for (const a of [7, 8, 12, 20, 26, 27, 60]) expect(fernSizeForHours(24 * a)).toBe(fernSizeForAge(a))
  })
  it('el adelanto ADELANTA la etapa: un día lleno germina al día siguiente', () => {
    expect(etapaPorHoras(horasDeCrecimiento({ ageDays: 1, horaLocal: 0, adelanto: ADELANTO_MAX }))).toBe('germ')
    expect(etapaPorHoras(horasDeCrecimiento({ ageDays: 1, horaLocal: 0, adelanto: 0 }))).toBe('seed')
  })
  it('el día en calma germina HOY MISMO — ningún día de gasto puede', () => {
    expect(etapaPorHoras(horasDeCrecimiento({ ageDays: 0, horaLocal: 12, adelanto: BONO_CALMA }))).toBe('germ')
    expect(etapaPorHoras(horasDeCrecimiento({ ageDays: 0, horaLocal: 23.9, adelanto: ADELANTO_MAX }))).toBe('seed')
  })
})

describe('deriveAdelanto', () => {
  it('sin registros → 0', () => {
    expect(deriveAdelanto({ registros: 0, marcadoSinGastos: false })).toBe(0)
  })
  it('6h por registro, tope 24h en 4 registros', () => {
    expect(deriveAdelanto({ registros: 1, marcadoSinGastos: false })).toBe(6)
    expect(deriveAdelanto({ registros: 4, marcadoSinGastos: false })).toBe(ADELANTO_MAX)
    expect(deriveAdelanto({ registros: 9, marcadoSinGastos: false })).toBe(ADELANTO_MAX)
  })
  it('el día en calma vale el DOBLE del techo por registros', () => {
    expect(deriveAdelanto({ registros: 0, marcadoSinGastos: true, discrecionales: 0 })).toBe(BONO_CALMA)
    expect(BONO_CALMA).toBe(2 * ADELANTO_MAX)
  })
  it('un día con pagos de fijos igual puede estar en calma (el server lo permite)', () => {
    expect(deriveAdelanto({ registros: 2, marcadoSinGastos: true, discrecionales: 0 })).toBe(BONO_CALMA)
  })
  it('marcado con force sobre un día CON gastos discrecionales: día completo, NO calma', () => {
    // el bonus doble no se farmea marcando un día que tuvo compras
    expect(deriveAdelanto({ registros: 3, marcadoSinGastos: true, discrecionales: 3 })).toBe(ADELANTO_MAX)
  })
  it('es monótono no decreciente en registros — registrar NUNCA baja el aro', () => {
    let prev = -1
    for (const r of [0, 1, 2, 3, 4, 5, 20]) {
      const v = deriveAdelanto({ registros: r, marcadoSinGastos: false })
      expect(v).toBeGreaterThanOrEqual(prev); prev = v
    }
  })
})

describe('agrupaGastosPorDia', () => {
  it('cuenta todos (espejo de familyActivityDays) y aparte los discrecionales', () => {
    const r = agrupaGastosPorDia([
      gasto('2026-08-10'), gasto('2026-08-10', 13, 'c1'),
      { ...gasto('2026-08-10'), created_by: null }, gasto('2026-08-09'),
    ], TZ)
    expect(r.todos.get('2026-08-10')).toBe(2)          // el fijo cuenta, el created_by null no
    expect(r.discrecionales.get('2026-08-10')).toBe(1) // el fijo no es discrecional
    expect(r.todos.get('2026-08-09')).toBe(1)
  })
})

describe('deriveDayRings', () => {
  const week = (i: number) => ['2026-08-10','2026-08-11','2026-08-12','2026-08-13','2026-08-14','2026-08-15','2026-08-16'][i]!
  const base = {
    counts: { todos: new Map<string, number>(), discrecionales: new Map<string, number>() },
    markedDaysIso: [] as string[], recoveredIso: new Set<string>(),
    todayIso: '2026-08-13', horaLocal: 15, tone: 'green' as const,
    startIso: null as string | null, weekDayIso: week,
  }
  const conGastos = (iso: string, n: number) => ({
    ...base,
    counts: { todos: new Map([[iso, n]]), discrecionales: new Map([[iso, n]]) },
  })
  it('pasados plantados van LLENOS (el backend ya contó el día)', () => {
    expect(deriveDayRings(conGastos('2026-08-10', 1))[0]).toMatchObject({ state: 'planted', pct: 1 })
  })
  it('hoy usa el pct del adelanto', () => {
    expect(deriveDayRings(conGastos('2026-08-13', 2))[3]).toMatchObject({ state: 'today', pct: 0.5 })
  })
  it('día marcado sin gastos discrecionales → calma', () => {
    const r = deriveDayRings({ ...base, markedDaysIso: ['2026-08-11'] })[1]!
    expect(r.state).toBe('calma')
    expect(r.noSpend).toBe(true)
  })
  it('marcado PERO con gastos discrecionales del hogar → planted, sin calma', () => {
    const r = deriveDayRings({ ...conGastos('2026-08-11', 2), markedDaysIso: ['2026-08-11'] })[1]!
    expect(r.state).toBe('planted')
    expect(r.noSpend).toBe(false)
  })
  it('HOY marcado en calma conserva state today PERO trae noSpend: la fila lo dibuja en calma', () => {
    const r = deriveDayRings({ ...base, markedDaysIso: ['2026-08-13'] })[3]!
    expect(r.state).toBe('today')
    expect(r.noSpend).toBe(true)
    expect(r.pct).toBe(1)
  })
  it('días previos al alta son pre, NUNCA missed (sin culpa)', () => {
    const r = deriveDayRings({ ...base, startIso: '2026-08-12' })
    expect(r[0]!.state).toBe('pre')
    expect(r[1]!.state).toBe('pre')
    expect(r[2]!.state).toBe('missed')
  })
  it('perdido, futuro y recuperado; el gasto orgánico le gana al recuperado', () => {
    const r = deriveDayRings(base)
    expect(r[0]!.state).toBe('missed')
    expect(r[4]!.state).toBe('future')
    expect(deriveDayRings({ ...base, recoveredIso: new Set(['2026-08-11']) })[1]).toMatchObject({ state: 'recovered', pct: 1 })
    expect(deriveDayRings({ ...conGastos('2026-08-11', 1), recoveredIso: new Set(['2026-08-11']) })[1]!.state).toBe('planted')
  })
  it('publica etapa y tamaño del brote por día (la fusión llega a la UI)', () => {
    // ageDays 3 (10 → 13 ago) + horaLocal 15 + adelanto 24 = 24*3 + 15 + 24 = 111h → germ
    const conAdelanto = deriveDayRings(conGastos('2026-08-10', 4))[0]!
    expect(conAdelanto.stage).toBe('germ')
    // el mismo día SIN adelanto: 24*3 + 15 = 87h → germ también, pero más chico
    const sinAdelanto = deriveDayRings(conGastos('2026-08-10', 1))[0]!
    expect(conAdelanto.brotSize).toBeGreaterThan(sinAdelanto.brotSize)
  })
  it('el día en calma arraiga ANTES que el día lleno de registros', () => {
    const week5 = (i: number) => ['2026-08-08','2026-08-09','2026-08-10','2026-08-11','2026-08-12','2026-08-13','2026-08-14'][i]!
    const b = { ...base, todayIso: '2026-08-13', horaLocal: 12, weekDayIso: week5 }
    // 2026-08-08 es ageDays 5: 120h + 12h = 132h base
    const calma = deriveDayRings({ ...b, markedDaysIso: ['2026-08-08'] })[0]!       // +48 = 180h → fern
    const lleno = deriveDayRings({ ...b, counts: { todos: new Map([['2026-08-08', 4]]), discrecionales: new Map([['2026-08-08', 4]]) } })[0]! // +24 = 156h → germ
    expect(calma.stage).toBe('fern')
    expect(lleno.stage).toBe('germ')
  })
  it('el tono se propaga a los aros', () => {
    expect(deriveDayRings({ ...base, tone: 'amber' })[3]!.tone).toBe('amber')
  })
})

describe('deriveHeroState', () => {
  const base = { currentStreak: 4, isBroken: false, streakBrokenAt: null as string | null, plantedToday: false, hourLocal: 12, todayIso: '2026-08-11' }
  it('plantado hoy: <7 plantado, >=7 floreciendo, y gana a la hora', () => {
    expect(deriveHeroState({ ...base, plantedToday: true })).toBe('plantado')
    expect(deriveHeroState({ ...base, plantedToday: true, currentStreak: 12 })).toBe('floreciendo')
    expect(deriveHeroState({ ...base, plantedToday: true, hourLocal: 22 })).toBe('plantado')
  })
  it('racha viva sin plantar: <20h aTiempo, >=20h enRiesgo; 00-04 arranca aTiempo', () => {
    expect(deriveHeroState(base)).toBe('aTiempo')
    expect(deriveHeroState({ ...base, hourLocal: 20 })).toBe('enRiesgo')
    expect(deriveHeroState({ ...base, hourLocal: 2 })).toBe('aTiempo')
  })
  it('rota reciente → cortada; vieja → empezar; sin racha → empezar', () => {
    const b = { ...base, currentStreak: 0, isBroken: true }
    expect(deriveHeroState({ ...b, streakBrokenAt: '2026-08-09T02:59:00Z' })).toBe('cortada')
    expect(deriveHeroState({ ...b, streakBrokenAt: '2026-07-20T02:59:00Z' })).toBe('empezar')
    expect(deriveHeroState({ ...base, currentStreak: 0 })).toBe('empezar')
  })
  it('isBroken heurístico (streakBrokenAt null) es la rotura MÁS fresca → cortada', () => {
    // use-streak.ts:251-256: la heurística prende antes de que el cron estampe streak_broken_at
    expect(deriveHeroState({ ...base, isBroken: true, streakBrokenAt: null })).toBe('cortada')
  })
})
```
> Nota: los literales de etapa de estos tests están calculados con la ecuación de §3.2 (`24×ageDays + horaLocal + adelanto`) y los umbrales 48/168. Si al implementar alguno no coincide, **recalculá la cuenta antes de tocar el modelo** — el test es la especificación, no una conjetura.

- [ ] **Step 2:** `npx vitest run tests/unit/crecimiento-model.test.ts` → FAIL.
- [ ] **Step 3:** Implementación:
```ts
import { isoDay } from './garden-model'

// §3 — El brote crece con el reloj (24 h/día) y registrar adelanta horas.
export const HORAS_POR_DIA = 24
export const AGUA_POR_REGISTRO = 6     // cada gasto registrado
export const ADELANTO_MAX = 24         // 4 registros = un día entero de adelanto
export const BONO_CALMA = 48           // D4: el día sin gastos crece el DOBLE del techo
export const UMBRAL_GERM_HORAS = 48    // = 2 días, idéntico al umbral actual
export const UMBRAL_FERN_HORAS = 168   // = 7 días, idéntico al umbral actual
const HORA_RIESGO = 20
const DIAS_CORTADA_VISIBLE = 7
const MS_DIA = 86_400_000
const WEEK_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const

export type EtapaCrecimiento = 'seed' | 'germ' | 'fern'
export type DayRingState = 'pre' | 'future' | 'today' | 'planted' | 'calma' | 'missed' | 'recovered'
export type RingTone = 'green' | 'amber' | 'water'
export interface DayRing {
  iso: string; letter: string; state: DayRingState; pct: number; tone: RingTone
  noSpend: boolean; stage: EtapaCrecimiento; brotSize: number; isToday: boolean
}
export type HeroState = 'empezar' | 'aTiempo' | 'plantado' | 'floreciendo' | 'enRiesgo' | 'cortada'
export interface CountsPorDia { todos: Map<string, number>; discrecionales: Map<string, number> }

export function horasDeCrecimiento(a: { ageDays: number; horaLocal: number; adelanto: number }): number {
  return HORAS_POR_DIA * a.ageDays + a.horaLocal + a.adelanto
}

export function etapaPorHoras(h: number): EtapaCrecimiento {
  if (h < UMBRAL_GERM_HORAS) return 'seed'
  if (h < UMBRAL_FERN_HORAS) return 'germ'
  return 'fern'
}

/** Espejo horario de fernSizeForAge (0.4 px/día = 1/60 px/hora). No alimenta la UI
 *  —el tamaño en pantalla lo da brotSizeForHours—: existe como PRUEBA EJECUTABLE de
 *  que el modelo horario reproduce la curva de tamaño actual, y como fuente para
 *  cualquier superficie futura que quiera la escala original de 24→32 px. */
export function fernSizeForHours(h: number): number {
  return Math.round(24 + Math.min(Math.max((h - UMBRAL_FERN_HORAS) / 60, 0), 8))
}

/** Tamaño del Brot en el pozo de 28: CONTINUO en horas (rango 15–20 de ringDay).
 *  Continuo y no por etapa para que el adelanto se vea como crecimiento sostenido
 *  y no se pierda dentro de una banda de 120 h. */
export function brotSizeForHours(horas: number): number {
  const t = Math.min(Math.max(horas / UMBRAL_FERN_HORAS, 0), 1)
  return Math.round((15 + t * 5) * 10) / 10
}

/** El día en calma vale el doble SOLO si de verdad no hubo gastos discrecionales:
 *  el server acepta marcar con `force` un día que ya tiene gastos (y el FAB y el
 *  calendario ofrecen ese camino), y en ese caso el día no es "en calma". */
export function deriveAdelanto(a: {
  registros: number
  marcadoSinGastos: boolean
  discrecionales?: number
}): number {
  const enCalma = a.marcadoSinGastos && (a.discrecionales ?? 0) === 0
  if (enCalma) return BONO_CALMA                   // D4: el único que supera el techo
  if (a.marcadoSinGastos) return ADELANTO_MAX      // marcado con force: día completo, no calma
  if (a.registros <= 0) return 0
  return Math.min(ADELANTO_MAX, AGUA_POR_REGISTRO * a.registros)
}

/** Counts por día local. `todos` es el espejo EXACTO del filtro de familyActivityDays
 *  (incluye pagos de fijos, excluye created_by null). `discrecionales` excluye además
 *  commitment_id — es la definición de "sin gastos" del server (mark_no_expense_day). */
export function agrupaGastosPorDia(
  expenses: ReadonlyArray<{ created_at: string; created_by: string | null; commitment_id?: string | null }>,
  tz: string,
): CountsPorDia {
  const todos = new Map<string, number>()
  const discrecionales = new Map<string, number>()
  for (const e of expenses) {
    if (!e.created_by) continue
    const iso = isoDay(new Date(e.created_at), tz)
    todos.set(iso, (todos.get(iso) ?? 0) + 1)
    if (!e.commitment_id) discrecionales.set(iso, (discrecionales.get(iso) ?? 0) + 1)
  }
  return { todos, discrecionales }
}

export function deriveDayRings(a: {
  counts: CountsPorDia
  markedDaysIso: readonly string[]
  recoveredIso: ReadonlySet<string>
  todayIso: string
  horaLocal: number
  tone: RingTone
  /** primer día del jardín (alta de la cuenta): antes de esto nada es "perdido" */
  startIso: string | null
  weekDayIso: (i: number) => string
}): DayRing[] {
  const marked = new Set(a.markedDaysIso)
  const todayN = Math.round(Date.parse(`${a.todayIso}T00:00:00Z`) / MS_DIA)
  return WEEK_LETTERS.map((letter, i) => {
    const iso = a.weekDayIso(i)
    const isToday = iso === a.todayIso
    const registros = a.counts.todos.get(iso) ?? 0
    const discrecionales = a.counts.discrecionales.get(iso) ?? 0
    const marcado = marked.has(iso)
    const planted = registros > 0 || marcado
    const noSpend = marcado && discrecionales === 0
    const adelanto = deriveAdelanto({ registros, marcadoSinGastos: marcado, discrecionales })
    const ageDays = todayN - Math.round(Date.parse(`${iso}T00:00:00Z`) / MS_DIA)
    const horas = horasDeCrecimiento({ ageDays, horaLocal: a.horaLocal, adelanto })
    const stage = etapaPorHoras(horas)

    let state: DayRingState
    let pct: number
    if (iso > a.todayIso) { state = 'future'; pct = 0 }
    else if (a.startIso !== null && iso < a.startIso) { state = 'pre'; pct = 0 }
    // HOY conserva su estado propio (pozo con tinte + label HOY del handoff), pero
    // `noSpend` viaja aparte para que el día marcado se dibuje en calma también hoy.
    else if (isToday) { state = 'today'; pct = Math.min(1, adelanto / ADELANTO_MAX) }
    // Orden logged-first, espejo de deriveGardenCells:166-169
    else if (planted) { state = noSpend ? 'calma' : 'planted'; pct = 1 }
    else if (a.recoveredIso.has(iso)) { state = 'recovered'; pct = 1 }
    else { state = 'missed'; pct = 0 }

    return { iso, letter, state, pct, tone: a.tone, noSpend, stage, brotSize: brotSizeForHours(horas), isToday }
  })
}

export function deriveHeroState(a: {
  currentStreak: number
  isBroken: boolean
  streakBrokenAt: string | null
  plantedToday: boolean
  hourLocal: number
  todayIso: string
}): HeroState {
  if (a.plantedToday) return a.currentStreak >= 7 ? 'floreciendo' : 'plantado'
  if (a.isBroken) {
    // streakBrokenAt null = rama heurística de isBroken (use-streak.ts:251-256):
    // el cron aún no estampó la rotura ⇒ es la más fresca posible.
    if (!a.streakBrokenAt) return 'cortada'
    const brokenMs = Date.parse(a.streakBrokenAt)
    const todayMs = Date.parse(`${a.todayIso}T00:00:00Z`)
    const reciente = Number.isFinite(brokenMs) && todayMs - brokenMs <= DIAS_CORTADA_VISIBLE * MS_DIA
    return reciente ? 'cortada' : 'empezar'
  }
  if (a.currentStreak <= 0) return 'empezar'
  // 00–04: el día NUEVO recién arranca. La banda `critical` de resolveAtRiskIntensity
  // cubre 20–04 para el copy de Home; acá el riesgo se corta a medianoche.
  return a.hourLocal >= HORA_RIESGO ? 'enRiesgo' : 'aTiempo'
}
```
- [ ] **Step 4:** Tests verdes + `npx vitest run tests/unit/garden-model.test.ts` sin regresión. Commit: `feat(jardin): modelo de crecimiento — horas, adelanto por registro y día en calma`

### Task 8: Progreso, secretos y medallas de logros (TDD)

**Files:** Create: `mobile/features/achievements/achievement-progress.ts` · Test: `tests/unit/achievement-progress.test.ts`

- [ ] **Step 1 (tests primero):**
```ts
import { describe, expect, it } from 'vitest'
import { deriveAchievementProgress, isSecretAchievement, medalForCode, splitLogros } from '@/features/achievements/achievement-progress'

describe('deriveAchievementProgress', () => {
  const s = { currentStreak: 12, cycleNoSpendCount: 5 }
  it('streak_N usa currentStreak clampado', () => {
    expect(deriveAchievementProgress('streak_30', s)).toEqual({ current: 12, target: 30 })
    expect(deriveAchievementProgress('streak_7', s)).toEqual({ current: 7, target: 7 })
  })
  it('no_spend_cycle_N usa las marcas del ciclo; sin ventana → null', () => {
    expect(deriveAchievementProgress('no_spend_cycle_15', s)).toEqual({ current: 5, target: 15 })
    expect(deriveAchievementProgress('no_spend_cycle_15', { ...s, cycleNoSpendCount: null })).toBeNull()
  })
  it('sin fuente confiable → null (lifetime capado, goals, binarios)', () => {
    for (const c of ['no_spend_lifetime_50', 'goal_25', 'goal_completed', 'first_expense', 'first_cycle_under_budget'])
      expect(deriveAchievementProgress(c, s)).toBeNull()
  })
})

describe('isSecretAchievement', () => {
  it('legendary locked es secreto; earned o no-legendary no', () => {
    expect(isSecretAchievement({ tier: 'legendary', earned: false })).toBe(true)
    expect(isSecretAchievement({ tier: 'legendary', earned: true })).toBe(false)
    expect(isSecretAchievement({ tier: 'gold', earned: false })).toBe(false)
  })
})

describe('medalForCode (D3)', () => {
  it('los 4 hitos del jardín llevan Brot con su pose — SOLO desbloqueados', () => {
    expect(medalForCode('first_expense', true)).toEqual({ kind: 'brot', pose: 'seed' })
    expect(medalForCode('goal_completed', true)).toEqual({ kind: 'brot', pose: 'cheer' })
    expect(medalForCode('streak_90', true)).toEqual({ kind: 'brot', pose: 'radiant' })
    expect(medalForCode('no_spend_lifetime_50', true)).toEqual({ kind: 'brot', pose: 'zen' })
  })
  it('bloqueado NUNCA es Brot: no existe Brot en gris (D3)', () => {
    expect(medalForCode('first_expense', false)).toEqual({ kind: 'icon', code: 'first_expense', earned: false })
  })
  it('el resto usa el ícono existente, con su code y su estado', () => {
    expect(medalForCode('streak_7', true)).toEqual({ kind: 'icon', code: 'streak_7', earned: true })
    expect(medalForCode('no_spend_cycle_7', false)).toEqual({ kind: 'icon', code: 'no_spend_cycle_7', earned: false })
  })
})

describe('splitLogros', () => {
  const items = [
    { code: 'first_expense', tier: 'bronze', earned: true, sort_order: 10 },
    { code: 'streak_7', tier: 'bronze', earned: false, sort_order: 50 },
    { code: 'goal_25', tier: 'bronze', earned: false, sort_order: 96 },
    { code: 'streak_90', tier: 'legendary', earned: false, sort_order: 90 },
    { code: 'no_spend_lifetime_50', tier: 'legendary', earned: false, sort_order: 223 },
  ]
  const r = () => splitLogros(items, { currentStreak: 3, cycleNoSpendCount: 0 })
  it('particiona sin solapamiento ni pérdidas', () => {
    const s = r()
    expect(s.unlocked.map((i) => i.code)).toEqual(['first_expense'])
    expect(s.inProgress.map((i) => i.code)).toEqual(['streak_7', 'goal_25'])
    expect(s.secret.map((i) => i.code)).toEqual(['streak_90', 'no_spend_lifetime_50'])
    expect(s.unlocked.length + s.inProgress.length + s.secret.length).toBe(items.length)
  })
  it('las filas sin fuente de progreso van SIN barra', () => {
    expect(r().inProgress.find((i) => i.code === 'goal_25')?.progress).toBeUndefined()
    expect(r().inProgress.find((i) => i.code === 'streak_7')?.progress).toEqual({ current: 3, target: 7 })
  })
  it('el nudge es el de mayor avance relativo', () => {
    expect(r().nudgeCode).toBe('streak_7')
  })
})
```
- [ ] **Step 2:** FAIL → implementar: `STREAK_TARGETS {7,14,30,60,90}` y `NO_SPEND_CYCLE_TARGETS {3,7,15}`, todo lo demás `null`. `isSecretAchievement = tier === 'legendary' && !earned`. `medalForCode(code, earned)` con el mapa de D3: los 4 códigos de Brot **solo si `earned`**, todo lo demás (y los 4 bloqueados) `{kind:'icon', code, earned}`. `splitLogros` ordena por `sort_order` dentro de cada sección, secretos al final, aplica la regla status→rama de §5 para llenar `medal`, y devuelve `nudgeCode` = el `inProgress` con mayor `current/target` (empate: menor `sort_order`; si ninguno tiene progreso, el primer locked por `sort_order`).
- [ ] **Step 3:** Verde + commit: `feat(logros): progreso, secretos y mix de medallas — sin cambios de schema`

---

> ## 🚦 GATE DEL OWNER — nada de lo que sigue se ejecuta sin el flip `REDESIGN_APPROVAL['jardin'] = 'aprobada'`
>
> Mostrar el preview (T6) al owner en device, claro y oscuro. Las 6 decisiones ya están aplicadas; lo que se valida visualmente es: el modelo de crecimiento en acción (aro 25/50/100%, tono ámbar al pasarse del cupo, el día en calma germinando en el acto), el mix de medallas con los códigos reales, los 8 estados ⚠ resueltos con propuesta propia, y las piezas sin fuente de diseño (acción "Marcar día sin gastos", "×" de la nota, sheet oscuro, token de calma). Al aprobar: flip con comentario fechado citando al owner, como en `redesign-approval-status.ts:56-60`.

---

### Task 9: Cableado de Mi jardín

**Files:** Modify: `mobile/features/garden/garden-model.ts`, `use-garden.ts`, `use-streak.ts`, `mobile/screens/garden/garden-screen.tsx` · Create: `mobile/hooks/use-minute-tick.ts`

- [ ] **Step 1:** `garden-model.ts` — agregar `familyActivityWithCounts(expenses, markedDaysIso, tz): { activity: Set<string>; counts: CountsPorDia }` en UNA sola pasada; `familyActivityDays` queda como wrapper que devuelve `.activity` (los 5 tests de `garden-family-activity.test.ts` siguen verdes sin tocarlos). Así el aro y la racha no pueden divergir: misma pasada, mismo filtro.
- [ ] **Step 2:** `use-streak.ts` — `fetchMarkedDays` amplía el select a `marked_date, marked_at`; exponer `markedDayTimes: Map<string,string>` junto al `markedDaysIso` actual (shape retro-compatible).
- [ ] **Step 3:** `use-minute-tick.ts` — `useMinuteTick(): Date` con interval 60s + listener `AppState` 'active'. Se monta SOLO en la pantalla del jardín y se pasa como **tercer parámetro OPCIONAL**: `useGarden(familyId, userId, now?: Date)` con default `new Date()`, agregándolo a las deps del `useMemo` (`use-garden.ts:133`, que hoy no tiene ninguna dep de reloj). Opcional porque hay **5 call sites que pasan 2 argumentos** y no se tocan: `neo-home-screen.tsx:693`, `streak-week-widget.tsx:43`, `home-dashboard.tsx:237`, `week-close-bridge.tsx:20`, `garden-screen.tsx:43`. Sin el parámetro, el tick solo re-renderiza y los aros quedan pegados en el día viejo tras medianoche (matriz ②7).
- [ ] **Step 4:** `use-garden.ts` — exponer en `GardenData`: `adelantoHoy`, `pctHoy`, `marcadoHoy` (de `streak.data.hasMarkedNoExpenseToday`, que ya existe en `use-streak.ts:238`), `dayRings` (`deriveDayRings` con `startIso = firstActivityIso`), `historyWeeks` (hasta 4 semanas previas con dots `full|calma|missed|recovered|pre`, `null` si `weeksShown <= 1`). ⚠️ **El `tone` NO se calcula acá** (§3.3): `useGarden` lo recibe como parámetro opcional `tone?: RingTone` con default `'water'`. Meter `useHomeMetrics` en este hook cargaría media Home en las 5 tabs vía `WeekCloseBridge` y ni siquiera compila (`useHomeMetrics(familyId: string)` no acepta el `undefined` que le pasa `streak-week-widget.tsx:43`). **Costo**: el memo de counts depende de `expenses`, NO del reloj.
- [ ] **Step 5:** Recomponer `garden-screen.tsx` con los sub-componentes del kit. **La grilla del mes (`GardenGrid`) y el hero de stats (`GardenHero`) salen de la pantalla** (§3.5: el handoff no los tiene; los reemplazan la fila de 7 y el historial). El `tone` se calcula acá con los campos de `HomeHeroMetrics` (`spentToday > openingDailyBudget → 'amber'`, sin datos → `'water'`) y se pasa a `useGarden`.
  - `heroVM` desde `deriveHeroState` + copys `garden:hero2.*`. **`plantedToday` := `pctHoy > 0 || marcadoHoy`** (fuente optimista, la misma que mueve el aro) — NUNCA `hasLoggedToday` del server, que llega un beat tarde y rompería el pop de 2c.
  - `crecimientoVM` desde `pctHoy`/`dayRings` con la tabla de poses de §5; chips de §3.4 (la hora sale de `markedDayTimes` para "Marcado hoy a las {{time}}").
  - CTAs: "Registrar un gasto" → add-flow; secundario **"Marcar día sin gastos"** solo con 0 gastos discrecionales hoy → `useMarkNoExpenseDay`, y en `onError EXPENSES_EXIST_ON_DATE` abre el `NoSpendConfirmSheet` existente y reintenta con `force: true` (patrón de `add-expense-tab-button.tsx:176-182`); al éxito, `confetti.celebrate()` (D4).
  - `SemanaPasadaCard` (T10) · `LogrosAccessCard` (T11) · `NotaEducativa` con `garden_note_dismissed_${userId}`, visible solo si `weeksShown <= 2`, "×" con fade + collapse 250ms · `HistorialSheet`.
- [ ] **Step 6:** Animaciones: crossfade copy 200ms + swap Brot scale 0.9→1 250ms al cambiar `heroVM.kind` · por gasto nuevo: dashoffset 600ms + gota celeste 400ms + wiggle + count-up (`CountUpText`, formateo en worklet SIN `Intl`) · viraje a verde 500ms + ripple al 100% · pop spring + burst one-shot de 12 partículas al volver de un registro (①3) · cambio de tono con `interpolateColor` 300ms · skeleton + shimmer 1.2s · stagger 60ms de entrada (RiseView) · todo bajo el gate de reduced motion.
- [ ] **Step 7:** `npx tsc --noEmit` + suite completa + `npx expo export --platform ios`. QA en device: registrar un gasto → +25%; cuarto gasto → 100% y viraje; pasarse del cupo → el aro se pone ámbar sin bajar; marcar día sin gastos → 100% doble anillo + Brot `zen` + confetti, y el brote pasa a `germ` en el acto. Commit: `feat(jardin): Mi jardín cableada — crecimiento por horas, hero de estados e historial`

### Task 10: Cierre de semana — remap a 4 variantes + cableado

**Files:** Modify: `mobile/features/garden/garden-model.ts` (`weekCloseCopy`, `deriveWeekClose`, tipo `WeekClose`), `use-garden.ts` (llamador), `week-close-banner.tsx` (`poseForScore`), `week-close-celebration.tsx` (`labelColorForScore`), `mobile/features/onboarding-intro/illustrative-data.ts` (`INTRO_WEEK_CLOSE`), `mobile/lib/i18n/locales/{es,en}/garden.json` · Create: `mobile/features/garden/use-week-close-seen.ts` · Test: `tests/unit/garden-model.test.ts`

- [ ] **Step 1 (test primero):** cortes nuevos y el campo `variant`: 7→`perfecta` (bloom true) · 6,5→`buena` · 4,3,2→`floja` · 1,0 **con racha muerta**→`cortada` · 1,0 **con racha viva**→`floja`. FAIL.
- [ ] **Step 2:** `WeekClose` gana `variant: WeekCloseVariant` (§5) y conserva `stage`/`bloom` (los consume `week-close-celebration.tsx` y el preview de la intro). `weekCloseCopy(score, opts?: { streakAlive?: boolean })` con los 4 tramos + la guarda: **score ≤1 no implica racha cortada** — si la única actividad fue el domingo, la racha cruza viva al lunes y decir "Tu racha se cortó" mentiría. `deriveWeekClose` gana un 4º parámetro `opts` y `use-garden.ts:127` le pasa `{ streakAlive: !streak.data.isBroken && streak.data.currentStreak > 0 }`. Keys nuevas `garden:weekClose.{perfecta,buena,floja,cortada}.{label,title,sub}`, borrando los 5 grupos viejos. Copys ES en tuteo. EN en el mismo commit.
- [ ] **Step 3:** `WeekClose.days` gana `calma: boolean` con la MISMA regla que `deriveDayRings` (`marcado && discrecionales === 0`). Hoy es imposible derivarlo desde afuera: `familyActivityDays` funde marcas y gastos en un solo Set (`garden-model.ts:74`), así que un día marcado es indistinguible de uno con gastos dentro de `weekClose.days`. Por eso `deriveWeekClose` recibe también `markedDaysIso` y los counts discrecionales. Sin esto, la línea "N días en calma" y los tiles `zen` del cierre no tienen fuente. Con test.
- [ ] **Step 4:** `useWeekCloseSeen(userId, weekCloseId)`. **La semántica del bridge CAMBIA**: hoy marca "visto" en el auto-disparo, ANTES de mostrar (`week-close-bridge.tsx:33-36`), con lo cual el dot "sin ver" nunca prendería. Nuevo contrato: `garden_week_close_shown_${userId}` (lo escribe el bridge, mantiene el 1×/semana) + el `seen` real que se escribe al CERRAR la celebración.
- [ ] **Step 5:** `SemanaPasadaCard` en el jardín (variante de `weekClose.variant`, `unseenDot = !seen`, oculta la primera semana) y `CierreVM` real: `days` desde `weekClose.days` (ya con `calma` del Step 3) · `calmDays` = los `calma` de esa semana · stats con **`currentStreak` real, nunca el literal 0** del mock · `unlocked` = logro con `earned_at` dentro de [lunes, domingo] + su `MedalVM` · `nextGoal` = el nudge de T8 · CTAs. Las poses por variante las define la `CierreSemanaView` del kit (T4) — **no** se tocan `poseForScore` ni `labelColorForScore`, que viven en los dos componentes que esta tarea deja sin caller (`week-close-banner.tsx:22`, `week-close-celebration.tsx:64`) y que T13 retira. El bridge abre la `CierreSemanaView` nueva; `ConfettiBurst`/haptics como hoy. Conservar el takeover absoluto zIndex 999 y su anclaje a tokens oscuros con la validación AA documentada (`week-close-celebration.tsx:29-69`).
- [ ] **Step 6:** Suite COMPLETA + QA de las 4 variantes por seeds. Commit: `feat(jardin): cierre de semana en 4 variantes — días en calma, guarda de racha viva y dot sin-ver`

### Task 11: Cableado de Logros

**Files:** Modify: `mobile/screens/settings/achievements-gallery-screen.tsx`, `mobile/components/achievements/badge-detail-sheet.tsx`, `mobile/screens/garden/garden-screen.tsx`

- [ ] **Step 1:** `/settings/achievements` compone `LogrosResumen` + secciones desde `useAchievements(userId)` + `splitLogros` con `ProgressSources` reales: `currentStreak` de `useStreak`; `cycleNoSpendCount` desde **`home_snapshot.no_spend_days_this_cycle`** (la fuente cycle-scoped canónica que ya usa Gastos — `neo-gastos-screen.tsx:1236-1241` advierte explícitamente que NO se use el placeholder del streak, y es además la ventana que usa el server para otorgar `no_spend_cycle_*`). El campo es **opcional** (`use-home-snapshot.ts:144`, back-compat): usar `?? null`, **nunca `?? 0`** — con 0 se dibujarían barras "0 de 15" falsas mientras el snapshot carga, y `null` es lo que hace que la fila salga sin barra. Conservar skeleton, `NeoStateBlock` con retry y `BadgeDetailSheet` al tap (los secretos NO abren sheet).
- [ ] **Step 2:** Aplicar el fix de clip de D3 en la galería y en el sheet: mover `overflow:'hidden'` a un View interno que envuelva solo al `FilledAchievementIcon`.
- [ ] **Step 3:** `LogrosAccessCard` en el jardín: 2 últimas medallas earned (`earned_at` desc, vía `medalForCode`) + `{kind:'locked'}` si queda algún locked; "N de 18 · próximo: {nudge}"; tap → `/settings/achievements`. Estados ④: logro nuevo sin ver (flag `achievements_last_seen_count_${userId}` vs `earnedCount`), colección completa, usuario nuevo.
- [ ] **Step 4:** Suite + QA en device con cuenta real (7+ earned) y cuenta nueva (0 earned); verificar que las medallas con Brot NO estén recortadas. Commit: `feat(logros): pantalla nueva cableada al catálogo de 18 + acceso desde el jardín`

### Task 12: Pase i18n + copy definitivo

**Files:** Modify: `mobile/lib/i18n/locales/{es,en}/garden.json`, `{es,en}/achievements.json`, `es/home.json`, `es/fijos.json` + los componentes cableados

- [ ] **Step 1:** Keys nuevas: `garden:hero2.*` (6 estados × label/title/sub/chip/cta) · `garden:crecimiento.*` (chips de §3.4, leyenda, CTAs, "Marcado hoy a las {{time}}", "Día en calma", tono de cupo) · `garden:cierre.*` (kicker, labels de los 3 tiles, "¡LOGRO DESBLOQUEADO!", "PRÓXIMO LOGRO", coach, CTA + link secundario, "N días en calma") · `garden:historial.*` · `garden:semanaPasada.*` · `garden:nota.*` · `achievements:screen.*` (subtítulo "Tu jardín, medalla a medalla.", secciones, nudge, secretos). Todo en tuteo neutro; EN en el mismo commit.
- [ ] **Step 2:** Aplicar las 8 correcciones de voseo de D1.
- [ ] **Step 3:** Borrar las keys huérfanas de `garden.json` (ES y EN) verificando antes con grep que sigan sin consumidores: `card.legendToggleLabel`, `card.legendToggle`, `legend.{seed,growing,rooted,bloom,skipped}`, `hero.sub`, y —una vez que T13 retire los componentes viejos— `weekCloseBanner.{a11y,sub,chip}` y `hero.{label,unit,streakA11y,statGarden,statRecord,statSeeds}` (los consumía `garden-hero.tsx`). **NO tocar** `weekCloseCelebration.count`/`.eyebrow`: los consume `intro-slides.tsx:635,638`; migrar `weekCloseCelebration.closeLabel`/`.continue` a las keys nuevas del cierre en el mismo commit.
- [ ] **Step 4:** **Suite completa** + `npx expo export --platform ios`. Commit: `feat(jardin): pase i18n del rediseño y limpieza de voseo residual`

### Task 13: Limpieza + docs en sync

**Files:** Create: `mobile/components/garden/day-brot.tsx` · Delete (tras verificar con grep): `sprout.tsx`, `week-close-banner.tsx`, `week-close-celebration.tsx`, `garden-grid.tsx`, `garden-hero.tsx` · Modify: `mobile/components/redesign/garden/garden-spec.ts`, `docs/sistemas/jardin-rachas.md`

- [ ] **Step 1:** `grep -rn` de cada candidato antes de borrar.
  - `sprout.tsx` ya está sin importadores hoy.
  - **`week-close-celebration.tsx` no se puede borrar de una**: `intro-slides.tsx:29` importa `DayBrot` y `poseForDay` para la intro pre-auth (:657). Extraer esos dos exports a `mobile/components/garden/day-brot.tsx`, apuntar la intro ahí, y recién entonces borrar el resto.
  - `garden-grid.tsx` y `garden-hero.tsx` quedan sin caller tras T9 Step 5 (§3.5): verificar con grep y borrar. Eso se lleva también a `PoppingBrot` (muerto hoy: nadie pasa `justPlantedToday`).
- [ ] **Step 1b:** `garden-spec.ts` — el jardín nuevo usa `jardin-spec.ts`, pero `GARDEN_GEOMETRY` sigue siendo load-bearing para el `day-brot.tsx` extraído (`weekCloseBrotSize`) y para lo que quede de la intro. Mover esas constantes a `day-brot.tsx` o conservar el archivo podado a las claves con caller — **verificar con grep antes**, no borrarlo entero (rompería la intro pre-auth).
- [ ] **Step 2:** Actualizar `docs/sistemas/jardin-rachas.md`: el modelo de crecimiento en horas (§3 — reemplaza la sección de curva por edad, que hoy transcribe `seed ≤1 / germ 2-6 / fern ≥7` y el `24→32px`), los 4 tramos del cierre, el día en calma y la vista nueva. **Mismo commit** que el código (regla del repo).
- [ ] **Step 3:** Suite + commit: `chore(jardin): limpieza post-rediseño + docs del sistema al día`

### Task 14: QA en device — matriz de 35 estados

- [ ] **Step 1:** Correr el Apéndice A contra el preview (seeds) y contra el live con la cuenta dev: hero 2a–2f (2e forzando hora), aro 0/1/2/4 registros, tono ámbar, día en calma (germina en el acto), medianoche (cambiar fecha del device), primera semana, historial, semana pasada ×4 + dot sin-ver, cierre ×4, logros (18 reales, nuevo-sin-ver, próximo ≤2 días, completo, usuario nuevo), nota (visible/descartada).
- [ ] **Step 2:** Casos de reversibilidad (§3.3): **borrar un gasto** desde Home/Gastos con el aro en 100% → baja a 75% sin animación rota; **desmarcar el día en calma** desde el day-detail del calendario (`neo-gastos-screen.tsx:2151`) → el aro vuelve a 0% y el brote a `seed`. Ambos son consecuencia esperada de deshacer, pero se verifica que la transición no quede a medias.
- [ ] **Step 3:** Transversales: tema claro/oscuro · reduced motion (loops off, sin partículas) · Android API<29 (fallbacks inset) · Android gama baja (sin jank) · edge-to-edge · medallas con Brot sin recortar.
- [ ] **Step 3:** Registrar hallazgos; los visuales van al owner con screenshots.

### Task 15 (OPCIONAL): logros "Jardín de 10/50/100" y "Dos ediciones"

**Files:** Create: `supabase/migrations/<ts>_garden_total_achievements.sql` · Modify: registries de íconos, `achievements.json` ES/EN, `achievement-progress.ts`

- [ ] **Step 1:** Migración: INSERT en `achievements_catalog` (`garden_10`/`garden_50`/`garden_100` bronze/silver/gold, `two_editions` silver, sort_order 91–95) + trigger `family_garden_total_milestones` AFTER UPDATE OF `total_days_logged` ON `family_streaks` (cruce hacia arriba de `[10,50,100]`, otorga a miembros no-blocked — espejo de `tr_award_family_streak_milestones`) + trigger sobre `monthly_summaries` para `two_editions`. SECURITY DEFINER + best-effort + lockdown como los existentes.
- [ ] **Step 2:** **NO aplicar a prod por MCP** (re-estampa timestamps y desalinea el ledger). Probar en staging (`loyhlbemrrcenwejfsfq`) con DO-block + rollback.
- [ ] **Step 3:** Íconos: `scripts/gen-filled-icons.mjs` **no existe en el repo** (el header de `achievement-icon-filled.tsx` lo cita pero nunca se commiteó) → agregar las entradas del registry FILLED a mano o recrear el generador; los SVG fuente los provee el owner. Extender `deriveAchievementProgress` con `garden_N` sobre `totalDaysLogged`. Caveat: el catálogo está cacheado 10 min — un unlock de un code recién agregado puede tragarse la celebración hasta invalidar.
- [ ] **Step 4:** Suite + commit: `feat(logros): hitos de jardín acumulado y ediciones`

---

## Apéndice A · Matriz 35 estados → fuente / tarea / seed

| # | Estado | Fuente | Tarea | Seed |
|---|---|---|---|---|
| ①1–6 | Hero 2a–2f | `deriveHeroState` | T3/T9 | `2a-vacio`, `2b-parcial`, `2c-completo`, `2d-floreciendo`, `2e-riesgo`, `2f-cortada` |
| ①7 | Transición | crossfade + swap a nivel layout | T9 | — |
| ①8 ⚠ | Carga | skeleton de pozos + shimmer (propio) | T3/T9 | `carga-skeleton` |
| ②1–3 | Aro sin/con riego, completo | `deriveAdelanto` | T3/T9 | `2a-vacio`,`regando`,`2c-completo` |
| ②4 | Día sin gastos | flag `noSpend` + `BONO_CALMA` | T3/T9 | `dia-en-calma` |
| ②5 | Semana florecida | 7/7 plantados (`bloom` intacto) | T3/T9 | `semana-florecida` |
| ②6 ⚠ | Día perdido | `state:'missed'` (track 0 + `wilted` 45%) | T3 | `dia-perdido` |
| ②7 | Medianoche | `useMinuteTick` → `now` a `useGarden` | T9 | `medianoche` |
| ②8 | Historial sheet | `historyWeeks` | T3/T9 | `sheet-historial` |
| ②9 ⚠ | Primera semana | `weeksShown <= 1` → history `null` | T9 | `primera-semana` |
| ③1–4 | Semana pasada ×4 | `weekClose.variant` | T10 | `cierre-*` |
| ③5 ⚠ | Cierre sin ver | `useWeekCloseSeen` (shown ≠ seen) | T10 | `cierre-sin-ver` |
| ③6 | Primera semana | `weekCloseAvailable === false` | T10 | `primera-semana` |
| ④1 | Logros normal | catálogo 18 + `splitLogros` | T11 | `logros-18` |
| ④2 ⚠ | Logro nuevo sin ver | flag de count visto | T11 | `logros-nuevo-sin-ver` |
| ④3 | Próximo ≤2 días | `target - current <= 2` | T5/T11 | `logros-proximo` |
| ④4 ⚠ | Colección completa | `earned === total` | T5/T11 | `logros-completo` |
| ④5 ⚠ | Usuario nuevo | `earned === 0` | T5/T11 | `logros-usuario-nuevo` |
| ⑤1–2 | Nota / descartada ⚠ | "×" propio + AsyncStorage + collapse 250ms | T3/T9 | `nota-descartada` |
| ⑥1–5 | Transversales | press/partículas/RM/tema/stagger | T3–T5, T14 | — |

## Apéndice B · Animaciones → implementación

| Animación | Implementación | Gotcha |
|---|---|---|
| Aro dashoffset 600ms ease-out | `useAnimatedProps` + `withTiming` | `Easing` de reanimated; cast svg |
| Cambio de tono (verde↔ámbar) 300ms | `interpolateColor` del stroke | UI thread |
| Count-up del % | `CountUpText` (format en worklet) | sin `Intl` en worklet |
| Gota al pozo 400ms | View absoluta translateY+opacity al subir el count | `transform` nunca undefined |
| Viraje a verde + ripple al 100% | `interpolateColor` + anillo scale/fade | — |
| Anillo doble del día en calma | segundo `Circle` exterior + fade-in 300ms | — |
| Check draw 300ms | `strokeDashoffset` del path | — |
| Pulse secuencial 7 aros stagger 80ms | `withDelay(i*80, withSequence(...))` | — |
| Sheet spring 350ms + dots 40ms | patrón de sheet existente | flag de altura en salida |
| Halo 3s / CTA 4s / sway 2.5s / cheer 4s | `withRepeat`; si es CSS-anim, delay NEGATIVO | delay positivo deja estático |
| Partículas | `BrotParticles` preset `hero` count 10 | doble clip (wrapper + prop) |
| Burst 12 al volver del registro | one-shot al retorno del add-flow | count fijo |
| Borde ámbar 400ms (2e) | opacity de la barra `inset 4px 0 0 #E8A664` | — |
| Nota descartada fade+collapse 250ms | opacity + height animada | flag de altura |
| Press raised→inset 120/180ms | patrón del back actual + `SUPPORTS_INSET_SHADOW` | Android <29 |
| Entrada de cards stagger 60ms | `RiseView` + `motionStagger` | — |
| Skeleton shimmer 1.2s | loop de opacity sobre los pozos | — |
| Swap de pose del hero | fade/scale del CONTENEDOR | no se porta el dissolve de brot.js |
| **Reduced motion** | **gate del repo sobre TODA esta tabla** | no importar `useReducedMotion` directo |

## Apéndice C · Verificación

```bash
source ~/.nvm/nvm.sh
npx tsc --noEmit                                  # cada task
npx vitest run tests/unit/crecimiento-model.test.ts
npx vitest run                                    # T10/T12 (copy) y antes de cada commit de cableado
npm run validate
npx expo export --platform ios                    # el bundle real (validate NO lo cubre)
```

QA visual en device (`xcrun devicectl device install app`; `expo run:ios --device` compila pero no instala en iPhones nuevos). Preview web solo para layout: sin Skia, Brot y BrotParticles salen vacíos. Cuenta dev en prod: `otti@manifiestoapp.com`.
