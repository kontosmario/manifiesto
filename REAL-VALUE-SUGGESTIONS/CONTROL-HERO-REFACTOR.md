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
| 7 | Owner pickea winner → integración a producción | 🟡 PENDING |
| 8 | Update doc final | ✅ DONE (este update) |

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

Owner explora las 6 variantes en `/settings/dev/control-hero-variants` y pickea winner. Una vez elegida, se promociona a producción reemplazando `ControlV2HoyCard` como el hero card principal (o se mantiene HoyCard como detail card abajo).

La key decision posterior es si el winner **reemplaza** la HoyCard o **sustituye** al header bar `ControlV2Header`. Lo más natural: reemplaza la HoyCard. El header bar (título + score pill) se mantiene como navigation chrome.
