# Manifiesto Wrapped — "La Edición" (comportamiento real)

> Estado: rediseño integrado 2026-08-13 (handoff `design/wrapped-2026-08/`,
> plan en [PLAN-INTEGRACION.md](../../design/wrapped-2026-08/PLAN-INTEGRACION.md)).
> Gate visual del owner PENDIENTE (`redesign-approval-status.ts → 'wrapped'`).
> La versión anterior (5 escenas crema con auto-advance) corrió en prod
> desde 2026-05-12 hasta este swap.

## Trigger

Sin cambios respecto de la versión anterior (decisión del plan §6.1: el
trigger día-1 con push/badge queda para V2):

- **Fixed**: el usuario confirma su cobro en la `SalaryConfirmationSheet`
  y el ciclo recién cerrado tuvo al menos un gasto → modal full-screen.
- **Dinámico**: el cron nocturno cierra el ciclo solo; el Home auto-dispara
  la edición sin ver (`dynamicWrappedPending`).
- **Replay**: desde Control (header, `useLaunchCycleWrapped`) y desde
  Settings → Ediciones (`editions-screen`), ahora SIEMPRE enriquecido con
  la decisión pasada + el contexto de estantería.

```
confirm cobro / cron ──► try_close_previous_cycle ──► UPSERT monthly_summaries
                                                            │
   Mobile espera 700ms ──► refetch + query directa ◄────────┘
        │
        ├─► fetchPastLeftoverDecision(summaryId)   (modo lectura si ya se decidió)
        ├─► fetchWrappedShelf(familyId, summaryId) (ordinal, estantería, reserva)
        └─► triggerCycleWrapped(payload) ──► CycleWrappedBridge ──► CycleWrappedModal
```

**Marca de visto**: `wrapped_seen_at` se estampa en TODOS los paths al
reproducirse (antes solo en el auto-fire dinámico → el dot de Control
quedaba prendido tras mirar el wrapped entero). El dot de "edición sin
ver" vive en el header de Control neo (`ControlHeader.unseenDot`).

## Arquitectura

```
DB ──► Cache ──► Emitter (singleton) ──► Bridge ──► Modal (orquestador) ──► build-scenes ──► escenas
                                              │
              wrapped-spec.ts (tokens nocturnos) + wrapped-primitives.tsx (vocabulario)
```

- El **Bridge** es de los ÚLTIMOS hermanos del `AppStackShell` (después
  del `<Stack>` y del `ArcHubHost`): la regla del repo es "último hermano
  gana el hit-test; `zIndex` sólo refuerza el pintado". `ToastHost` y el
  confetti global quedan DESPUÉS del wrapped a propósito.
- El guard de re-apertura (1500ms post-dismiss) sigue vigente.

## Visual — sigue el tema del sistema

El wrapped **sigue el tema del sistema** ([OWNER-1], decisión del owner
2026-08-13 — el handoff lo preveía en README:25): forest nocturno en
oscuro, material del sistema en claro. Todos los valores viven en
[`wrapped-spec.ts`](../../mobile/components/wrapped/wrapped-spec.ts) como
`WRAPPED_SPECS: Record<light|dark>` (transcripción literal con anclas
`HTML:NNN` y desvíos `[OWNER-1..7]`), resuelto por `useWrappedSpec()`:

- **Oscuro**: el flujo nocturno canónico (2a). Fondo = forest aprobado
  del cierre del jardín ([OWNER-2] — cero hexes de fondo nuevos).
- **Claro**: el flujo claro (3a) REBASADO al material del sistema
  ([OWNER-7], mismo criterio que el jardín): fondo `bg`, pozos `well`,
  sombras del sistema, CTA = radial verde del sistema (ya corregido por
  contraste en el token), y tres tintas del handoff sustituidas por el
  vocabulario `neoInk`/`textMuted` porque no pasan AA como glifo
  (`#6C7B67`, `#C96F3F` en estampa, `#63B168` en el foco del CTA).
- StatusBar y paleta del logo salen del spec (`shell.statusBarStyle`,
  `shell.logoPalette`). La tarjeta de compartir (V2) será SIEMPRE
  nocturna (README:26) — usará el spec dark.

`wrapped-constants.ts` queda sólo como la paleta de MINIATURA que
consumen las filas de Ediciones.

### Tipografía — dos reglas que no se pueden romper

