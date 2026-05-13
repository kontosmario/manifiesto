# Fijos · Refactor visual por etapas

**Fecha**: 2026-05-12
**Owner**: Mario
**Skills aplicadas**: `/impeccable` · `/emil-design-eng` · `/ui-ux-pro-max` · `/frontend-design`
**Alcance Etapa 1**: HERO CARD únicamente. Las siguientes etapas (alerts / upcoming strip / tabs / category groups / fijo row / header) se planifican después de que el hero quede confirmado.

---

## 🎯 Objetivo del refactor

Owner pidió que esta vista **se sienta como una vista a la que siempre vamos a ingresar** porque tiene un propósito concreto y recurrente: **revisar qué fijos están pagados y cuáles aún faltan en el ciclo**.

El hero actual cumple en lo funcional pero cae en un patrón muy genérico de fintech (big number + small label + supporting stats + gradient accent). Es exactamente el _hero-metric template_ que `/impeccable` señala como **anti-patrón absoluto** (categoría "absolute bans"). Además anida dos cards (`StatCard`) dentro del hero card — otro absolute ban (`nested cards are always wrong`).

> **Regla owner**: cero información perdida. Todo lo que hoy se muestra tiene que sobrevivir el rediseño — el énfasis y la jerarquía pueden cambiar, pero el dato no se descarta.

---

## 📐 Línea por línea — vista actual

Walk-through completo de [fijos-hero-card.tsx](../mobile/components/fijos/fijos-hero-card.tsx) (493 LOC) + el screen que lo monta ([fijos-v2-screen.tsx](../mobile/screens/home/fijos-v2-screen.tsx)) + el aggregate que lo alimenta ([fijos-aggregates.model.ts](../mobile/features/fijos/fijos-aggregates.model.ts)) + el controller que materializa props ([use-fijos-controller.ts](../mobile/features/fijos/use-fijos-controller.ts)).

### A · Estructura visual actual

```
┌───────────────────────────────────────────────────┐
│ ● GASTOS FIJOS · ABR             ← eyebrow      ⬤ │  ← breathe dot
│ Quedan 18 días en el ciclo       ← subtitle       │
│                                                   │
│ Ya pagaste              Te falta pagar            │
│ $ 245.000               $ 180.000                 │
│   (28pt bold)             (20pt bold, coral)      │
│                                                   │
│ ━━━━━━━━━━━━●─────────────────────  ← progress 57%│
│ 57% pagado                       Total: $ 425.000 │
│                                                   │
│ ┌──────────┐ ┌──────────┐  ← nested cards (BAN)   │
│ │ ✓ PAGADOS│ │ ! POR PAG│                         │
│ │ 5        │ │ 3        │                         │
│ │ listos   │ │ pendient.│                         │
│ └──────────┘ └──────────┘                         │
│                                                   │
│ ─────────────────────────────────                 │
│ DINERO LIBRE ESTE MES   de tu sueldo              │
│ $ 380.000               42%                       │
│                         va a fijos                │
└───────────────────────────────────────────────────┘
```

### B · Inventario de datos consumidos

Mapeo exhaustivo de cada prop / data path que el hero usa **hoy**:

| Origen (controller) | Prop hero | Mostrado como | Líneas |
|---|---|---|---|
| `controller.cycleLabel` (e.g. "5 abr → 5 may") | `mes` (rebautizado como mes pero realmente es ciclo completo) | Eyebrow "GASTOS FIJOS · {mes}" | 88-90 |
| `controller.summary.daysRemaining` | `diasRestantes` | Subtitle "Quedan X días en el ciclo" | 93-95 |
| `controller.summary.total` | `totalFijos` | "Total: ${formatMoney}" + denominator del progress | 58, 126, 165 |
| `controller.summary.paidAmount` | `montoPagado` | Numerador "Ya pagaste $X" (CountUp 28pt) | 102-107 |
| Calculado: `total - paidAmount` | (interno) `montoPendiente` | "Te falta pagar $Y" (CountUp 20pt coral) | 59, 112-117 |
| Calculado: `(paid/total)*100` | (interno) `porcentaje` | "X% pagado" + width del fill | 58, 120, 123 |
| `controller.summary.paidItems.length` | `cantidadPagados` | StatCard left value | 132-138 |
| `controller.summary.pendingItems.length + overdueItems.length` | `cantidadPendientes` | StatCard right value | 139-146 |
| `controller.freeAfterFijos` | `dineroLibre` | "DINERO LIBRE ESTE MES $X" | 152-158 |
| `controller.pctOfIncome` | `porcentajeSueldo` | "{X}% / de tu sueldo / va a fijos" (3-line stack derecha) | 161-169 |

### C · Inventario de datos **no consumidos por el hero** (existen en el controller, viven en sub-componentes o se descartan)

| Origen | Hoy se usa para | Potencial para hero |
|---|---|---|
| `summary.pendingAmount` / `overdueAmount` (separados) | El hero **funde** ambos en "te falta pagar" — pierde la distinción pending vs overdue | 🟢 Sí. La diferencia entre "pendiente sin atraso" y "vencido" es la única señal de urgencia real. Hoy queda invisibilizada. |
| `summary.overdueItems.length` (separado) | Suma silenciosa en `cantidadPendientes` | 🟢 Sí. Si tenés 2 overdue, deberías verlo destacado, no mezclado. |
| `summary.upcoming[]` (top 3 próximos) | `<FijosUpcomingStrip>` (sección siguiente) | 🟡 Posible cross-link. El hero podría adelantar "Próximo: Netflix en 3d". |
| `summary.daysToNextPayment` | (no se renderea en ninguna parte hoy) | 🟢 Sí. Es el dato más procesable para el usuario que abre la app a revisar. |
| `summary.hikes[]` (cambios de precio +5%) | `<FijosSmartAlerts>` | 🔴 No. Vive correctamente en su sección. |
| `summary.todayDay` + `cycleStart` + `cycleDays` | `<FijosUpcomingStrip>` (calendar render) | 🟢 Sí — la geometría completa del ciclo abre la puerta a un hero radial / calendar-based en lugar de progress bar lineal. |
| `controller.monthlyIncome` (raw) | (no se renderea, solo se usa para `pctOfIncome`) | 🟡 Posible. Mostrar el sueldo absoluto al lado del % a veces es más concreto. |
| `controller.cycleStart` / `cycleEnd` / `cycleDays` | (no se renderea en hero, solo se usa para el `cycleLabel`) | 🟢 Sí. La fecha exacta de fin de ciclo es accionable ("hasta el 5 may"). |

### D · Inventario de animaciones / interacciones (catálogo a preservar)

| Sistema | Función actual | Reusar |
|---|---|---|
| `RiseView delay={40}` (wrapping outer) | Entrance del hero en la cascada del screen (50/120/200/280/360 ms…) | ✅ Mantener |
| `Animated.View layout={LinearTransition.duration(260)}` | Suaviza height change cuando cambian los valores | ✅ Mantener |
| `LinearGradient` con `theme.heroGradient` | Forest dark gradient (244235 → 1F590D → 297811 ×2) — mismo lenguaje de Home + Gastos | ✅ Mantener tema, evaluar curva |
| `ShineOverlay` (sweep diagonal, periodMs 4200) | Capa de gloss premium | ⚠️ Evaluar — depende de dirección |
| `CardParticles count=12 accentColor=peach` | Campo de luciérnagas | ⚠️ Evaluar — depende de dirección |
| `BreatheDot 8pt` al lado del eyebrow | Señal de "vivo" | ✅ Reusar (lenguaje compartido) |
| `CountUpText` en montoPagado / montoPendiente / dineroLibre / stat values | Conteo animado al mount + on data change | ✅ Mantener para todos los montos $ |
| `ProgressBar` (scaleX 900ms + bouncy dot pulse 680ms + repeating glow) | Fill animado al mount con dot rider glow | ⚠️ Evaluar — depende de dirección (puede que el hero no tenga "progress bar" lineal en nuevo diseño) |
| `motionEasings.decelerate` (ease-out fuerte) en progress fill | Curva personalizada del proyecto | ✅ Mantener para nuevas animaciones |

