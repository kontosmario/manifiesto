# Control · Hero card refactor

**Fecha**: 2026-05-13
**Owner**: Mario
**Skills aplicadas**: `/impeccable` · `/ui-ux-pro-max` · `/emil-design-eng`

---

## 🎯 Premisa del rediseño

> **"Un asistente que te dice lo más importante que debes saber, sin vueltas."**

El hero card de Control hoy es overload: 16 props en `ControlV2HoyCard` + un score pill en el header + un Asesor card adicional. El usuario abre Control y **no sabe qué mirar primero**.

El refactor apunta a **una sola surface de "TL;DR del día"** con state-aware copy y 1-2 datos de soporte, máximo. El resto de los cards quedan como deep-dives para usuarios que quieren explorar.

---

## 📐 Audit · información disponible

### Data layer (vía `useControlV2Data` → `data` + `view`)

#### Datos del ciclo

| Field | Significado | Relevancia hero |
|---|---|---|
| `data.ingresoMes` | Sueldo mensual | 🟡 baja (contexto, no actionable) |
| `data.fijosMes` | Total fijos del ciclo | 🟡 baja (vive en Fijos screen) |
| `data.libreMes` | Discrecional del ciclo | 🟡 media (proyección) |
| `data.cupoDiario` | Cupo diario discrecional | 🟢 **alta** |
| `data.gastoHoy` | Gastado hoy hasta ahora | 🟢 **alta** |
| `data.diaActual` / `data.diasMes` | Posición temporal | 🟡 contexto |
| `data.horaActual` / `data.minActual` | Hora actual | 🟡 prorrateo |
| `data.proximoSueldoEnDias` | Días al cobro | 🟢 **alta** |

#### Estado del usuario hoy (vía `view`)

| Field | Significado | Relevancia hero |
|---|---|---|
| `view.libreHoy` = `cupoDiario - gastoHoy` | **Cuánto te queda hoy** | 🟢🟢 **CRÍTICA** |
| `view.estaOk` (bool) | Si vas en línea con el prorrateo | 🟢 **alta** (state color) |
| `view.delta` = `cupoHastaAhora - gastoHoy` | Por arriba/abajo del ritmo | 🟢 **alta** |
| `view.alcanzaElMes` (bool) | ¿Llegás al cobro? | 🟢 **alta** |
| `view.diaAgotamiento` | Si seguís el ritmo, te quedás sin el día X | 🟢 **alta** (proyección) |
| `view.alreadyExhausted` | Ya te pasaste del ciclo entero | 🔴 **crítica** |
| `view.proyectadoMes` | Cierre proyectado | 🟡 media (vsMes ya lo cubre) |

#### Estado "rachá" / contexto motivacional

| Field | Significado | Relevancia hero |
|---|---|---|
| `view.racha` | Días seguidos bajo cupo | 🟡 baja (gamification, va en stats chip) |
| `view.diasGanadores` | Total de días ganadores en el ciclo | 🟡 baja |
| `view.closedDays` | Días cerrados del ciclo | 🟡 contexto |
| `view.diasRestantes` | Días restantes | 🟡 contexto |
| `view.momentum` | Ratio last-7 vs prev-7 | 🟡 nice-to-have |
| `view.noSpendCount` | Días sin gasto | 🟡 baja |

#### Score

| Field | Significado | Relevancia hero |
|---|---|---|
| `view.score` (0-100) | Score compuesto | 🟡 media (abstracto · vive en header) |
| `view.scoreLabel` | "Excelente / Bien / Atención" | 🟡 media |

#### Señales del Asistente

| Field | Significado | Relevancia hero |
|---|---|---|
| `signals[]` (ControlAdvisorTask) | Top tareas/alertas del Asistente | 🟢 **alta** si es urgente |

### Cards actuales (8 cards después del header)