El módulo es una réplica del handoff, y la transcripción literal de CSS a
RN tiene dos trampas que ya mordieron en QA (2026-08-13):

1. **`WrText` fija `allowFontScaling={false}`.** La composición (sello
   206, rank 58, montos 56, tracking 0.24em) está calculada para 393pt y
   no tiene dónde crecer; el escalado del OS la desbordaba.
2. **`wrType()` eleva el `lineHeight` a un piso seguro** — `1.32` para
   texto, `1.2` para charset de números/moneda (`{ numeric: true }`). En
   iOS, un `lineHeight` menor que la métrica de la fuente (Nunito: 1.364)
   **no re-centra: recorta el ascendente del glifo**. Los tokens con
   `lineHeight: 1` del handoff (sello `Nº`, rank del top 3, monto héroe)
   cortaban el `$` y los dígitos — el monto se veía como un "+" suelto,
   porque el `+` es el único glifo lo bastante bajo para sobrevivir.
   Detalle y tabla de glifos en `wrapped-primitives.tsx`.

### Densidad — cuando la pantalla es más baja que el handoff

El mockup es 393×830 **sin** safe areas; un iPhone SE deja ~487pt de
stage, así que el diseño no entra tal cual. Por debajo de 800pt de alto
de ventana, `SceneRenderArgs.compact` pone las escenas en modo compacto:
aire al 60 % (`wrGap`) y bloques fijos al 82 % (`wrBlock` — sello, Brot).
Es el aire lo que cede primero porque el handoff ya lo declara elástico
(ancla arriba con `margin-top` fijos y manda el sobrante a `auto`).

Descartados a propósito: **ScrollView** por escena (clipea, y la tinta de
Brot sobresale ~12u de su caja; además se comería el hit-test de las tap
zones y pelearía con el Pan de swipe-down) y **escala global** (borronea
el texto y encogería devices donde el diseño entra sin problema).

### Regla: el gradiente NUNCA va en el nodo animado

`experimental_backgroundImage` (o sea `cssGradient()`) sobre el MISMO nodo
que Reanimated anima pinta un **rectángulo fantasma fuera de la caja** del
elemento. Fue la causa de los tres artefactos que el owner reportó en
device (2026-08-13): el halo del veredicto, la mini-card NUEVA de la
contratapa y —latente, sólo en tema oscuro— el fondo del card.

La correlación es limpia: las mini-cards pasadas y la burbuja de Brot usan
el mismo `cssGradient` en una `View` estática y siempre se vieron bien. La
variable es la animación, no el gradiente.

**Patrón obligatorio — dos capas:** el `Animated.View` sólo anima
(`opacity` / `transform`) y el material vive en una `View` estática
adentro. Para fondos a sangre, esa capa va como primer hijo con
`StyleSheet.absoluteFillObject` + `pointerEvents="none"`. Aplicado en
`portada-scene` (sello), `destino-scene` (capa raised de la option card),
`contratapa-scene` (mini-card nueva) y `cycle-wrapped-modal` (fondo).

### El halo del Brot radiant NO se implementa

`[OWNER-8]` del spec. El handoff pide `drop-shadow(0 0 18px …)` sobre el
sprite; RN no tiene drop-shadow por SILUETA y las dos aproximaciones por
View fallaron en device, las dos vistas por el owner:

- fill semi-transparente + `boxShadow` con spread → iOS calcula la sombra
  desde el rect del border-box y pinta **un relieve rectangular flotando
  al lado de Brot**;
- `experimental_backgroundImage` con `radial-gradient` → volvió a pintar
  una forma rectangular. Ese gradiente sólo es confiable como fill de
  botón (llena la View entera y la forma no se distingue).

Un halo correcto exigiría un `Canvas` de Skia con `BlurMask`, que el repo
no usa en ningún lado. Se omite: el sprite `radiant` ya dibuja sus
destellos y la celebración la comunican las 22 partículas, el burst de la
estampa y el haptic al sellar.

## Estructura (5–6 pantallas en V1)

El flujo se arma en [`build-scenes.ts`](../../mobile/components/wrapped/build-scenes.ts);
la barra story y el marcador "N DE M" salen de `scenes.length`.