### E · Diagnóstico — qué funciona y qué no

**Funciona**:
- Lenguaje visual cohesivo con Home + Gastos (gradient + shine + particles + breathe + count-up).
- Cobertura de datos: total / pagado / pendiente / dinero libre / % sueldo / ciclo / días restantes / progreso — el hero ES un dashboard completo del estado del ciclo.
- Cascade de motion en mount está bien orquestada (RiseView 40 → fill 80→980 → dot pulse 680 → loops).

**Falla** (según `/impeccable` absolute bans + `/emil` craft principles + `/ui-ux-pro-max` rules):
1. **`hero-metric template` (impeccable ban absoluto)** — big monto + label + supporting stats + gradient accent es el cliché SaaS exacto que la skill marca como "AI slop test fail". Esto es lo que hace que la vista se sienta intercambiable con cualquier otra finance app.
2. **`nested cards always wrong` (impeccable ban absoluto)** — los dos `StatCard` flotan _dentro_ del hero card. Solución actual ofusca el espíritu del hero como "una sola sentencia visual".
3. **Emoji-as-icon (ui-pro-max + impeccable)** — los caracteres `✓` y `!` están rendered como `Text` no como SVG icons. Material design ban.
4. **Pending vs Overdue invisible** — la diferencia entre 2 pendientes-en-plazo y 2 vencidos se entierra. Es la única señal accionable real ("hay algo que YA tenías que pagar"). El hero hoy no lo señaliza.
5. **`daysToNextPayment` no se muestra** — el dato más procesable para alguien que abre la app está calculado pero descartado.
6. **`progressDot` con shadow + glow** — el dot rider del progress bar tiene un shadow elevation 3 que es una micro-decoración que no aporta señal. Emil rule: "every animation must express a cause-effect relationship, not just be decorative".
7. **3 valores compitiendo por dominancia visual** — montoPagado (28pt) / dineroLibre (24pt) / stat values (26pt). El ojo no sabe dónde aterrizar primero.
8. **Copy "ESTE MES" redundante** — el cycle label ya dice "5 abr → 5 may"; "DINERO LIBRE ESTE MES" duplica el contexto.
9. **Bottom row con `borderTopColor`** — separador horizontal blanco/12% que parte la card en dos zonas, debilitando el sentido de "una sola unidad" que querría el hero.

---

## 🎨 Iteration 1 — REJECTED por owner

> Las tres direcciones de la primera tanda (A · Ledger, B · Cycle Dial, C · Calendar Grid — secciones más abajo) fueron rechazadas por owner. Feedback: "*ninguno me gusta. Mejor organizado, mejor distribuido, fácil de leer, fácil de entender, CUALQUIERA debe poder entenderlo. Buscamos algo ÚNICO. Con la creatividad del Wrapped mensual — eso era INSPIRACIÓN.*"
>
> Diagnóstico de por qué fallaron:
> - **A · Ledger**: demasiado denso en data, parece extracto bancario serio — no editorial-vivo como Wrapped.
> - **B · Dial**: el reflejo "fitness ring / activity dial" sigue siendo training-data obvio. Cae en el segundo-nivel del category-reflex check.
> - **C · Grid**: la grid de 30 celdas requiere "decodificación" — no es entendible en 2 segundos.
>
> Las 3 caen en el patrón "dashboard panel" cuando la inspiración Wrapped pide **portada editorial / momento de lectura**.

---

## 🏆 WINNER · Iteration 2 · A — El Titular

**Picked**: 2026-05-12 por owner. Quote: *"Ganador por excelencia, HERO - EL TITULAR, directo sencillo, completo y bastante informativo. Todo lo que buscamos."*

### Ajustes pedidos sobre el ganador

| Ajuste | Antes (preview v1) | Después (final) |
|---|---|---|
| Brand mark "MANIFIESTO" en header | sí (11pt 900 letter-spacing 2.4) | **fuera** |
| "edición abril" en header | sí (italic muted) | **fuera** |
| Línea de título | "MANIFIESTO · edición abril · X días al cierre" | **"GASTOS FIJOS · 5 ABR → 5 MAY"** (rescatado del hero viejo) |
| Línea sub | inexistente | **"Quedan X días · {dato valioso state-aware}"** |
| Dato valioso line 2 | n/a | pace vs ciclo / vencidos / empty CTA / cobrás mañana, etc |

### Pace datum state-aware (línea 2 del header)

| Estado | Sub copy |
|---|---|
| empty | `Quedan X días · cargá tus primeros fijos` |
| fin_ciclo + isAllPaid + ≤1 día | `Queda 1 día · cobrás mañana` |
| isAllPaid (general) | `Quedan X días · ciclo cerrado anticipado` |
| con_atraso (vencidos > 0) | `Quedan X días · {N} en atraso` |
| inicio (day ≤3, 0 pagados) | `Quedan X días · todo por pagar` |
| default | calc `pace = paidPct − cyclePct` → `adelantado Ypts` (≥8) / `atrasado Ypts` (≤−8) / `en línea con el ciclo` (resto) |

---

## 📐 Criterio ganador — SPEC reusable

Esta sección **define el criterio editorial** que ganó. Aplicar el mismo criterio a todos los componentes próximos del refactor (Próximos, SmartAlerts, Tabs, Category groups, Header bar). Si querés introducir un componente nuevo en cualquier pantalla del app, este es el filtro.

### 1. Lenguaje editorial · Wrapped DNA

- **Una idea dominante por componente**. No tablero, no widget grid.
- **Eyebrow tiny ALL CAPS** (10-11pt, weight 900, letter-spacing 1.8-2.4).
- **Headline editorial big type** cuando aplica (32-40pt, weight 900, tracking -1.4 a -2).
- **Rule short decorative** (28-32×2pt) entre eyebrow y headline, scaleX entrance.
- **Subhead 14pt weight 500 line-height 19** debajo del headline cuando hace falta contexto.

### 2. State-aware copy obligatoria

Cualquier sentencia visible del componente **adapta al estado del usuario**. No copy genérica fallback. Mínimo cubre los 6 estados canónicos:
- `inicio` (día ≤3 del ciclo, nada pagado)
- `al_dia` (on-pace, cero vencidos)
- `con_atraso` (vencidos > 0) — urgency color peach + dot pulse
- `todo_pagado` (100% antes del cierre)
- `sin_fijos` (empty state)
- `fin_ciclo` (último día del ciclo)

### 3. Restraint sobre decoración

- **Cero nested cards** (ban absoluto impeccable). Si un componente necesita "tile interno", convertirlo en row + divider o background tint.
- **Cero emojis como icons**. Usar MaterialIcons, dots de color, o tipografía pura.
- **Cero "ESTE MES" / "MENSUAL" redundante** cuando el header ya dice el ciclo.
- **Editorial restraint** sobre badge-pill-chip-soup. Cada chip tiene que ganar su lugar.

### 4. Header pattern (uniforme entre componentes)