| Card | Info | Relevancia hero |
|---|---|---|
| `ControlV2HoyCard` 🦸 | Cupo / gasto / delta / racha / momentum | ÉSTE ES EL "HERO" actual |
| `ControlV2AsesorCard` | Top 3 signals del Asistente | ❌ **REMOVIDO** (icon en Home ya da acceso) |
| `ControlV2AlcanzaCard` | Proyección de cuándo te quedás sin plata | 🟢 alta · vive como detail card |
| `ControlV2AlcanciaCard` | Savings goal piggy-bank | 🟡 vive como detail card |
| `ControlV2SemanaCard` | Stats last-7 días | 🟡 vive como detail card |
| `ControlV2VsMesCard` | Mes pasado vs mes actual | 🟡 vive como detail card |
| `ControlV2PatronCard` | Día de semana patterns | 🟡 vive como detail card |
| `ControlV2CoberturaCard` | Fijos/ingreso ratio | 🟡 vive como detail card |

---

## 💡 Lo que el hero debe decir (priorizado)

Pensando como **asistente real** que te susurra al oído al abrir Control, decision tree en orden de urgencia:

1. **`alreadyExhausted`** → "Te pasaste del ciclo. Ya gastaste $X más del cupo total."
2. **`!alcanzaElMes`** → "A este ritmo no llegás al cobro. Te quedás sin plata el [día agotamiento]."
3. **`delta < -cupoDiario`** (gasté hoy > cupo) → "Hoy gastaste $X más del cupo. Frená el resto del día."
4. **`!estaOk` (delta negativo pequeño)** → "Vas $X arriba del ritmo de la hora. Cuidado."
5. **`signals.urgency === 'alta'`** → Surface el primer signal urgente con CTA al Asistente.
6. **default (estaOk)** → "Vas bien. Te quedan $X para el resto del día."

### Lo que el hero debe mostrar (jerarquía visual)

```
┌──────────────────────────────────────────────────────┐
│ ● HOY · MARTES 14                          [score]   │  ← eyebrow + estado
│                                                      │
│ {Headline state-aware}                               │  ← TL;DR del día
│ {Big number relevante}                               │  ← el dato que importa
│                                                      │
│ {1 línea de soporte / próxima acción}                │  ← contexto / CTA
└──────────────────────────────────────────────────────┘
```

Detail cards (Alcanza, Semana, vsMes, Patrón, Cobertura, Alcancía) **siguen abajo intactos** para deep dive.

---

## 🎨 6 variantes a explorar

| Variante | Idea | Aesthetic |
|---|---|---|
| **A · El Titular** | Magazine cover · state-aware big headline + 1 supporting | editorial restraint (mismo DNA que Fijos Titular) |
| **B · El Velocímetro** | Radial gauge · "consumiste 60% del cupo, son las 14:00" | instrumento de precisión |
| **C · El Termómetro** | Vertical bar gastado/cupo + day position marker | visceral · arriba/abajo del prorrateo |
| **D · El Coach** | Chat bubble · "Hoy te digo: ..." conversational | conversational · empático |
| **E · El Periódico** | Newspaper-front · "TITULAR DEL DÍA" eyebrow | editorial NY Times |
| **F · El Reloj del día** | Analog clock + arc del cupo consumido | unique time+money mapping |

Todas con:
- **Particles like fireflies** (CardParticles count=12)
- **ShineOverlay** sweep diagonal
- **BreatheDot color-coded** por urgencia
- **Theme-aware** AA contrast
- **State-aware copy** (6 estados canónicos)
- **Editorial restraint** (impeccable)

---

## 🚦 Plan de ejecución

| # | Etapa | Estado |
|---|---|---|
| 1 | Audit (este doc) | ✅ DONE |
| 2 | Remover ControlV2AsesorCard del screen | ✅ DONE |
| 3 | Settings cleanup: remover 12 dev routes de Fijos | ✅ DONE |
| 4 | Construir 6 variantes hero Control en `control-hero-preview/` | ✅ DONE |
| 5 | Mount dev preview route con state selector | ✅ DONE |
| 6 | Performance pass del screen (memo + useMemo audit) | ✅ DONE |
| 7 | Owner pickea winner → integración a producción | ✅ DONE · 🏆 **A · El Titular** ganadora |
| 8 | Update doc final | ✅ DONE |
| 9 | Cleanup variants no usadas (B · C · D · E · F · G) | 🔴 PENDIENTE |

