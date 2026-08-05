# Gastos · handoff v2 — diseño de integración

**Fecha:** 2026-08-04 · **Branch:** `feat/ui-redesign`
**Handoff:** `design/gastos-2026-08-v2/` (Manifiesto + Interactivo + Componentes + README)

## Qué es v2

No es un layout nuevo: es un pase de **completitud y endurecimiento** sobre la v1 que ya
está cableada y live en la tab (`neo-gastos-screen.tsx`). El aporte real son los 10
componentes con **todos** sus estados (IDs H/C/B/D/CAL/DS/BK/F/M/NAV) y los 7 vacíos
(EV1–EV7), más el reemplazo del chip `📅 Ver mes` por un botón de volver de 44px.

## Decisiones de owner (2026-08-04)

1. **Copy → tuteo neutro.** El handoff está en voseo; la app se neutralizó a tuteo LATAM
   en 2026-06. El copy nuevo va en tuteo y se corrigen de paso los literales en voseo que
   ya están live en el kit.
2. **DS-6 (day-detail de edición cerrada) → con `GASTADO`, sin conteo.** `daily_totals`
   persiste `[{day,total}]`: hay total por día pero no hay conteo de movimientos ni
   detalle fila-por-fila de ciclos cerrados. `MOVIMIENTOS` muestra `—`. Degradación
   honesta, mismo criterio que ya usa `buildClosedCells`.
3. **i18n → el kit sigue `@i18n-ignore-file`.** El copy nuevo va hardcodeado siguiendo la
   convención vigente del kit. Sacar Gastos de la exención (como se hizo con Fijos) queda
   como tarea aparte.

## Arquitectura

El kit `components/redesign/gastos/gastos-screen.tsx` es la **única** fuente visual: la
réplica de Settings→Dev (`GastosFinalScreen`) y la tab live componen sus mismos exports.
Un cambio en el kit actualiza las dos.

El kit ya son ~2.600 líneas. Se extrae a `parts/` **solo lo que se reescribe**;
`gastos-screen.tsx` queda como barrel y no cambia ningún import río abajo:

```
redesign/gastos/
  gastos-screen.tsx           barrel + demo + hero/calendario/movimientos (editados in-situ)
  gastos-spec.ts              + tokens: dashed*, backBtn*, ghost*, heroSubline*, noticeSoft*
  parts/ghost.tsx             molde punteado (react-native-svg, NO borderStyle)
  parts/back-to-calendar.tsx  BK
  parts/day-detail.tsx        DS-1…DS-6
  parts/filter.tsx            F-1…F-4
  parts/notices.tsx           B-2
```

El punteado se dibuja con `react-native-svg` (`Rect` + `strokeDasharray`): sobre
`borderRadius`, `borderStyle:'dashed'` se rinde sólido en varias versiones de Android.

**Sin backend, sin migraciones.**

## Componentes

### BK + DS-1…DS-6 · Day-detail

`BackToCalendarButton`: `flex:1`, `minHeight:44`, radio 16, superficie elevada, chevron
15px en pastilla hundida 30×30 radio 10, label 13/900 con elipsis, press `0.96`.

La fila de encabezado pasa a `[botón flex:1][badge maxWidth:40%]` y `DÍA SELECCIONADO`
baja a segunda línea (`marginTop:14`). Se elimina el chip `📅 Ver mes` y su `hitSlop:12`.

`GastosDayDetail` gana `variant: 'live' | 'future' | 'closed'` y `noteLine`:

| Estado | Render |
|---|---|
| DS-1 con gastos | igual que hoy |
| DS-2 exceso | badge `Día de exceso` (ya existe) |
| DS-3 día limpio | badge `Día limpio` + línea `Día sin gastos 🌿 sumaste +1 al jardín` + CTA `Ver mi jardín` (= EV3) |
| DS-4 futuro | `GASTADO —`, `MOVIMIENTOS 0`, sin CTAs, nota `Sin acciones — día futuro` |
| DS-5 fuera de ciclo | strip Brot `sad` (ya existe) + badge `Fuera de ciclo` |
| DS-6 edición cerrada | `GASTADO` real, `MOVIMIENTOS —`, sin CTAs, nota `Sin acciones — edición cerrada` |

El calendario de edición cerrada pasa a ser tappable (estado nuevo `selectedClosedIso`).