```
EYEBROW · {ciclo o contexto}        ← ALL CAPS 10-11pt 900
{sub line con dato valioso}          ← state-aware 12pt 600
──                                   ← rule decorative 28pt scaleX
{cuerpo del componente}
```

### 5. Motion language

- **Cascade entrance** row-por-row (60-80ms stagger).
- `ease-out-expo` (`motionEasings.enterSmooth` — cubic-bezier(0.16, 1, 0.3, 1)) en todo lo que entra.
- `withDelay + withTiming(460ms)` standard para opacity + translateY.
- **Rule** anima `scaleX` con `transformOrigin: 'left'` (540ms).
- **CountUp** en todo monto $.
- **BreatheDot pulse** solo cuando hay urgency (vencidos / próximo HOY).
- **Reduced motion** = todos los valores iniciales pasan al estado final (zero motion).

### 6. Color usage

- **Gradient forest** (`theme.colors.heroGradient`) para componentes "hero-tier" (Titular).
- **CreamCard background** para componentes de soporte (Próximos, lista, tabs).
- **Peach (`#FFB59E` light / `#B84014` dark sólido) = urgencia**. Solo vencidos / today HOY.
- **Lime (`#A6EF8F`) = positivo**. Solo all-paid / al día.
- **Cream foundation (`#F2EAD3` / `theme.colors.heroText`) = neutral default**.

### 7. Layout & spacing

- **Card radius 20-24px**.
- **Padding 18-22px**.
- **Section gap 12px** entre componentes en el stack.
- **Inter-row gap 0** dentro de un componente — usar `divider` thin (1px @ 40% opacity) entre rows.
- **Tabular nums** para todo número.

---

## 🎨 Iteration 2 — 3 direcciones nuevas (Wrapped DNA)

El Wrapped del producto tiene una gramática editorial específica:
- **Una idea por escena** — sin grids de widgets compitiendo
- **Headline big editorial type** (40-60pt, weight 900, tracking -2)
- **Eyebrow tiny ALL CAPS** (11pt, 900, tracking 2.4)
- **Color committed por escena** — background es el tinte
- **Brand mark "MANIFIESTO"** como sello
- **Reading-paced** — el usuario LEE, no decodifica
- **Restraint sobre decoración** — un elemento dominante, dos de soporte

Las 3 direcciones nuevas heredan esa gramática y la adaptan al hero (que vive permanente en el screen, no es modal one-shot). El gradient forest se mantiene para coherencia con Home / Gastos.

### 🅰️ Dirección A — "El Titular"

**Premisa**: el hero es una **portada editorial**. Lee el estado del ciclo y escribe **una sola sentencia** que cualquiera entiende en 2 segundos. Como la portada de un diario que te dice "qué pasó", no como un dashboard que te exige interpretar widgets.

**Familia estética**: editorial restraint · magazine cover · _The New York Times A1 above-the-fold_ pero en finanzas personales. Aprovecha el cream + forest committed del Wrapped.

**Estructura**:

```
┌────────────────────────────────────────────────┐
│ MANIFIESTO · edición abril   ·   18 días al... │  ← eyebrow editorial
│ ──                                              │  ← rule 32×2pt cream-accent
│                                                 │
│ Te quedan 5                                     │  ← HEADLINE
│ fijos por pagar.                                │     34pt · weight 900 · tracking -1.4
│                                                 │
│ $180.000 en lo que resta del ciclo.             │  ← subhead 14pt cream-muted
│                                                 │
│ ─────────────────────────                       │
│ PAGADO       │  LIBRE       │  DEL SUELDO       │
│ $245.000     │  $380.000    │  42%              │  ← 3 footer metrics
│              │              │                   │
│ → PRÓXIMO   Netflix en 3 días · $12.500         │  ← actionable bottom line
└────────────────────────────────────────────────┘
```

**State-aware headline** (lee el estado y elige la sentencia más urgente):

| Estado | Headline | Tono |
|---|---|---|
| Hay vencidos | "Tenés **2 fijos** vencidos." | Peach-strong sobre forest (urgencia) |
| Hay pendientes (sin vencidos) | "Te quedan **5** fijos por pagar." | Cream (neutral) |
| Todo pagado | "Estás al día." | Lime accent (positivo) |

**Cómo cubre el inventario**: los 11 datos sobreviven repartidos en headline + subhead + 3-metric footer + bottom line. **Suma 2 datos nuevos**: la separación vencidos vs pendientes explícita y el `daysToNextPayment` con el item.

**Motion language**:
- Mount: cascade RiseView (eyebrow 0 → rule scaleX 60 → headline 140 → subhead 220 → footer 300 → bottom line 380).
- CountUp en los $ del footer.
- Cuando el estado cambia (e.g. user paga un fijo), el headline hace **cross-fade + blur 2px** durante 220ms hacia la nueva sentencia. Inspiración Emil ("blur masks imperfect transitions").
- BreatheDot color-coded migra según estado (cream / peach / lime).

**Pros**:
- ✅ **Cualquiera lo entiende en 2 segundos** — es una sentencia.
- ✅ Editorial restraint puro — un elemento dominante, dos de soporte.
- ✅ Rompe `hero-metric template` por construcción.
- ✅ Implementación baja — type + 3 columns + bottom line.
- ✅ Match perfecto con Wrapped DNA.

**Cons / riesgos**:
- ⚠️ Pierde la "spectacle" — el hero se siente más calmo, menos "wow". Pero esto puede ser exactamente lo que el producto necesita después de la sobre-decoración del actual.
- ⚠️ Necesita lógica de copy state-aware bien escrita (no genérica).

**Score**:
- `/impeccable`: ⭐⭐⭐⭐⭐ (editorial register escapa categoría-reflex y reflex-2; no template; no nested cards)
- `/emil`: ⭐⭐⭐⭐⭐ (motion meaningful: el cross-fade del headline ES la cause-effect del pago)
- `/ui-pro-max`: ⭐⭐⭐⭐⭐ (readable-font-size; visual-hierarchy clarísima; touch-target del bottom line)

---

### 🅱️ Dirección B — "Pasaje del ciclo"

**Premisa**: el pay-cycle ES un viaje de payday a payday. ABR → MAY como una ruta. **Hoy** es el sello de embarque, los fijos son las paradas. **Boarding pass aesthetic**. Universal — todos sabemos leer un pasaje.

**Familia estética**: travel-document · boarding-pass · _Apple Wallet ticket_. Rompe completamente con cualquier convención de finance app. Es un objeto físico-emocional, no un panel.

**Estructura**:

```
┌────────────────────────────────────────────────┐
│ ▪ MANIFIESTO            PASAJE DEL CICLO       │  ← brand + label
│                                                 │
│ ABR    ┄┄┄┄━━━━━━●━━━━━━┄┄┄┄┄┄┄┄    MAY        │  ← route line
│ 05            HOY · día 12                  05 │
│                                                 │
│ PAGADO         PRÓXIMO          POR PAGAR      │  ← 3-col ticket info
│ $245.000       Netflix          $180.000       │
│ 5 ítems        en 3d · $12.500  5 ítems        │
│                                                 │
│ ╳ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ╳        │  ← PERFORATION (ticket stub)
│                                                 │
│ ESTADO                      LIBRE DEL CICLO    │  ← stub band
│ ● 2 vencidos · $38k         $380.000           │
│                             42% del sueldo a   │
│                                       fijos    │
└────────────────────────────────────────────────┘
```