| # | Escena | Condición |
|---|---|---|
| 01 | Portada — sello "Edición Nº N" + chip del ciclo + Brot `wave` | siempre |
| 02 | Los números — 3 filas editoriales con count-up + Brot `think` | siempre |
| 03 | Top 3 — ranking fantasma + strip de fijos + Brot `wow` | si hay categorías |
| 05 | El veredicto — monto con signo + estampa + Brot según estado | siempre |
| 06 | Destino del sobrante / Plan de recuperación | ver abajo |
| 07 | Contratapa — chip de decisión + estantería + Brot `love` | siempre |

La **04 "Tu jardín"** llega en V1.5 (necesita la migración de racha
congelada; los días plantados se derivan de fuentes durables, nunca de
`expenses` — aunque el purge de archivados ahora retiene 13 meses en vez de
14 días, sigue sin ser una fuente durable para un dato que debe persistir
indefinidamente).

### Veredicto (05) — 3 estados

El estado sale de `resolveVerdictState()` con el **umbral relativo
unificado** [`sobranteThreshold(income)`](../../mobile/features/month-close/sobrante.ts)
`= max($1.000, 0,5% del ingreso del ciclo)` — el MISMO número que gatea el
sheet standalone y el pending del wrapped (antes eran tres literales
`1000` sueltos):

| Estado | Trigger | Visual |
|---|---|---|
| MARGEN | `saldo > umbral` | Brot `radiant` (sin halo — ver abajo), monto crema 56/900, estampa verde −5° que "sella" (scale 1.4→1 + haptic medio + burst), 22 partículas |
| EXCEDIDO | `saldo < 0` | Brot `worried`, monto durazno 50/900, estampa durazno +4° que cae sin rebote, sin partículas |
| JUSTO | `0 ≤ saldo ≤ umbral` | Brot `zen`, estampa crema −3° en fade, sin partículas; **la 06 se salta** (flujo de 5) y nada queda pendiente (mismo umbral ⇒ el sheet tampoco pregunta) |

### Paso 06 — dos ramas

**MARGEN (destino del sobrante)** — presente si hay pending, decisión
pasada o decisión de esta sesión:

- 🐷 Reservar aparte · 🎯 Destinar a mi meta (con barra de dos tramos:
  actual `#57A05C` + aporte nuevo verde sistema) · 🔄 Sumarlo al nuevo ciclo.
- Default: meta activa si existe; si no, reservar (README:46).
- Confirmar → `onApplyLeftoverDecision` (RPC `apply_month_close_decision`)
  → confetti POST-await → contratapa con el chip.
- **Gate de rol**: el RPC es owner-only; `canDecide:false` (miembro)
  muestra las opciones inertes + "LA DECISIÓN LA CONFIRMA EL DUEÑO" + CTA
  "Seguir ›". Rol vía `useMyFamilyRole` (sembrado por `home_snapshot`).

**EXCEDIDO (plan de recuperación)** — siempre presente:

- 🐷 Cubrir con la reserva (sólo si `reserveAvailable > 0` y hay
  `onApplyReserve`; copy HONESTO: la reserva **se suma al presupuesto del
  ciclo nuevo**, no "salda" el rojo — `apply_reserve_decision target='cycle'`).
- 📉 Ajustar el nuevo ciclo (default; NO persiste nada — el rojo se
  descuenta solo).
- 🔍 Revisar el top 3 (navegación: cierra y aterriza en Gastos).

**Replay (modo lectura)**: la opción decidida marcada, las otras
atenuadas, "DECIDISTE EL {fecha}", CTA "Seguir ›". `skip` persistido cae
al flujo vanilla.

### Contratapa (07)

Chip de decisión (o "el resto se sumó al nuevo ciclo" en JUSTO) +
estantería (hasta 2 mini-cards pasadas + la NUEVA que baja al estante con
borde verde y logo) + listón + **guardado acumulado = Σ decisiones a
reserva/meta** (plan §6.7 — la suma ingenua de saldos doble-cuenta los
arrastres de `acumular`). CTA "Empezar el nuevo ciclo ›" (compartir llega
en V2). Fuente: [`fetch-wrapped-shelf.ts`](../../mobile/features/wrapped/fetch-wrapped-shelf.ts)
(toda falla degrada a `null` — la contratapa renderiza sin estantería).

## Navegación — por botón

- **CTA primario en el footer de TODAS las páginas** (orden del owner
  2026-08-13 — más intuitivo que la gramática de story): 01 "Abrir la
  edición ›", 02/03 "Seguir ›", 05 según veredicto, 06 el de
  confirmación, 07 "Empezar el nuevo ciclo ›". El botón es la vía
  principal; el resto son atajos.
