# Handoff · Sección GASTOS — Manifiesto

Paquete para desarrollo de la vista **Gastos** completa (claro + oscuro + interacciones + animaciones).

## Archivos

| Archivo | Qué es |
|---|---|
| `Gastos Manifiesto.dc.html` | Layout estático fuente de verdad — teléfono claro y oscuro lado a lado. Abre directo en browser. |
| `Gastos Interactivo.dc.html` | **Referencia de comportamiento**: toda la lógica de estados, transiciones y animaciones funcionando. Abre directo en browser. |
| `brot.js` | Web component `<brot-mascot>` (poses: `wave`, `cheer`, `think`, `worried`, `sad`). |
| `particles.js` | Web component `<brot-particles>` (partículas flotantes del hero). |
| `support.js` | Runtime para abrir los `.dc.html` — no se programa contra él, es solo para ver los archivos. |

## Tokens

### Tema claro
- Fondo/material: `#E9EBE0` · texto `#24382A` · secundario `#6C7B67` · apagado `#9AA694` · texto medio `#3E5A44` · verde acción `#2E7C39`
- Relieve (raise): `8px 8px 18px rgba(151,160,136,0.42), -8px -8px 18px rgba(255,255,255,0.92)`
- Hundido (inset): `inset 4px 4px 9px rgba(151,160,136,0.4), inset -4px -4px 9px rgba(255,255,255,0.95)`
- Estados calendario: bien `#DCEBD8`/`#3E6B44` · exceso `#F3C9BC`/`#A84A2F` · hoy sólido `#24382A`/`#F5F2E1` · futuro inset `#B3BCA8`
- Naranja alerta: banner `#F5D9C8→#EFC5AE`, texto `#7A2E17`, botón `#C25B33`

### Tema oscuro
- Fondo `#16271C` · cards `linear-gradient(145deg,#1D3426,#132318)` · pozos inset `#142519` (chips filtro: `#122015`)
- Texto `#F1EEDD` · secundario `#93A78F` · apagado `#7C917A` · medio `#B9CCB2` · verde `#A4E3A6` (+glow `rgba(140,225,150,…)`)
- Raise: `8px 8px 18px rgba(0,0,0,0.55), -8px -8px 18px rgba(101,152,113,0.1)`
- Inset: `inset 4px 4px 9px rgba(0,0,0,0.5), inset -4px -4px 9px rgba(101,152,113,0.1)`
- Estados calendario: bien `rgba(164,227,166,0.16)`/`#B5DDB4` · exceso `rgba(217,115,85,0.24)`/`#F2A87E` · hoy `#F1EEDD`/`#16271C` · futuro `#142519`/`#5F7361`
- **Regla dark**: los estados bien/exceso llevan textura hundida (inset negro arriba-izq + labio de luz del color abajo-der), no color plano.

### Común
- Fuente **Nunito** (400–900). Hero forest: `linear-gradient(155deg,#2E6B33,#3F8746 55%,#57A05C)`, partículas `#C9F3C6,#FBD9BC,#EFF6E2`, pozo del total `rgba(13,34,18,0.30)` + inset profundo.
- Fuera de ciclo: trama rayada `repeating-linear-gradient(135deg,#F3C9BC 0 6px,#EFB8A6 6px 12px)` + anillo `#D97355`.
- Radio: teléfono 46 · hero 32 · cards 28 · filas 22 · chips 18 · días 13. FAB N1: disco `linear-gradient(145deg,#6DBC71,#327E39)` + pozo interno inset (invertido en dark: disco crema, "+" verde).

## Estructura (orden vertical)