**Detalle visual**:
- Route line: 28 dashes pequeños. Los dashes detrás del today marker son lime (already-traveled), los dashes después son cream-12% (yet-to-travel).
- Today marker: dot 14pt lime con border cream-paper 2pt. Marca el punto exacto del ciclo.
- Perforación: notches semi-circulares en los bordes (negative space) + dashes horizontales. Visualmente "cortable" como un ticket de avión.
- Stub band debajo: la zona "que te quedás" después de cortar el ticket. Estado urgente + libre.

**Cómo cubre el inventario**: 11/11 datos. **Suma 3 datos nuevos**: el `daysToNextPayment` con el item en column PRÓXIMO, el cycle progress visual en la route line, y la separación explícita vencidos.

**Motion language**:
- Mount: el route line se "dibuja" izq→der (`scaleX` 800ms ease-out-expo). El today marker hace bounce-in (`scale 0 → 1.12 → 1` spring) cuando llega su posición.
- Cuando today avanza un día (mount diario), el marker se desliza con spring damping 14.
- Cuando pagás un fijo, los dashes correspondientes a su día parpadean lime (1 cycle, 220ms each) y luego se quedan lime fijo.
- Perforation: estática (es chrome del "objeto").
- CountUp en los $ de las columnas.

**Pros**:
- ✅ **Único** — ninguna finance app del mainstream usa boarding-pass como hero.
- ✅ Metáfora universal: todos viajamos, todos sabemos leer un pasaje.
- ✅ El time axis horizontal es **intuitivo** — la vida es lineal.
- ✅ La perforación da una "tactilidad" que hace el hero memorable.
- ✅ Permite ver simultáneamente el **eje tiempo** (route line) + el **eje dinero** (3 cols).

**Cons / riesgos**:
- ⚠️ Si el usuario nunca viajó en avión / no le hace clic la metáfora — pero esto es rare en target Argentina urbano.
- ⚠️ Implementación media — la perforación con notches + dashes pixel-perfect requiere atención.
- ⚠️ El today marker label necesita lógica de centrado cuando está cerca de los bordes (clamp).

**Score**:
- `/impeccable`: ⭐⭐⭐⭐⭐ (rompe categoría-reflex Y reflex-2; metáfora travel evita "fintech navy+gold" Y "editorial-cream-cliche")
- `/emil`: ⭐⭐⭐⭐⭐ (motion intencional: route-draw direccional, today-bounce significa "hoy llegaste", marker-glide diario)
- `/ui-pro-max`: ⭐⭐⭐⭐⭐ (visual-hierarchy fuerte; time-as-axis intuitivo; touch-targets en cada col)

---

### 🅲 Dirección C — "Manifiesto Diario"

**Premisa**: el hero ES un **mini-Wrapped** en place. 3 páginas con gramática stories (progress bars top + brand mark + una sentencia cada una), auto-rotando cada 5 segundos. Tap left/right navega manual. Es **literalmente** la DNA del Wrapped collapsed en un hero tile.

**Familia estética**: editorial-stories · _Spotify Wrapped 2024_ pero en finanzas personales y cream-on-paper. Aprovecha que el usuario ya conoce la gramática del Wrapped mensual (consistency wins).

**Estructura** — 3 páginas que rotan:

```
PÁGINA 1 — "El estado"
┌────────────────────────────────────────────────┐
│ ████████  ──────  ──────                       │  ← 3 progress bars (Wrapped grammar)
│ MANIFIESTO · ABRIL                              │  ← brand mark
│                                                 │
│ HOY                                             │  ← eyebrow tiny
│                                                 │
│ 5 fijos                                         │  ← HERO 40pt
│ por pagar.                                      │
│ ──                                              │  ← rule
│ $180.000 en lo que resta del ciclo.             │  ← kicker
│ 2 vencidos.                                     │
└────────────────────────────────────────────────┘

PÁGINA 2 — "El próximo"
┌────────────────────────────────────────────────┐
│ ████████  ████████  ──────                     │
│ MANIFIESTO · ABRIL                              │
│                                                 │
│ PRÓXIMO                                         │
│                                                 │
│ Netflix                                         │
│ en 3 días.                                      │
│ ──                                              │
│ $12.500 · este viernes.                         │
└────────────────────────────────────────────────┘

PÁGINA 3 — "El ciclo"
┌────────────────────────────────────────────────┐
│ ████████  ████████  ████████                   │
│ MANIFIESTO · ABRIL                              │
│                                                 │
│ CICLO ABRIL                                     │
│                                                 │
│ 18 días                                         │
│ restantes.                                      │
│ ──                                              │
│ Vas 57% pagado. Libre $380.000.                 │
└────────────────────────────────────────────────┘
```

**Color treatment**: background cream-paper (`#FFFBF2` light, `#2A3A2F` dark) — committed paper para diferenciarse de la cascada de forest-gradient del resto del screen. Es el único hero del app que NO usa el gradient forest. Statement.

**Cómo cubre el inventario**: 11/11 datos repartidos en 3 páginas. **Suma 2 datos nuevos**: separación vencidos explícita + day-of-week del próximo.

**Motion language** (gramática Wrapped completa portada):
- Progress bars 5s linear cada uno. Auto-advance.
- Crossfade entre páginas 360ms ease-out-expo (idéntico al Wrapped modal).
- Long-press pausa (haptic selection). Tap left/right navega manual.
- Hero text rise 8pt + opacity 0→1 al entrar.
- Si reduced-motion: bars instant 100%, no auto-advance.

**Pros**:
- ✅ **Consistency total con Wrapped** — usuario reconoce la gramática.
- ✅ Una idea por página = anyone gets it.
- ✅ Editorial restraint máximo.
- ✅ El cream-paper background **rompe** el monotono visual del screen (todo el resto es forest gradient), genera respiración.
- ✅ Permite **adaptive copy** por página — cada page resuelve una pregunta distinta.

**Cons / riesgos**:
- ⚠️ **Interaction overhead** — el usuario que abre el screen quiere VER de un vistazo. Si tiene que esperar la rotación o tappear, fricción. Mitigación: la página 1 default es el estado, lo más importante.
- ⚠️ Auto-rotación puede ser molesta en sessions largas — necesita pausar cuando el screen está scrolleado abajo (perdió foco).
- ⚠️ Si reduced-motion: usuario tiene que tappear para ver páginas 2 y 3 → potencial info-loss. Mitigación: surfaces los 3 cards estáticos uno abajo del otro en reduced-motion.
- ⚠️ Implementación más alta (state machine de páginas + progress driver + gesture handlers).

**Score**:
- `/impeccable`: ⭐⭐⭐⭐⭐ (editorial register puro; Wrapped consistency)
- `/emil`: ⭐⭐⭐⭐ (motion-meaning fuerte pero auto-advance puede frustrar si la app espera del user que actúe)
- `/ui-pro-max`: ⭐⭐⭐⭐ (gesture-feedback OK; reduced-motion necesita trabajo extra)

---

## 🔬 Comparativa Iteration 2

| Dimensión | A · Titular | B · Pasaje | C · Manifiesto |
|---|---|---|---|
| "Anyone gets it en 2s" | ✅✅✅ (es una sentencia) | ✅✅ (es un pasaje, leés de izq a der) | ✅✅ (una idea por pág, pero hay que esperar / tappear) |
| Unicidad real | Alta — editorial state-aware copy | **Muy alta** — boarding pass en finance app es inusitado | Alta — Wrapped DNA en hero permanente |
| Wrapped consistency | ⭐⭐⭐⭐ (DNA editorial completa) | ⭐⭐⭐ (cambia paradigm) | ⭐⭐⭐⭐⭐ (es literalmente Wrapped grammar) |
| Implementación | **Baja** | Media | Alta |
| Riesgo "se siente template" | Bajo | Muy bajo | Bajo |
| Necesita interaction | No | No | **Sí (rotation)** |
| Datos visibles simultáneos | 11 (todos en un golpe) | 11 (todos en un golpe) | 5-7 por página (rota) |
| Mejor para... | Vista de uso permanente, glance-and-go | Quien quiere ver el ciclo como objeto/journey | Quien valora la consistency con el Wrapped y la one-idea-at-a-time |