---

## 🏆 Etapa 4 · Variant A · El Titular promoted a producción (2026-05-13)

Owner: *"me termine deciciendo por la card A - EL TITULAR. integremos esta nueva hero card a Control."*

Después de explorar G (Coach × Magazine fusion con chips) y refinarla, owner concluyó que **A · El Titular** ofrece la mejor relación claridad/restraint para el hero card. Promote a producción ejecutado.

### Cambios shipped

- **NUEVO** `mobile/components/control-v2/control-v2-hero.tsx` · production wrapper que adapta el output del `useControlV2Data` (data + view + dailyGoalAmount + dayLabel) al shape `ControlHeroState` que consume `ControlHeroTitular` desde preview. `memo()` wrapped + `useMemo` para el state shape · estabilidad garantizada para shallow compare upstream.

- `control-v2-screen.tsx` · `ControlV2HoyCard` reemplazada por `<ControlV2Hero>`. Mantiene los wraps `<TourTarget>` + `<ControlV2Anchor section="hoy">` originales · el tour guiado y el scroll-to-section siguen funcionando.

- **ControlV2HoyCard NO eliminada** del filesystem. Import comentado en el screen con nota de rollback. Si surge un bug crítico en device, descomentar 2 líneas (el import + el JSX wrap) restaura la HoyCard vieja.

### Lo que el usuario va a ver ahora en Control

```
┌──────────────────────────────────────────────────────────┐
│ Control                    [score pill]  ← ControlV2Header
│                                                          │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ ● HOY · MIÉR 22                                      │ │  ← NUEVO HERO
│ │ ──                                                   │ │
│ │ Vas bien hoy.                                        │ │  ← headline state-aware
│ │ $18.000 para el resto del día · 16 días al cobro.    │ │  ← secondary
│ │                                                      │ │
│ │ LIBRE HOY                                            │ │
│ │ $18.000                                              │ │  ← primary number
│ │                                                      │ │
│ │ racha │ al cobro │ del cupo                          │ │  ← 3 mini stats
│ │ 5d    │ 16d      │ 56%                               │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ [AlcanzaCard]  ← detail card                             │
│ [AlcanciaCard] ← detail card                             │
│ [SemanaCard]                                             │
│ [VsMesCard]                                              │
│ [PatronCard]                                             │
│ [CoberturaCard]                                          │
└──────────────────────────────────────────────────────────┘
```

Plus: gradient forest + ShineOverlay sweep + CardParticles (12 luciérnagas peach) + BreatheDot color-coded por status (lime/amber/peach) + CountUpText + cascade entrance.

### Próximo paso · cleanup (opcional)

Cuando confirme en device que A está estable, ejecutar cleanup:

- Borrar variants B-G de `mobile/components/control-hero-preview/`
- Borrar `mobile/screens/dev/control-hero-variants-screen.tsx`
- Borrar `app/(app)/settings/dev/control-hero-variants.tsx`
- Quitar entry de Settings → Dev
- Mantener `control-hero-a-titular.tsx`, `control-hero-states.ts`, `control-hero-helpers.ts` ya que son las dependencias del production wrapper

Aproximado: **~2000 LOC** removibles después del cleanup.

---

## 📦 Lo shipped (commit pending · `feat(control)` · 2026-05-13)

### Cleanup del screen

- **`ControlV2AsesorCard` removida** del `control-v2-screen.tsx`. Los signals del Asesor siguen vivos en el data layer (`useAdvisorNotificationSync` continúa funcionando para el badge de Notifications + push), pero ya no se renderean inline. El usuario accede al Asesor desde el icon en Home — surface duplicada eliminada.
- **`ControlV2AsesorCard` import removido** del screen. El componente sigue en código (`mobile/components/control-v2/control-v2-asesor-card.tsx`) por si vuelve a usarse en otro contexto.

### Performance pass