1. **Header** — "Gastos" + trigger de ciclo debajo (`● Ciclo 20 jun → 19 jul · día 18 ▾`) · Brot arriba-derecha (→ Jardín, badge `🌱 1`)
2. **Selector de ciclo** (desplegable oculto) — ● EN CURSO / 📁 ediciones cerradas con su resultado (`−$1.588.087`)
3. **Barra solo-lectura** (solo en edición cerrada) — `📁 EDICIÓN CERRADA · SOLO LECTURA · Volver al actual ›` + teléfono con outline punteado ámbar
4. **Banner alerta** (solo ciclo vencido sin cobro) — Brot `worried` + `✓ Confirmar`
5. **Hero forest** — total en pozo · chip movimientos · PROMEDIO DÍA + mini chart 7 días · top 3 categorías con barras
6. **Calendario ⇄ Día seleccionado** (se alternan, nunca juntos) — grilla L-D 31 días; detalle con ‹ ›, GASTADO/MOVIMIENTOS, badges, CTAs
7. **Filtro C1** — `Todas · 64` activa + chips con contador y fade de scroll
8. **Movimientos por día** — `HOY · MARTES 7 · −$73.700` + filas (tile pastel 44px, quién · categoría, monto) + `Ver días anteriores ˅`
9. **Nav** — Gastos activo (pastilla hundida) + FAB N1 elevado

## Máquina de estados (ver `Gastos Interactivo.dc.html`)

`{ dark, cyc (0=actual|1|2), sel (día), venc (bool), dayF (bool), cat (índice), dd (bool) }`

- **Tocar día** → `dayF:true`: el calendario se oculta, entra "Día seleccionado"; los movimientos se filtran (`✕ Día N · ver todo` restaura). `📅 Ver mes` vuelve.
- **Días futuros** → detalle `— / 0`. **Días exceso** (`bads[]` por ciclo) → badge "Día de exceso".
- **Ciclo cerrado** (`cyc>0`) → solo lectura: sin CTAs de edición, Brot pose `think`, hero "TOTAL DE LA EDICIÓN".
- **Vencido** (`venc:true`, solo ciclo actual) → banner + días `+20/+21` rayados FUERA al final del calendario; su detalle: badge "Fuera de ciclo", Brot `sad`, nota "van al próximo ciclo". `✓ Confirmar` resuelve.
- **Acciones día actual**: `+ Registrar gasto olvidado` (primario) · `🌿 Marcar día sin gastos` (ghost).

## Animaciones (todas implementadas en el interactivo)

- Keyframes: `mfIn` (entrada de cards: fade + translateY 12px + scale 0.985, `0.3s cubic-bezier(0.22,0.9,0.3,1)`) · `mfDrop` (dropdown desde arriba, 0.24s) · `mfPulse` (glow del punto verde, 2.6s infinito)
- Tema: transición global `0.4s ease` en background/color/box-shadow de todos los materiales
- Barras de categoría: `width 0.55s cubic-bezier(0.22,0.9,0.3,1)` al cambiar ciclo
- Press feedback: `scale(0.88–0.97)` según tamaño (días 0.88, chips 0.93, CTAs 0.97) con `transform 0.14–0.18s ease`
- Respetar `prefers-reduced-motion` en producción.

## Copy exacto

- Trigger: `Ciclo 20 jun → 19 jul · día 18` / `Mayo 2026 · cerrada`
- Alerta: `Tu ciclo terminó el 19` / `2 días sin confirmar el cobro — quedan fuera del ciclo`
- Fuera de ciclo: `FUERA DE CICLO · va al próximo al confirmar` / strip: `Estos gastos quedaron fuera del ciclo — al confirmar el cobro pasan al próximo.`
- Hero: `TOTAL VISIBLE` (actual) / `TOTAL DE LA EDICIÓN` (cerrada) · `MÁS PESO POR CATEGORÍA`
- Calendario: `TU MES EN UN VISTAZO` · `tocá un día`

## Notas de producción

- Los estilos están inline en los `.dc.html` — portarlos a los tokens/componentes del design system del equipo.
- Montos con formato es-AR (`$3.008.920`), semana empieza en **L**.
- El ciclo es configurable (20→19); la grilla se construye desde el día de inicio del ciclo, no del mes calendario.
- Brot y partículas son web components listos (`<brot-mascot pose size shadow>`, `<brot-particles colors count>`), copiar tal cual.