**Recomendación honesta**:

🅰️ **El Titular** si querés **rápido + máximo signal + lectura natural**. Es la dirección con menor riesgo, máxima legibilidad, y la que más permite mostrar todo en un golpe sin que el usuario interactúe. Es lo que más respeta tu frase "*siempre vamos a ingresar para revisar qué pagamos y qué nos falta*" — abre, leés una sentencia, sabés qué hacer.

🅱️ **El Pasaje** si querés **innovación memorable + metáfora que se cuenta**. Es la dirección que **más se diferencia** del resto del app y del mercado. El boarding pass es objeto que invita a "guardarlo", "compartirlo", "verlo cada día". Riesgo: la metáfora puede sentirse forzada si no se ejecuta con precisión (la perforación tiene que ser perfecta).

🅲 **Manifiesto** si querés **consistency total con Wrapped + storytelling editorial**. Pero pensemos si el hero **siempre-presente** debe ser slideshow — Wrapped es one-shot mensual, el hero es diario.

---

> **Importante**: estas son direcciones conceptuales para que el owner elija. No son detail-locked — la dirección elegida pasa a una sesión de craft con render real.

## 🗑️ Iteration 1 — propuestas rechazadas (referencia histórica)

Las 3 propuestas iniciales se mantienen abajo solo para traceability. Owner rechazó las 3. Saltear a "Iteration 2" si solo te interesa lo vigente.

### 🅰️ Dirección A — "The Ledger" (REJECTED)

**Premisa**: el hero ES un extracto/recibo. Tipografía editorial, sin progress bar, sin nested cards. Información ordenada como una declaración financiera — el ratio paid/total se infiere de la jerarquía tipográfica, no de una barra.

**Familia estética**: editorial-tipográfica · contable · _Monocle magazine_ meets _Things 3 receipt view_. Rompe con la categoría "fintech-saas-dashboard".

**Estructura propuesta**:

```
┌───────────────────────────────────────────────────┐
│ ABR — ciclo 5 abr / 5 may         · 18 días       │  ← eyebrow editorial
│                                                   │
│ FIJOS DEL CICLO                                   │  ← label restraint
│ $ 425.000                                         │  ← total (24pt cream)
│                                                   │
│ ──────────────────────                            │  ← rule (1px @ 12% opacity)
│                                                   │
│ pagado          $ 245.000   ·  5 ítems            │
│ por pagar       $ 142.000   ·  3 ítems            │
│ vencido         $  38.000   ·  2 ítems  ← rojo    │  ← jerarquía por línea
│                                                   │
│ ──────────────────────                            │
│                                                   │
│ Libre del ciclo    $ 380.000  ·  42% va a fijos   │
│                                                   │
│ Próximo →  Netflix · 3 días · $ 12.500            │  ← upcoming primer item
└───────────────────────────────────────────────────┘
```

**Cómo cubre el inventario**:
- `total` se promociona a hero number (era denominator escondido).
- Pending / Overdue separados explícitamente con sus montos + counts.
- `daysToNextPayment` + primer item de `upcoming` se promueven al hero.
- `freeAfterFijos` + `pctOfIncome` se compactan a una sola línea de cierre.
- Progress bar visual se reemplaza por: cada línea de monto es proporcional al peso real (font-size sutil + bullet count). El ratio queda implícito.

**Motion language**:
- Mount: cascade vertical (RiseView 0/80/160/240/320/400 línea por línea).
- CountUp en los 4 montos $.
- Rule lines crecen de 0% a 100% width (`scaleX` 280ms ease-out-quart) escalonadas.
- BreatheDot se mueve al pre-monto del overdue line solo si overdue > 0 (señal de urgencia direccional).

**Pros**:
- ✅ Rompe el `hero-metric template` (impeccable ban) por construcción.
- ✅ Cero nested cards (impeccable ban).
- ✅ Pending vs overdue queda explícito → más signal.
- ✅ Editorial restraint diferencia la app de cualquier otra finance app.
- ✅ Funciona en light y dark sin reinterpretar tonalidades (es type-driven).

**Cons / riesgos**:
- ⚠️ Sin progress bar puede sentirse menos "dashboard-like" — algunos usuarios esperan barra. Mitigación: la jerarquía tipográfica + rule lines reemplaza la métáfora visual.
- ⚠️ Density alta: 4 zonas de info en lugar de las 3 actuales. Necesita espaciado riguroso.

**Score por skill**:
- `/impeccable`: ⭐⭐⭐⭐⭐ (editorial register que escapa categoría-reflex; no template; no nested cards)
- `/emil`: ⭐⭐⭐⭐ (motion intencional; restraint sobre decoración)
- `/ui-pro-max`: ⭐⭐⭐⭐ (typography hierarchy fuerte; line-length OK; falta solo affordance de tap si queremos hacer overdue tappable)

---

### 🅱️ Dirección B — "The Cycle Dial" (REJECTED)

**Premisa**: reemplazar la progress bar lineal por un **dial radial geométrico** que muestra simultáneamente:
- El progreso del **ciclo de tiempo** (qué día del cycle estamos)
- El progreso del **pago de fijos** (qué % está pagado)
- Los **eventos discretos** (cada fijo upcoming es un tick en el arco)

No es donut chart genérico. Es un dial con dos arcos concéntricos + 12 tick marks (un tick por día con un fijo). El día de hoy es un radio destacado.

**Familia estética**: instrumento de precisión · _watch face_ · _Apple Watch activity rings reimagined for finance_. Rompe con "fintech navy + gold" porque mantiene el forest gradient pero el lenguaje no es dashboard, es **instrumento**.

**Estructura propuesta**:

```
┌───────────────────────────────────────────────────┐
│ GASTOS FIJOS · 5 abr → 5 may              ● vivo  │
│                                                   │
│         ╭───────────────╮                         │
│        ╱                 ╲          $ 245.000     │
│       │     ┌─────────┐   │         pagado        │
│       │     │   57%   │   │                       │
│       │     │  pagado │   │         $ 180.000     │
│       │     │         │   │         por pagar     │
│       │     │  18 días│   │           (2 vencidos)│
│       │     │  hasta  │   │                       │
│       │     │  5 may  │   │         Próximo:      │
│       │     └─────────┘   │         Netflix · 3d  │
│        ╲                 ╱                        │
│         ╰───•──────•─────╯                        │
│           ↑                                       │
│       ticks = días con fijos                      │
│       outer arc = paid/total                      │
│       inner arc = cycle progress                  │
│                                                   │
│ ─────────────────────────                         │
│ Libre del ciclo  $ 380.000      42% va a fijos    │
└───────────────────────────────────────────────────┘
```

**Cómo cubre el inventario**:
- Arco exterior = `paidPct` (animated stroke-dashoffset).
- Arco interior = `(cycleDays - daysRemaining) / cycleDays`.
- Ticks en el arco = `summary.upcoming` posicionados por `daysUntilDue` mapeado al ángulo.
- Centro: 57% + 18 días + fin de ciclo (datos densos pero pequeños).
- Derecha: paid / pending split + upcoming top-1.
- Bottom row: libre + % sueldo (compactado en una línea, no separado por rule).