- `dayLabel` memoized · antes recomputaba string + `new Date()` cada render
- `fijosRatioPct` memoized (deps: `data.ingresoMes`, `data.fijosMes`)
- `ahorroMes` memoized (deps: `data.ingresoMes`, `data.fijosMes`, `data.libreMes`)
- **Cards ya memo'd** del Sprint P4 anterior (HoyCard / VsMesCard / AlcanzaCard / AlcanciaCard / SemanaCard / PatronCard / CoberturaCard) — no requirió cambios.
- `anchorsController` ya memo'd ✓

### Settings cleanup

Las 12 dev rows de Fijos eliminadas del bloque dev de Settings. Una sola entry nueva agregada: **"Control · Hero · 6 variantes"** → `/settings/dev/control-hero-variants`. Los archivos preview de Fijos siguen en código para referencia (cleanup pendiente).

### 6 variantes del hero Control

Folder nuevo: `mobile/components/control-hero-preview/`

Helpers compartidos:
- `control-hero-states.ts` · 8 estados representativos (al_dia_temprano · al_dia_tarde · adelantado · atrasado_leve · atrasado_critico · no_alcanza · exhausto · inicio_ciclo) con TODOS los aggregates necesarios
- `control-hero-helpers.ts` · `resolveControlMessage()` (decision tree del "asistente que dice lo más importante sin vueltas" — 6 ramas de estado → 1 mensaje primary + secondary + status tone + primary number) + `buildControlHeroPalette()` (positive lime / caution amber / urgent peach AA verificadas)

Variantes:

| # | Variante | Visual signature | Animación única |
|---|---|---|---|
| **A** | `ControlHeroTitular` | Magazine cover · big headline + primary number + footer stats | cascade entrance row-by-row 80ms stagger |
| **B** | `ControlHeroVelocimetro` | Radial gauge SVG · arc del cupo + AHORA tick mark | arc fill on mount + libreHoy CountUp center |
| **C** | `ControlHeroTermometro` | Vertical bar fill bottom-up + marker line horaF/24 | bar fill animado 900ms + visceral gap visual |
| **D** | `ControlHeroCoach` | Speech bubble con coach avatar + "Hoy te digo:" | spring bounce-in del bubble 220ms damping |
| **E** | `ControlHeroPeriodico` | Newspaper front-page · masthead + EDICIÓN + lead + ticker | rule scaleX + line-by-line cascade |
| **F** | `ControlHeroReloj` | Analog clock + arc del cupo · time+money en uno | hour hand + cupo arc · libreHoy center |

Cada variante con:
- `LinearGradient` heroGradient (forest deep) — mismo lenguaje que Home/Gastos/Fijos
- `ShineOverlay` sweep diagonal 4200ms
- `CardParticles` count=12 accentColor=peach (luciérnagas titilando)
- `BreatheDot` color-coded por status (lime · amber · peach)
- `CountUpText` en el primary number
- Cascade entrance via `RiseRow` 80ms stagger
- `resolveControlMessage()` state-aware copy

### Dev preview screen

`/settings/dev/control-hero-variants` (Settings → Dev → "Control · Hero · 6 variantes"). State selector horizontal con los 8 estados canónicos + replay button. Cada cambio de estado o tap replay → `key={stateId-nonce}` remount = animaciones replay.

---

## 🎯 Próximo paso

Owner explora las variantes en `/settings/dev/control-hero-variants` y pickea winner. Una vez elegida, se promociona a producción reemplazando `ControlV2HoyCard` como el hero card principal (o se mantiene HoyCard como detail card abajo).

La key decision posterior es si el winner **reemplaza** la HoyCard o **sustituye** al header bar `ControlV2Header`. Lo más natural: reemplaza la HoyCard. El header bar (título + score pill) se mantiene como navigation chrome.

---

## 🆕 Etapa 2 · Variant G · Coach × Magazine fusion (2026-05-13)

Owner: *"me gusta la idea del coach llamado control, mezclado con magazine, y me gustaría ver una variante con todas las chips, estados y variantes disponibles según estados y todo lo que puede recibir, incluso la meta diaria auto-impuesta."*

