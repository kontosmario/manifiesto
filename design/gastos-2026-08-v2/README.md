# Handoff · Sección GASTOS — Manifiesto

Paquete de desarrollo de la vista **Gastos**: layout estático, prototipo interactivo con toda la lógica, e inventario de componentes con todos sus estados.

## Archivos

| Archivo | Qué es |
|---|---|
| `Gastos Interactivo.dc.html` | **Referencia de comportamiento**. Máquina de estados, transiciones y animaciones funcionando. Abre directo en browser. |
| `Gastos Componentes.dc.html` | **Inventario**: 10 componentes × todos sus estados, claro y oscuro, con IDs para referir en tickets. |
| `Gastos Manifiesto.dc.html` | Layout estático de la vista completa + tanda de estados vacíos (EV1–EV7). |
| `brot.js` | `<brot-mascot pose size animated shadow>` — poses usadas: `wave`, `cheer`, `think`, `worried`, `sad`. En vistas estáticas usar `animated="false"`. |
| `particles.js` | `<brot-particles colors count>` — partículas del hero (core del producto, no quitar). |
| `support.js` | Runtime para abrir los `.dc.html`. No se programa contra él. |

## Tokens

### Tema claro
- Material/fondo `#E9EBE0` · texto `#24382A` · secundario `#6C7B67` · apagado `#9AA694` · verde `#2E7C39` · naranja `#C25B33` · ámbar (cerrada) `#8A5A2E`
- Raise `8px 8px 18px rgba(151,160,136,0.42), -8px -8px 18px rgba(255,255,255,0.92)`
- Inset `inset 3px 3px 7px rgba(151,160,136,0.35), inset -3px -3px 7px rgba(255,255,255,0.9)` · profundo `inset 5px 5px 12px rgba(151,160,136,0.5), inset -5px -5px 12px rgba(255,255,255,0.92)`
- Días: bien `#DCEBD8`/`#3E6B44` · exceso `#F3C9BC`/`#A84A2F` · hoy `#24382A`/`#F5F2E1` · futuro inset `#9AA694` · sin datos: borde `1.5px dashed rgba(151,160,136,0.5)`

### Tema oscuro
- Fondo `#16271C` · cards `linear-gradient(145deg,#1D3426,#132318)` · pozos `#142519`
- Texto `#F1EEDD` · secundario `#93A78F` · apagado `#7C917A` · verde `#A4E3A6` · naranja `#F2A87E` · ámbar `#D9B36A`
- Raise `8px 8px 18px rgba(0,0,0,0.55), -8px -8px 18px rgba(101,152,113,0.1)` · inset `inset 3px 3px 7px rgba(0,0,0,0.5), inset -3px -3px 7px rgba(101,152,113,0.08)`
- Días: bien `rgba(164,227,166,0.16)`/`#B5DDB4` · exceso `rgba(217,115,85,0.24)`/`#F2A87E` · hoy `#F1EEDD`/`#16271C`
- **Regla dark**: los estados de color llevan textura hundida (inset negro arriba-izq + labio de luz del color abajo-der), nunca color plano.

### Común
- Fuente **Nunito** (400–900). Hero forest `linear-gradient(155deg,#2E6B33,#3F8746 55%,#57A05C)`, partículas `#C9F3C6,#FBD9BC,#EFF6E2`, pozo del total `rgba(13,34,18,0.30)` + inset profundo.
- Fuera de ciclo: trama `repeating-linear-gradient(135deg,#F3C9BC 0 5px,#EFB8A6 5px 10px)` + anillo `#D97355`.
- Radios: teléfono 46 · hero 30-32 · cards 26-28 · filas 20-22 · chips 16 · celdas de día 13. FAB N1 (invertido en dark).

## Estructura de la vista (orden vertical)

1. **Header** — "Gastos" + trigger de ciclo debajo (`● Ciclo 20 jun → 19 jul · día 18 ▾`) · Brot arriba-derecha (→ Jardín, badge `🌱 1`)
2. **Selector de ciclo** (desplegable oculto) — `● EN CURSO` + ediciones cerradas con su resultado
3. **Barra solo-lectura** (edición cerrada) — `📁 EDICIÓN CERRADA · SOLO LECTURA · Volver ›` + outline punteado ámbar
4. **Banner de aviso** (ciclo vencido) — Brot `worried` + `✓ Confirmar`
5. **Hero** — total en pozo · chip de movimientos · `PROMEDIO DÍA` + mini chart 7 días · top 3 categorías con barras
6. **Calendario ⇄ Día seleccionado** (se alternan, nunca juntos)
7. **Filtro C1** — carrusel de chips con contador
8. **Movimientos** — agrupados por día con total
9. **Nav** — Gastos activo + FAB N1

## Calendario — geometría del ciclo (crítico)

No es un mes calendario. La grilla es **relativa al ciclo**:
- `5` celdas en blanco para alinear con el encabezado **L M X J V S D** (X = miércoles, para que no se lea "L M M")
- luego `20 → 30` (mes de inicio) y `1 → 19` (mes de cierre) = **35 celdas**
- `hoy` = día 7 del mes de cierre · `futuro` = 8–19 · exceso según datos
- ciclo vencido: se agregan `+20` / `+21` con trama FUERA al final
- El día de inicio del ciclo es configurable (20→19 en el ejemplo); todo se deriva de él.

## Máquina de estados (`Gastos Interactivo.dc.html`)

`{ dark, cyc (0=actual|1|2), sel, venc, dayF, cat, dd }`