- **Sin auto-avance** (README:20 regla 2).
- Atajos: tap derecha avanza / izquierda retrocede (en la última,
  derecha cierra) · **swipe-down cierra** (receta `modal-card.tsx`) —
  la edición queda guardada igual · back físico Android cierra · X
  arriba a la derecha (fallback a11y).
- En la 06 interactiva la zona derecha NO avanza: la única salida hacia
  adelante es el CTA de confirmación.
- **Tap zones declaradas PRIMERO** en el árbol; header/CTA/option cards
  después (les ganan el hit-test).

## Motion

Duraciones en la familia `wrapped*` de
[`decorativeDurations`](../../mobile/lib/motion/tokens.ts); parámetros
no-temporales en `WRAPPED_ANIM` (wrapped-spec). Nav slide 22px + crossfade
250ms · sello asienta 400ms · filas stagger 80ms + count-up 800ms ·
ranking #3→#1 stagger 120ms con pop del #1 · monto 700ms → estampa 350ms
con haptic medio · cards stagger 70ms, select 150ms, barra de meta 600ms ·
mini-card baja 450ms + glow. El monto héroe usa `CountUpText`
`unit="moneyDelta"` (signo `+`/`-` SIEMPRE — el signo es el veredicto;
formateo en worklet, sin `Intl`).

**Reduced motion** (gate de hardware: `deviceYearClass < 2020` entra
solo): valores directos, fades de 150ms, sin partículas, estampa sin
spring. Es un estado de primera clase, no una degradación.

## Gates de disparo

Sin cambios: no dispara en onboarding, sin summary, o con
`expenses_count === 0`.

## Dev preview

`Settings → Desarrollo → Preview · Cierre de ciclo` (solo `__DEV__`) —
matriz de 6 presets con los datos demo del handoff ("Edición Nº 3 ·
20 jun → 19 jul 2026"): MARGEN con/sin meta · EXCEDIDO · JUSTO · replay
read-only · miembro sin permiso. Los apply son fakes con 600ms de
latencia. Mismo emitter que prod.

## Archivos relevantes

- Spec de tokens: [`mobile/components/wrapped/wrapped-spec.ts`](../../mobile/components/wrapped/wrapped-spec.ts)
- Primitivas: [`mobile/components/wrapped/wrapped-primitives.tsx`](../../mobile/components/wrapped/wrapped-primitives.tsx)
- Orquestador: [`mobile/components/wrapped/cycle-wrapped-modal.tsx`](../../mobile/components/wrapped/cycle-wrapped-modal.tsx)
- Ensamblado: [`mobile/components/wrapped/build-scenes.ts`](../../mobile/components/wrapped/build-scenes.ts)
- Escenas: [`mobile/components/wrapped/scenes/`](../../mobile/components/wrapped/scenes/) (portada / numeros / top3 / veredicto / destino / contratapa)
- Emitter + payload: [`mobile/lib/cycle-wrapped-emitter.ts`](../../mobile/lib/cycle-wrapped-emitter.ts)
- Builder: [`mobile/features/wrapped/build-wrapped-payload.ts`](../../mobile/features/wrapped/build-wrapped-payload.ts)
- Contexto del replay: [`fetch-past-leftover-decision.ts`](../../mobile/features/wrapped/fetch-past-leftover-decision.ts) · [`fetch-wrapped-shelf.ts`](../../mobile/features/wrapped/fetch-wrapped-shelf.ts)
- Orquestación del cierre: [`mobile/features/home/use-month-close-orchestration.ts`](../../mobile/features/home/use-month-close-orchestration.ts)
- Umbral canónico: [`mobile/features/month-close/sobrante.ts`](../../mobile/features/month-close/sobrante.ts)
- i18n: bloque `wrapped.edicion` en `es/control.json` + `en/control.json`

## Fuera del V1 (plan §9)

Compartir 9:16 (deps nativas + riesgo de crash de captura con New Arch) ·
pantalla 04 jardín (V1.5, una migración) · trigger día-1 con push/badge ·
"ajustar el nuevo ciclo" persistible · modo claro del wrapped · wrapped
por miembro.

<!-- ✓ Sincronizado contra código el 2026-08-13 (swap a "La Edición") -->