**Motion language**:
- Mount: ambos arcos animan `withTiming(progress, { duration: 1100, easing: motionEasings.decelerate })`.
- Ticks aparecen como un stagger 60ms tras el arco completarse (`scale 0.4 → 1 + opacity 0 → 1`).
- BreatheDot pulse migra al **tick del próximo fijo** (señalización direccional).
- CountUp en montos.

**Pros**:
- ✅ Rompe el `hero-metric template` con un lenguaje gráfico (radial) en lugar de tipográfico.
- ✅ Innovación visual real — no es un donut chart típico; es un dial con ticks específicos de los fijos reales.
- ✅ Cubre simultáneamente "qué % pagué" + "cuánto del ciclo pasó" — dos preguntas distintas que el hero actual no resuelve juntas.
- ✅ Direccionalidad del breathe dot → tick del próximo = "te falta este".

**Cons / riesgos**:
- ⚠️ Más complejo de implementar (SVG con react-native-svg, ángulos calculados, stroke-dashoffset animado).
- ⚠️ Puede sentirse "watch-y" o "fitness-app-y" si no se ejecuta con precisión. Necesita restraint en el centro (no llenar).
- ⚠️ Más alto en el viewport (las dimensiones del dial necesitan ~180×180) — hay que confirmar que cabe sin empujar las siguientes secciones fuera del fold.
- ⚠️ Accesibilidad: necesita aria/accessibility composed labels para que VoiceOver lea "57% pagado, 18 días restantes, próximo fijo Netflix en 3 días".

**Score por skill**:
- `/impeccable`: ⭐⭐⭐⭐ (rompe categoría-reflex pero el donut/ring es reflejo training-data de "fitness/activity ring" — mitigado si los ticks son protagonistas, no decoración)
- `/emil`: ⭐⭐⭐⭐⭐ (motion meaning altísimo: cada tick es un fijo real; dot direccional)
- `/ui-pro-max`: ⭐⭐⭐⭐ (visual hierarchy clara; a11y necesita trabajo extra)

---

### 🅲 Dirección C — "The Calendar Grid" (REJECTED)

**Premisa**: el hero es una **mini-grid del ciclo** (28-31 cuadritos para los días del ciclo), con dots/heat indicando qué días tienen fijos. El día de hoy está destacado. Cada celda con un fijo tiene su color de categoría. Cada celda con fijo pagado tiene un check sutil, cada celda con fijo vencido un dot rojo.

Esto colapsa hero + `FijosUpcomingStrip` (la siguiente sección) en una sola unidad. Habría que decidir si la strip se elimina o se reduce a "mes pasado" para comparación.

**Familia estética**: calendar-as-hero · github-contribution-graph reimagined for finance · raw data made tactile. Rompe con "card-list-dashboard" por completo.

**Estructura propuesta**:

```
┌───────────────────────────────────────────────────┐
│ CICLO ABRIL · 5 abr → 5 may          18 días más  │
│                                                   │
│  L  M  M  J  V  S  D     ← weekday header         │
│  ─  ─  ●  ─  ●  ─  ─                              │
│  ─  ●  ─  ─  ─  ─  ✓     ← ya pasados con check   │
│  ✓  ─  ─  ✓  ─  ─  ●     ← hoy = ring             │
│  ●  ─  ─  ─  ─  ─  ─     ← futuro = dot color cat │
│  ◯  ─  ─  ─  ─               ← último día = ring  │
│                                                   │
│   ● = fijo este día      ✓ = pagado     ⚠ = venció│
│                                                   │
│ ─────────────────────────────────                 │
│ Pagado     Por pagar    Vencido     Libre         │
│ $ 245.000  $ 142.000    $  38.000   $ 380.000     │
│ 5 ítems    3 ítems      2 ítems     42% a fijos   │
└───────────────────────────────────────────────────┘
```

**Cómo cubre el inventario**:
- Cada celda = día del ciclo. Color = categoría del fijo de ese día (multi-fijo en mismo día → stack o dot+ring).
- Today celda = ring outline + scale 1.1.
- Estados por celda: paid (check), pending (dot color cat), overdue (red ring).
- Bottom row: 4 columnas con los 4 totales (paid/pending/overdue/libre).
- `pctOfIncome` baja a una línea muy sutil.
- Sin progress bar — la grid ES el progress.

**Motion language**:
- Mount: stagger de celdas (left-to-right, top-to-bottom). 30ms por celda → ~120ms primera fila → ~840ms última (con cap).
- Tap en celda con fijo → bottom sheet con detalle de ese día (los fijos que vencen). Tap on today → scroll smooth a la sección de "Por pagar".
- Today ring pulse continuous (BreatheDot escalado a ring 22pt).

**Pros**:
- ✅ Rompe totalmente el `hero-metric template`. **Esto es la innovación más fuerte** de las 3.
- ✅ El hero es **interactivo** — cada celda es tappable. Convierte el hero de "panel pasivo" a "navegador del ciclo".
- ✅ Cubre la pregunta del owner directamente: "qué pagamos y qué nos falta" se ve en un golpe de vista (los checks vs los dots).
- ✅ Colapsa duplicación con `FijosUpcomingStrip` (que hace algo parecido pero más chico). Posible simplificar / eliminar la strip.
- ✅ Si el usuario tiene 8+ fijos en el ciclo, el grid revela patrones (quincenas, fin de mes, etc.) que ninguna otra dirección muestra.

**Cons / riesgos**:
- ⚠️ El hero crece en altura (~5-6 rows × 7 cols + headers + bottom row). Necesita confirmar que el screen sigue dando "fold" relevante.
- ⚠️ Si el usuario tiene solo 2-3 fijos en el ciclo, la grid se siente "vacía" — necesita un empty-grid alternativo (e.g. concentración en una sola línea de "Próximos fijos").
- ⚠️ A11y: 28-31 celdas requiere navigation thoughtful (accessibilityRole, focus order). Pero hay precedent con date pickers nativos.
- ⚠️ Implementación moderada (es solo grid + estado por celda + tap handler).

**Score por skill**:
- `/impeccable`: ⭐⭐⭐⭐⭐ (rompe categoría-reflex Y reflex-2; ningún otro app financiera mainstream usa grid del ciclo como hero)
- `/emil`: ⭐⭐⭐⭐⭐ (interaction-driven; cada celda es purpose-driven motion; today pulse es señal direccional)
- `/ui-pro-max`: ⭐⭐⭐⭐⭐ (touch-target en cada celda; tap-feedback; clear interaction model; visual hierarchy fuerte)

---

## 🔬 Comparativa de las 3 direcciones

| Dimensión | A · Ledger | B · Dial | C · Grid |
|---|---|---|---|
| Rompe `hero-metric template` | ✅ Por tipografía | ✅ Por gráfica | ✅ Por interacción |
| Rompe `nested cards` | ✅ Cero cards anidadas | ✅ Cero cards anidadas | ✅ Cero cards anidadas |
| Datos del hero actual preservados | 11/11 | 11/11 | 11/11 |
| Datos nuevos surfaced | +3 (overdue separado, daysToNext, upcoming-1) | +3 (cycle progress arc, ticks por fijo, upcoming-1) | +5 (overdue separado, cycle layout completo, days con fijos, distribución temporal, upcoming-1) |
| Interacción nueva | Posible tap en overdue line | Tap en ticks → detalle día | **Cada celda tappable** |
| Innovación visual | Media — restraint editorial | Alta — instrumento gráfico | **Muy alta — interactive calendar hero** |
| Complejidad implementación | **Baja** (solo type + rule lines) | Alta (SVG + ángulos) | Media (grid + tap handlers) |
| Riesgo "se siente fitness app / dashboard" | Bajo | **Medio** (donut reflex) | Bajo |
| Riesgo de empty state pobre | Bajo | Bajo | **Medio** (grid casi vacía con pocos fijos) |
| Compatibilidad con dark mode actual | Excelente | Excelente | Excelente |
| Permite mantener `ShineOverlay` / `CardParticles` | Sí (sutil) | Sí (detrás del dial) | Marginalmente (la grid compite) |