### Cambios

- **`ControlHeroState` extendido** con campos showcase del data completo:
  - `dailyGoalAmount?: number | null` · meta diaria auto-impuesta del user (vía `daily_budget_buffer_mode='percent'`)
  - `score: number` + `scoreLabel: string` · score 0-100 del adapter
  - `proximoFijo?: { name, days, amount } | null` · próximo fijo a pagar
  - `fijosVencidos?: number` · count de fijos vencidos del ciclo

  Los 8 estados preset populan todos estos campos · `al_dia`/`adelantado` tienen `dailyGoalAmount` seteado, `exhausto`/`no_alcanza` tienen `fijosVencidos > 0`.

- **`resolveControlMessage`** extendido con caso **"pasaste tu meta diaria"**. Cuando `dailyGoalAmount` está seteado y `gastoHoy > dailyGoalAmount` pero `gastoHoy <= cupoDiario`:
  > **"Pasaste tu meta diaria."** · *"Seguís bajo el cupo, pero superaste tu meta por $X."*

  Status `caution` (peach amber) — soft warning. Respeta el goal auto-impuesto como threshold primario antes del cupo del sistema.

- **Variante G · `ControlHeroCoachMagazine`** (commit pending). Fusión de los dos paradigmas:
  - **Magazine flavor**: masthead con brand "CONTROL" + breathe dot + fecha + **score badge** (XX/100 + trending icon + label "Muy bien"); ticker stats footer con 4 mini stats (cobro · cupo/día · delta · momentum).
  - **Coach flavor**: avatar circular con icon `psychology` (spring bounce-in entrance 220ms damping) + "Hoy te digo:" lead-in italic.
  - **Editorial body**: headline state-aware 24pt + lead paragraph italic 13pt + primary number 32pt 900.

  **ChipsRow horizontal scrollable** que showcasea TODOS los chips disponibles según estado:

  | Chip | Visible cuando | Tone |
  |---|---|---|
  | 🚩 Meta `$25k/día` | `dailyGoalAmount != null` | lime si under · peach si over |
  | ⚠ Vencidos `N` | `fijosVencidos > 0` | peach urgent |
  | 🚫 Pasaste `el ciclo` | `alreadyExhausted` | peach urgent |
  | 📅 Sin plata `día 24` | `!alcanzaElMes` y agotamiento < cierre | peach urgent |
  | 🔥 Racha `5d` | `racha >= 3` | lime positive |
  | 🏆 Ganadores `9/13` | `closedDays >= 7` | lime si ≥60% · muted si menos |
  | 💰 Sin gasto `3d` | `noSpendCount > 0` | lime positive |
  | ⏰ Netflix `3d` | `proximoFijo != null` | cream · peach si days ≤ 1 |

  Los chips se renderean SOLO cuando aplican. Los estados `con_atraso`/`no_alcanza` y `al_dia_tarde` muestran 4-5 chips simultáneamente para validar el layout.

  La variante mantiene · gradient forest · ShineOverlay · CardParticles count=**14** (un poco más densa que las 6 anteriores) · BreatheDot color-coded · CountUpText · cascade entrance 80ms stagger · theme-aware AA.

- Posicionada **primera en la screen comparativa** (con marca ★) ya que es la winner conceptual del owner.

### Próximos pasos posibles

Owner valida la variante G end-to-end con los 8 estados. Si confirma, se promueve a producción reemplazando `ControlV2HoyCard`. Los 6 otros variants (A-F) quedan en código preview pero pueden borrarse en cleanup posterior.

---

## 🪒 Etapa 3 · Variant G refinement (2026-05-13)

Owner: *"me parece muy cargado de información ahora. Fijos vencidos no debe aparecer · PRÓXIMO tampoco · todo lo que sea relacionado a fijos no debe estar presente. Score level ya figura en la vista de control, no es necesario en la hero card."*

Refinamientos sobre G:

- **ScoreBadge del masthead REMOVIDO.** El score (XX/100 + label) ya vive en el `ControlV2Header` del screen — duplicarlo en el hero era ruido. Slot derecho del masthead pasa a tag editorial **"EDICIÓN MAÑANA/TARDE/NOCHE"** según hora actual (preserva el feel Magazine sin agregar info redundante).
- **Chip "Vencidos N" REMOVIDO** del ChipsRow. Pertenece al dominio Fijos.
- **Chip "Próximo Netflix 3d" REMOVIDO** del ChipsRow. Pertenece al dominio Fijos.
- Los campos `state.score`, `state.scoreLabel`, `state.fijosVencidos`, `state.proximoFijo` se **mantienen en `ControlHeroState`** como vestigiales (opcionales) — no rompen nada y permiten futuras variantes que los quieran usar. Por ahora ningún variant los renderea.

### ChipsRow final · solo Control-domain

| Chip | Visible cuando | Tone |
|---|---|---|
| 🚩 Meta `$25k/día` | `dailyGoalAmount != null` | lime si under · peach si over-goal |
| 🚫 Pasaste `el ciclo` | `alreadyExhausted` | peach urgent |
| 📅 Sin plata `día 24` | `!alcanzaElMes` y agotamiento < cierre | peach urgent |
| 🔥 Racha `5d` | `racha >= 3` | lime positive |
| 🏆 Ganadores `9/13` | `closedDays >= 7` | lime si ≥60% · muted si menos |
| 💰 Sin gasto `3d` | `noSpendCount > 0` | lime positive |

6 chips posibles (era 8) · todos Control-domain. Estados maduros como `al_dia_tarde` o `con_atraso` muestran 3-4 simultáneamente. Inicios de ciclo muestran 0-1. Cero referencias a fijos.

### Layout actualizado

```
┌──────────────────────────────────────────────────────────┐
│ ● CONTROL · HOY · MIÉR 22              EDICIÓN TARDE     │  ← masthead simple
│ ──                                                       │
│ [🧠]  Hoy te digo:                                       │
│ Vas adelantado.                                          │
│ Tenés margen extra: $4.500 sobre el ritmo.               │
│                                                          │
│ LIBRE HOY                                                │
│ $18.000                                                  │
│                                                          │
│ [🚩 $25k/día]  [🔥 5d]  [🏆 11/13]  [💰 4d]              │  ← solo Control chips
│                                                          │
│ COBRO  CUPO/DÍA  DELTA  MOMENTUM                         │
│ 16d    $32k      +5k    ↓12%                             │
└──────────────────────────────────────────────────────────┘
```

---

## 🪒 Etapa 5 · Polish del Titular · summary signals + meta chip (2026-05-13)

Owner: *"tratemos de que la información que mostramos realmente tenga relevancia, podemos obtener un resumen de todas las demás tarjetas de control para mostrar en la hero card... podemos integrar /impeccable y /ui-ux-pro-max para pulir y destacar más la card hero? Además, cuando configuramos la meta diaria, no se ve reflejada en la card."*

### Bug fix · META chip visible cuando hay daily goal

`dailyGoalAmount` se pasaba bien al state pero variant A solo lo usaba indirectamente vía `resolveControlMessage` (cambia el copy a "Pasaste tu meta diaria" cuando hay goal y `gastoHoy > goal`). No había NINGUNA representación visible cuando el user opted-in al goal pero estaba bajo el threshold.

**Fix:** META chip en el eyebrow row (derecha) cuando `dailyGoalAmount != null`. Color-encoded:

- Lime `#A6EF8F` mientras `gastoHoy <= goal` (bajo la meta · todo bien)
- Peach `#F2A78C` cuando `gastoHoy > goal` (pasó la meta)

Pill discreta: `META · $25.6k` · 8pt label · 11pt value tabular · tint translúcido + border al 33%. No compite con el `diaLabel` izquierda.

### Summary signals pulled de las detail cards

El owner pidió que las cards de detalle pasen a ser **visualización plena** y la hero **sintetice lo importante**. Cambios:

- **Footer · "del cupo" → "vs mes"** (Δ% proyectado vs mes pasado). El % del cupo ya está implícito en el LIBRE HOY arriba (si `libreHoy < 0` ya sabés que estás sobre el cupo). El delta vs mes pasado es señal **más actionable** y no se ve en ningún otro lugar visible de la hero.

  Color: lime si `vsMesMejor === true`, peach si false, accent neutral si flat. Formato `+12%` / `-8%` / `=`.

- **Insight line nueva** (sutil, italic, debajo del footer): `"Acumulaste $X este ciclo"` cuando `vault >= cupoDiario` (un día completo de cupo ahorrado).

  Editorial restraint:
  - Solo aparece si NO es urgent state (`alreadyExhausted` o `!alcanzaElMes`). En urgencia, la motivación distrae — el copy principal manda.
  - Texto italic + heroMuted2 + 11pt → se lee como pista, no compite con la headline.
  - Invita a explorar la card Alcancía sin necesidad de CTA explícito.

### Visual prominence (impeccable polish)

| Antes | Después | Razón |
|---|---|---|
| `padding: 20` | `padding: 22` | hero merece breathing room mayor que las detail cards (16-18) |
| `CardParticles count={12}` | `count={14}` | densidad sutilmente mayor sin ruido |
| `fontSize: 36 / lineHeight: 40` | `fontSize: 40 / lineHeight: 44` | primary number escala con el rango de la card como el hero merece |
| `letterSpacing: -1.4` | `letterSpacing: -1.6` | tracking más agresivo en números grandes — editorial |

### Adapter actualizado

`ControlHeroState` extendido con campos opcionales: `vsMesDeltaPct`, `vsMesMejor`, `vault`, `mejorDowName`. `control-v2-hero.tsx` los pasa desde `view.vsMesDeltaPct`, `view.vsMesMejor`, `view.vault`, `view.mejorDow.name`.

Los 8 mocks de `control-hero-states.ts` extendidos con valores realistas — el variants-screen sigue reflejando el mismo footer + insight que producción.

### Resultado · Layout final del Titular

```
┌──────────────────────────────────────────────────────────┐
│ ● HOY · MARTES 14                          META · $25.6k │  ← META chip cuando hay goal
│ ──                                                       │
│                                                          │
│ Vas adelantado.                                          │
│ Tenés margen extra: $13k sobre el ritmo.                 │
│                                                          │
│ LIBRE HOY                                                │
│ $18.000                                                  │  ← 40pt
│                                                          │
│ ──────────────────────────────────────                   │
│ RACHA    VS MES    AL COBRO                              │
│ 3d       -8%       16d                                   │
│                                                          │
│ Acumulaste $42.000 este ciclo                            │  ← insight line (cuando vault ≥ cupo)
└──────────────────────────────────────────────────────────┘
```

### Estado del refactor

Control hero **cerrado**. Variant A `ControlHeroTitular` ship en producción vía `control-v2-hero.tsx`. Variants B-G (~2000 LOC) quedan en preview por si owner quiere reabrir exploración futura — cleanup pendiente para release de simplificación.

Próximo refactor: **HOME hero card**.

---

## 🪦 Etapa 6 · Home hero exploration descartada (2026-05-13)

Después de cerrar Control, se exploraron 6 variantes radicales del **Home** hero card como ejercicio paralelo (Termómetro · Reloj de Sol · Diario · Cofre · Pulso · Manifiesto). El objetivo era despegar el Home del DNA visual compartido con Fijos/Control (gradient forest + ShineOverlay + CardParticles + 2-tile split).

Owner: *"no me gusta ninguno, descarta esto. Estamos bien como estamos."*

**Decisión final:** el `HomeHeroCard` actual se queda como está. Las 6 variantes del Home se borraron del repo en el commit posterior — no quedaron como preview vestigial porque, a diferencia de las B-G de Control, no apuntan a una pickeable futura.

El Home hero queda **fuera del scope de refactors** hasta nuevo aviso. Los próximos refactors visuales se enfocan en otras superficies (navegación, transitions, etc).