### H-1…H-4 · Hero

Prop nueva `subline?: { glyph?: string; text: string; tone: 'neutral' | 'warn' }` que se
dibuja dentro del pozo, bajo el monto: `📁 Solo lectura` (cerrada), `⚠ N días fuera del
ciclo` (vencido), `Todavía no registras gastos` (vacío).

Brot condicional dentro del hero (`think` cerrada / `worried` vencido / `wave` vacío),
con `animated={false}` por la convención de perf del `ListHeaderComponent`.

**Cambia el hero vacío ya aprobado:** hoy oculta promedio y categorías; v2 (H-4/EV1) pide
`PROMEDIO DÍA —` con 7 barras fantasma punteadas y `Van a aparecer acá 🌱` en lugar de las
barras de categoría.

### CAL-1…CAL-4 + D-atom · Calendario

- `title` override → `MAYO EN UN VISTAZO` en edición cerrada.
- Hints por estado: `toca un día` / `+N fuera del ciclo` / `solo lectura` / `día N de M`.
- `DayKind` gana `'none'` = punteado sin fill (D-atom «sin datos»).
- Regla: ciclo **recién arrancado** → días futuros punteados (EV2 dice explícitamente que
  el punteado son los días que no llegaron); ciclo normal → futuros en inset apagado
  (D-atom «futuro»). Lo decide la VM (`buildNeoCells`), no el componente.

### F-1…F-4 · Filtro

- Fila de eyebrow con estado a la derecha: `Todas` / `{cat} · {n}` / `Sin usar` /
  `Sin resultados`; el eyebrow cambia a `FILTRO ACTIVO` cuando hay categoría aplicada.
- F-3: categorías del catálogo sin movimientos → chip fantasma punteado, sin contador, no
  tappable, + hint `Los punteados se activan cuando cargues gastos.`
- F-4: bloque vacío con Brot + `Nada en {cat} este ciclo` + `La edición pasada gastaste
  {monto} acá.` (del `category_breakdown` de la última edición cerrada; la segunda línea
  se omite si no hay dato) + `✕ Quitar filtro`.
- Fade a `zIndex:2` sobre el scroller (`top:6`, `bottom:24`, `width:30`).

**Consecuencia:** el vacío por filtro se muda al bloque del filtro, así que `ListEmpty`
deja de renderizar su variante `filtered` (si no, se duplica).

### M-1…M-4 · Movimientos

- Montos y totales a `flex:none` + `marginLeft`; encabezados de grupo con `minWidth:0` +
  elipsis. Los títulos/subtítulos de fila ya truncan.
- M-3: fila fuera-de-ciclo → sufijo `· fuera del ciclo` en el sub + nota bajo la fila.
- M-4: `GastosMovementsEmptyWell` pasa a molde — 3 filas fantasma punteadas + Brot +
  `+ Registrar mi primer gasto`.

### B-2 · Aviso de gastos fuera

`N gastos fuera del ciclo` / `Al confirmar el cobro pasan al próximo ciclo` / `Ver días`.

Regla: **owner → B-1** (con `✓ Confirmar`); **no-owner → B-2** (informativo, `Ver días`
enfoca el primer día fuera). Hoy el no-owner ve B-1 sin botón, que es el hueco que llena.

## Vacíos EV1–EV7

EV1→H-4 · EV2→CAL-4 · EV3→DS-3 · EV4→F-3 · EV5→F-4 · EV6→M-4. No hay pantalla nueva.

**EV7 hoy es inalcanzable:** `useMonthlyEditions` filtra las ediciones con
`expenses_count === 0`, así que una edición vacía nunca entra al dropdown. Se implementa
el bloque igual (defensivo, costo bajo) pero **no** se toca ese filtro — cambiarlo
afectaría también al archivo de Wrappeds de Ajustes.

## Verificación

No hay screenshots fieles posibles desde acá: el proyecto no corre en simulador en Apple
Silicon (ML Kit → `EXCLUDED_ARCHS=arm64`, solo device) y expo-web no rinde Skia ni
`experimental_backgroundImage`.

Lo que sí se corre: `tsc`, la suite de tests, el bundle de Metro
(`npx expo export --platform ios`), `guard-forbidden-copy` y `check-i18n-*`.
El visual lo valida el owner en device; la réplica de Settings→Dev queda actualizada por
el mismo cambio.