**Recomendación honesta**: **C · Calendar Grid** si tenemos tiempo de iterar — es la que más responde a la frase del owner "**siempre vamos a ingresar porque debemos revisar qué pagamos y qué aún nos falta**". El hero se transforma en herramienta, no en panel.

**Alternativa pragmática**: **A · Ledger** si queremos cerrar la etapa 1 rápido y validar el lenguaje editorial antes de invertir en interactividad — sirve también como base para que A+C convivan en el futuro (Ledger arriba, Grid abajo).

**No recomiendo B · Dial primero** — el riesgo de donut-reflex + costo de implementación SVG vs el ganacial de signal no compensa cuando C lo cubre + es interactivo.

---

## 🧠 Backend value-add — propuestas

El owner aceptó sugerencias que agreguen valor al backend. Estas no son necesarias para la etapa 1 pero las dejo pre-evaluadas para futuras etapas.

### V1 · `paid_on_time_streak` (per familia, per ciclo)

**Qué**: contador de ciclos consecutivos donde el % de fijos pagados antes de su `next_due_on` superó un threshold (e.g. 90%).

**Por qué**: el hero hoy te dice "cómo vas este ciclo". No te dice "tu récord". Un streak es coaching incentive sin tener que escribir copy ad-hoc.

**Dónde vive**: tabla `family_finance` o tabla nueva `family_streaks` con columnas `(family_id, current_streak, longest_streak, last_evaluated_cycle)`. Computado nightly via cron / al cierre de cada ciclo.

**Surface en hero**: badge sutil "5° ciclo seguido" al lado del cycle label.

### V2 · `cycle_creep_delta`

**Qué**: diferencia entre `summary.total` actual y el de los 1-3 ciclos anteriores. Sirve para detectar "tus fijos crecieron 12% en 3 ciclos sin que te dieras cuenta".

**Por qué**: el hero hoy solo muestra el snapshot. Sin comparación cycle-over-cycle, los aumentos chiquitos se acumulan invisibles (los hikes individuales que SÍ se detectan son por item, no por total agregado).

**Dónde vive**: agregado SQL en `home_snapshot` extendido o nuevo `fijos_snapshot`. Cycle aggregation desde `fixed_expense_payments` + history de `fixed_expenses.amount`.

**Surface en hero**: micro-trend chip "↑ +8% vs ciclo anterior" al lado del total. Verde si bajó, rojo si subió.

### V3 · `concentration_top3`

**Qué**: % del `summary.total` que se va en los 3 fijos más caros. Si > 60%, surface como concentration risk.

**Por qué**: una familia con 8 fijos donde 3 son el 70% tiene exposure asymmetric. Saberlo permite decisiones (renegociar el top, no el resto).

**Dónde vive**: calculable client-side desde `items` ordenados desc. No requiere backend si lo hacemos en `summarizeFijos`. Mantener un threshold configurable.

**Surface en hero**: en empty state del grid (dir C) o como línea adicional en ledger (dir A): "70% de tus fijos = Netflix + Personal + Alquiler".

### V4 · `paid_velocity_index`

**Qué**: ratio entre el % pagado hasta hoy del ciclo vs el % ideal de ritmo (e.g. cycleDay 18 de 30 → ideal pace = 60%; si pagaste 45%, ratio = 0.75 → "atrás del ritmo").

**Por qué**: el % pagado por sí solo no dice si estás atrasado o adelantado **considerando el día del ciclo**. El velocity index lo hace.

**Dónde vive**: client-side derivado, no requiere backend.

**Surface en hero**: codiciable como semáforo del breathe dot color: verde si on-pace, amber si atrás, rojo si muy atrás. Cero copy adicional.

### V5 · `fijos_snapshot` RPC

**Qué**: extender el patrón snapshot RPC que ya existe en Home / Gastos (referenciado en memoria `project_snapshot_rpc_pattern`) a Fijos. Hoy el screen carga 4 queries separados: `fixedExpenses` + `categories` + `familyFinance` + `expenses` + `fixedExpensePayments`. Son 5 round-trips.

**Por qué**: si el owner reporta que la vista tarda en aparecer al primer mount, este es el lever más fuerte. Memoria indica que ya se aplicó con éxito en Home + Gastos.

**Dónde vive**: nueva RPC `fijos_snapshot(family_id)` en Supabase que devuelve `{ items, payments_this_cycle, commitment_expenses, categories, monthly_income, savings_goal }` en una sola call.

**Surface en hero**: indirecto — los datos llegan más rápido, el hero pinta sin loading state si el seed es válido.

**Coste**: alto-medio. Requiere SQL + integración en `useFijosController` con seed hook. Recomiendo dejarlo para Sprint dedicado posterior.

---

## 🚦 Roadmap por etapas

| Etapa | Alcance | Estado | Dependencias |
|---|---|---|---|
| **0** | Análisis + propuesta de direcciones | ✅ DONE | — |
| **1** | Iteration 1 (Ledger / Dial / Grid) — mocks estáticos | ✅ REJECTED por owner | — |
| **2** | Iteration 2 (Titular / Pasaje / Manifiesto) — mocks estáticos | ✅ DONE | — |
| **3** | Live preview con state explorer (6 estados × 3 variantes con motion) | ✅ DONE | Etapa 2 |
| **4** | Owner picks Iteration 2 · A · El Titular | ✅ WINNER | Etapa 3 |
| **5** | Refactor header del Titular: out "MANIFIESTO/edición", in "GASTOS FIJOS · {ciclo} + pace state-aware" | ✅ DONE | Etapa 4 |
| **6** | **Próximos · editorial spread** (reemplaza FijosUpcomingStrip viejo) | ✅ DONE | Etapa 5 |
| **7** | SmartAlerts editorial — si se mantiene aparte; sino merge en Próximos como `hikeDeltaPct` badge inline | 🔴 NEXT | Etapa 6 |
| **8** | Tabs + Category groups · refactor con criterio Spec | 🔴 TO DO | Etapa 7 |
| **9** | Header bar + FAB botón "+" del screen | 🔴 TO DO | Etapa 8 |
| **10** | Promover componentes seleccionados al `FijosHeroCard` / `FijosUpcomingStrip` / `FijosSmartAlerts` reales + integración con `useFijosController` | 🔴 TO DO | Etapa 9 |
| **11** | Opcional — backend value-adds (V1-V5). Pick 1-2 alta-relación-valor/costo | 🔴 TO DO | Etapa 10 |

### Componentes seleccionados (vivo en `/settings/dev/fijos-seleccion-final`)

| # | Componente | Reemplaza a | Archivo preview | Estado |
|---|---|---|---|---|
| 1 | Hero · El Titular | `FijosHeroCard` | `mobile/components/fijos-hero-preview/titular-hero-live.tsx` | ✅ WINNER |
| 2 | Próximos · Editorial (canon) | `FijosUpcomingStrip` | `mobile/components/fijos-hero-preview/proximos-live.tsx` | ✅ WINNER por defecto · 3 alternativas más a comparar |
| 3 | _por definir_ | `FijosSmartAlerts` | _siguiente etapa_ | 🔴 |
| 4 | _por definir_ | `FijosTabs` + `FijoCategoryGroups` | _siguiente etapa_ | 🔴 |