- **Tocar día** → `dayF:true`: el calendario se oculta y entra el detalle; los movimientos se filtran (`✕ Día N · ver todo` restaura).
- **Volver**: botón `‹ Volver al calendario` en el encabezado del detalle — target **44px mínimo**, ícono en pastilla hundida, etiqueta que trunca. (Reemplazó al chip `📅 Ver mes`.)
- **Días futuros** → detalle `— / 0`, sin CTAs. **Exceso** → badge "Día de exceso". **Día limpio** → celebra: "+1 al jardín".
- **Ciclo cerrado** (`cyc>0`) → solo lectura: sin CTAs, Brot `think`, hero "TOTAL DE LA EDICIÓN".
- **Vencido** (`venc`, solo ciclo actual) → banner + `+20/+21` FUERA; su detalle: badge "Fuera de ciclo", Brot `sad`, "van al próximo ciclo". `✓ Confirmar` resuelve.

## Inventario de componentes (IDs para tickets)

| ID | Componente | Estados |
|---|---|---|
| H-1…H-4 | Herocard | ciclo actual · edición cerrada · vencido +2 fuera · primer ciclo vacío |
| C-1…C-3 | Selector de ciclo | cerrado · desplegado · edición cerrada |
| B-1, B-2 | Avisos | ciclo vencido · gastos fuera |
| D-atom | Celda de día | bien · exceso · hoy · elegido · futuro · sin datos · fuera |
| CAL-1…CAL-4 | Calendario | normal · vencido · edición cerrada · recién arrancado |
| DS-1…DS-6 | Día seleccionado | con gastos · exceso · día limpio · futuro · fuera de ciclo · cerrada |
| BK | Botón volver | default · presionado · texto largo |
| F-1…F-4 | Filtro | default · categoría activa · sin categorías · sin resultados |
| M-1…M-4 | Movimientos | normal · texto largo · fuera de ciclo · listado vacío |
| NAV | Navegación | Gastos activo + FAB |

### Estados vacíos (EV1–EV7, en `Gastos Manifiesto.dc.html`)
Dos ideas transversales: **el vacío como logro** (EV3: día sin gastos suma al jardín) y el **molde punteado** de lo que va a venir en lugar de espacio en blanco (EV1/EV2/EV4/EV6). EV5 = filtro sin resultados con referencia del ciclo anterior. EV7 = edición cerrada sin movimientos.

## Textos largos

- Título y subtítulo de cada movimiento, encabezados de grupo, sublabels y el trigger de ciclo: `white-space:nowrap; overflow:hidden; text-overflow:ellipsis` + `min-width:0` en el contenedor flex.
- **Montos y totales `flex:none`** (con `margin-left:8-10px`): un nombre largo nunca los comprime ni los empuja fuera.
- Etiqueta del botón de volver: trunca con elipsis; el badge de estado a su derecha tiene `max-width:40%`.

## Filtro — carrusel

Fila con `overflow-x:auto; overflow-y:hidden; scrollbar-width:none; -webkit-overflow-scrolling:touch`; el fade derecho va **encima** del scroller con `z-index:2; pointer-events:none` y el 4º chip **asoma deliberadamente** para delatar el scroll. El wrapper lleva padding interno para que la sombra del chip activo respire.

## Animaciones

Keyframes en el `<style>` del documento:
- `mfIn` — entrada de cards (fade + `translateY(12px)` + `scale(.985)`), `.3s cubic-bezier(0.22,0.9,0.3,1)`; usada en el intercambio Calendario ⇄ Día.
- `mfDrop` — el selector de ciclo despliega desde el título, `.24s`, `transform-origin:top`.
- `mfPulse` — dot del ciclo activo late con glow, `2.6s infinite`.
- Barras de categoría: `width .55s cubic-bezier(0.22,0.9,0.3,1)` al cambiar de ciclo.
- Tema: transición `.3–.4s ease` en background/color/box-shadow de todos los materiales.
- Press feedback: `scale(0.88)` días · `0.93` chips · `0.96` botón volver · `0.97` CTAs, con `transform .14–.18s ease`.
- **Rendimiento**: en vistas estáticas/galerías usar `animated="false"` en las mascotas y un solo campo de partículas; evitar animar `box-shadow` (preferir opacity/transform). Honrar `prefers-reduced-motion`.

## Copy exacto

- Trigger: `Ciclo 20 jun → 19 jul · día 18` / `Mayo 2026 · cerrada`
- Aviso: `Tu ciclo terminó el 19` / `2 días sin confirmar el cobro — quedan fuera del ciclo`
- Fuera de ciclo: `FUERA DE CICLO · va al próximo al confirmar` / `Estos gastos quedaron fuera del ciclo — al confirmar el cobro pasan al próximo.`
- Hero: `TOTAL VISIBLE` (actual) / `TOTAL DE LA EDICIÓN` (cerrada) · `MÁS PESO POR CATEGORÍA`
- Calendario: `TU MES EN UN VISTAZO` · `tocá un día`
- Detalle: `‹ Volver al calendario` · `DÍA SELECCIONADO` · `+ Registrar gasto olvidado` · `🌿 Marcar día sin gastos`
- Vacíos: `Todavía no registraste gastos en este ciclo.` · `Día sin gastos 🌿 +1 al jardín` · `Nada en Mercado este ciclo`

## Notas de producción

- Estilos inline en los `.dc.html` — portarlos a los tokens/componentes del design system del equipo.
- Montos en formato es-AR (`$3.008.920`, abreviados `$167k`); semana empieza en **L** y miércoles se rotula **X**.
- Brot es asistente: su pose deriva del estado del componente, siempre anclado al dato que comenta (nunca decorativo suelto).
- Cuidado con `overflow:hidden` en contenedores donde Brot asome: montarlo como hermano del contenedor recortado.