### Próximos · 4 variantes a comparar (vivo en `/settings/dev/fijos-proximos-variants`)

| Variante | Idea | Archivo | Estado |
|---|---|---|---|
| **A · Editorial list** | rows tipográficas con dividers thin · canon default | `proximos-live.tsx` | ✅ DONE |
| **B · Proximity bars** | ancho de barra = urgencia · barra anima fill L→R | `proximos-bars-live.tsx` | ✅ DONE |
| **C · Timeline horizontal** | línea HOY → FIN CICLO · 3 dots scale-in spring | `proximos-timeline-live.tsx` | ✅ DONE |
| **D · Hierarchy asimétrico** | el próximo en grande, los otros 2 referencia compacta | `proximos-hierarchy-live.tsx` | ✅ DONE |

### Theme-aware palette · contraste verificado

Helper centralizado en `mobile/components/fijos-hero-preview/proximos-colors.ts` (`buildProximosPalette(theme)`). Las 4 variantes consumen la misma paleta:

| Token | Light (sobre creamCard ~#FFFDF6) | Dark (sobre creamCard ~#2C3530) | Uso |
|---|---|---|---|
| `urgency` | `#B84014` (5.38:1 AA) | `#F2A78C` (6.8:1 AA) | vencidos label, HOY, hike badge, amount urgente |
| `urgencyStrong` | `#8E2A0C` (7.8:1 AAA) | `#FFB59E` (8.1:1 AAA) | VENCIÓ HACE Xd label, hero amount overdue |
| `urgencyBadgeBg` | `rgba(184,64,20,0.06)` | `rgba(242,167,140,0.12)` | hike badge bg |
| `urgencyBadgeBorder` | `rgba(184,64,20,0.35)` | `rgba(242,167,140,0.45)` | hike badge border |
| `success` | `#1F590D` (8.4:1 AAA) | `#A6EF8F` (7.4:1 AAA) | all-paid check, on-pace, timeline fill |
| `trackBg` | `rgba(18,33,26,0.08)` | `rgba(242,234,211,0.10)` | bar track inactivo, timeline track |
| `barNear / barMid / barFar` | red `#B84014` / amber `#C8841A` / green `#1F590D` | peach `#F2A78C` / amber `#F3BA57` / lime `#A6EF8F` | bar fill por proximidad |

Cualquier componente futuro que necesite urgency / success / track debe usar este helper en lugar de hex literals.

---

## 🎯 Próximo paso — siguiente componente

Componentes ya en `Selección final`:
1. ✅ Hero · El Titular (con header ajustado: ciclo + pace state-aware)
2. ✅ Próximos · Editorial (reemplaza UpcomingStrip con 3 cards anidadas + emojis)

**Siguiente decisión**: ¿qué hacemos con `FijosSmartAlerts`?

- **Opción A**: mantener aparte. Si las hikes son una preocupación distinta a "qué pago próximo", separar conceptos en surfaces distintos respeta la jerarquía cognitiva.
- **Opción B**: **mergear en Próximos** vía el `hikeDeltaPct` badge inline (el badge `↑ +12%` ya está renderizado en el Próximos del preview). Si el hike afecta a un fijo del top 3 upcoming, lo destaca en su row. Si afecta a uno fuera del top 3, lo subimos al top con override.

Mi recomendación: **B · merge**. Razones:
- La SmartAlerts card actual es **conditional + solo visible cuando hay hikes**, fragmenta el layout (a veces sí, a veces no).
- El badge `↑ +12%` dentro del row de Próximos ya da la info accionable (el fijo subió de precio + cuándo se paga).
- Reduce 1 surface en el screen → más densidad útil sin agregar componentes.
- Si hay hikes pero no están en el top 3 upcoming, ordenamos por urgencia (hike + days), no sólo by days.

Esperando tu confirmación para arrancar la etapa 7 (decidir merge vs separate + diseñar como corresponda).

---

## 📝 Log

- **2026-05-12** — Doc creado. Etapa 0 (análisis línea por línea + inventario de datos + 3 direcciones conceptuales + backend value-adds) cerrada. Esperando pick del owner.
- **2026-05-12** — Preview screen `/settings/dev/fijos-hero-preview` mounted con Iteration 1 (Ledger / Dial / Grid).
- **2026-05-12** — Owner rechazó Iteration 1: "*ninguno me gusta. Mejor organizado, más fácil, CUALQUIERA debe entenderlo, UNICO, creatividad como el Wrapped mensual*". Estudio del Wrapped → DNA editorial extraída → Iteration 2 propuesta con 3 direcciones nuevas: **A · El Titular** (magazine cover headline state-aware), **B · Pasaje del ciclo** (boarding pass aesthetic), **C · Manifiesto Diario** (mini-Wrapped en hero). Preview screen actualizado.
- **2026-05-12** — Live preview screens montadas: 3 dev routes (`/settings/dev/fijos-hero-{titular|pasaje|manifiesto}`) con selector de 6 estados (inicio / al día / con atraso / todo pagado / sin fijos / fin de ciclo) y motion completa por variante. Cada cambio de estado replay entrance vía `key={stateId-nonce}`.
- **2026-05-12** — **Owner picks 🏆 A · El Titular**: *"Ganador por excelencia. Directo, sencillo, completo y bastante informativo."* Ajustes pedidos: fuera "MANIFIESTO" + "edición abril", in "GASTOS FIJOS · {ciclo cargado}" + sub-line state-aware con pace vs ciclo.
- **2026-05-12** — Etapa 5 cerrada: header del Titular reworked. Line 1 = ciclo del usuario. Line 2 = días + dato valioso state-aware (pace adelantado/atrasado/en línea, vencidos count, empty CTA, cobrás mañana, etc).
- **2026-05-12** — Etapa 6 cerrada: **Próximos · Editorial** shipped (`proximos-live.tsx`). Reemplaza al `FijosUpcomingStrip` viejo (3 cards anidadas con emojis). Nuevo lenguaje: list editorial con eyebrow + rule + 3 rows tipográficas. State-aware (empty / all paid / vencidos / default). Badge inline `↑ +X%` para hikes. Compone bien con el Titular.
- **2026-05-12** — Nueva dev route `/settings/dev/fijos-seleccion-final` con la composición de componentes seleccionados. Esta screen es la fuente de verdad del refactor — a medida que avanzan etapas, se suman componentes acá.
- **2026-05-12** — Doc actualizado: criterio ganador formalizado como **SPEC reusable** (7 reglas: editorial Wrapped DNA, state-aware copy obligatoria, restraint, header pattern uniforme, motion language, color usage, layout & spacing). Aplicar a todos los componentes próximos del refactor (Fijos + otras pantallas).
- **2026-05-12** — 3 variantes NUEVAS de "Próximos a pagar" + theme-aware contrast: **B · Proximity bars** (ancho de barra encoded urgencia, fill L→R), **C · Timeline horizontal** (línea HOY → FIN CICLO con 3 dots scale-in spring), **D · Hierarchy asimétrico** (el próximo en grande, los otros 2 compactos). Helper `buildProximosPalette` centraliza la paleta theme-aware (urgency / urgencyStrong / success / trackBg / barNear/Mid/Far) con contraste verificado AA o AAA sobre creamCard en light Y dark. Las 4 variantes consumen el mismo helper — cualquier componente futuro debe hacerlo también. Nueva dev route `/settings/dev/fijos-proximos-variants` para comparar lado-a-lado.
