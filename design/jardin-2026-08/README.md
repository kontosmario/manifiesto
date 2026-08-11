# Handoff: Mi jardín — sistema semanal de hábito (rediseño)

## Overview
Rediseño completo de la sección **Mi jardín** de Manifiesto ("Finanzas para tu hogar"), en lenguaje **neumórfico** y dos temas (claro "Salvia" / oscuro "Noche de bosque"). Es el sistema de hábito de la app: cada gasto registrado **planta y riega el brote del día**; completar los 7 días hace **florecer el jardín** (semana perfecta). Incluye: la vista Mi jardín completa (hero de estados + componente semanal de aros de riego + semana pasada + logros + nota), las 4 variantes del **Cierre de semana**, la pantalla de **Logros**, y una **matriz dev-ready de 35 estados con sus animaciones**.

Complementa al handoff base `design_handoff_manifiesto_neumorfico` (tokens globales, tipografía, nav). Este documento es autosuficiente para implementar la sección.

## About the Design Files
Los archivos del bundle son **referencias de diseño creadas en HTML** — prototipos de look & feel, NO código de producción. La tarea es **recrear estas pantallas en el entorno del codebase destino** (React Native, Flutter, SwiftUI/Compose, etc.) con sus patrones y librerías; si no existe entorno aún, elegir el framework más apropiado para una app móvil.

Dos piezas sí son portables casi 1:1 (canvas JS vanilla, sin dependencias):
- `brot.js` — mascota Brot, web component `<brot-mascot>` con poses/emotes: `seed, sprout, idle, wave, love, cheer, radiant, think, worried, sad, wilted, coach` (+ `animated`, `shadow`, `size`).
- `particles.js` — partículas flotantes `<brot-particles>` (colores y `count` por props).

`Jardín Rediseño.dc.html` se abre directo en un navegador (requiere `support.js` al lado). La página es el spec visual: mockups de phone 393px + cards de estados + fichas técnicas.

## Fidelity
**High-fidelity (hifi).** Colores, tipografías, espaciados, sombras, copys y estados son finales. Recrear pixel-perfect. Mockups a 393px (iPhone 15/16). Textos y montos visibles son contenido demo real — respetarlos en previews.

## Regla de juego (product spec)
1. El objetivo es **siempre semanal** (lunes→domingo). No hay metas acumuladas en la UI principal.
2. **Cada gasto registrado planta el brote del día y lo riega**: el aro del día avanza con cada registro hasta su meta diaria (ej. 4 registros ⇒ +25% c/u). El % es de *riego*, no de dinero.
3. **Día sin gastos** marcado manualmente también completa el día (aro verde).
4. Aro al 100% ⇒ **día completo** (vira celeste→verde). 7/7 días ⇒ **semana florecida** (perfecta) ⇒ cierre celebratorio.
5. Un día pasado sin completar corta la racha (hero pasa a "Cortada"), pero **récord y jardín acumulado nunca se pierden**.
6. Lunes: aparece la card **Semana pasada** con el resultado y acceso al **Cierre de semana**.

## Vista Mi jardín — jerarquía (orden vertical, 393px)
1. **Header**: back circle 44px raised · título "Mi jardín" 30px/900 · subtítulo 12.5px/700 "Completa los 7 días y tu jardín florece."
2. **Hero de estado** (sistema 2a–2f, abajo) — muestra la acción del día. *Nota: se eliminó la fila chip-estado + 7 dots dentro del hero por redundancia con el componente semanal.* Queda: Brot 72px + label 10.5/800 (ls 0.14em) + título 22/900 + sub 11.5/700 + CTA.
3. **Tu jardín · semana vigente** (componente nuevo, spec abajo).
4. **Semana pasada**: card raised radius 24, padding 11×14 — Brot cheer 46 + "Semana pasada: perfecta" 14/900 + "Tu jardín floreció · 7 de 7 días" 11.5/700 + CTA "Ver cierre ›" (radial verde, radius 15, padding 9×14, 12/900).
5. **Logros**: card raised radius 24, padding 12×14 — stack de 3 medallas 34px (solape −12px, borde 2.5px color fondo; medalla=radial verde, bloqueada=pozo inset con "?") + "Logros" 14.5/900 + "7 de 13 · próximo: 10 semanas florecidas" 11.5/700 + chevron 30px inset.
6. **Nota educativa** (inset radius 20, padding 13×15, 12/700 centrado): "Cada gasto planta el brote del día; los siguientes lo riegan. Completa los 7 días y tu jardín florece. ¿Sin gastos? Marca el día y también suma."

## Componente "Tu jardín · semana vigente" (aro de riego)
Card raised radius 28, padding 16 16 14. Header: "Tu jardín" 15/900 + "semana vigente" 11.5/800 verde.

**Aro grande de foco del día** (centrado):
- Tamaño 130px, stroke 10, `r = (size − stroke)/2 − 1` (59), circunferencia `C = 2πr`.
- Track siempre visible; progreso con `stroke-dashoffset = C × (1 − pct)`, `rotate(−90°)` (arranca arriba), `stroke-linecap: round`.
- Pozo interior **100px** circular inset, Brot **centrado** (no apoyado al borde), 52px, animado.
- Chip inset debajo: dot 7px celeste + "65% regado · 3 gastos hoy" 12/900.

**Fila de 7 días** (justify-space-between):
- Aros 40px, stroke 4 (r=17), pozo interior 28px, Brot centrado 15–20px estático.
- Pasados: aro **verde** al % alcanzado (lleno = día completo; parcial = quedó a medias).
- HOY: aro **celeste** al % del riego actual, pozo con tinte (`#E4F3DC` claro / `#24402C` oscuro), label "HOY" 9.5/900 verde.
- Futuros: círculo 40px `border: 2.5px dashed`.
- Labels día 9.5/800.

**Leyenda** (9.5/800, centrada): dot verde "día completo" · dot celeste "riego de hoy · tus gastos lo llenan".

**Historial "Semanas anteriores"** (divider superior 1.5px):
- Label 10.5/800 + 2 filas de 7 dots 10px (gap 5): lleno / parcial / perdido.
- **Sin botón ni chevron**: toda la fila es tocable y abre el sheet de historial.

**Sheet historial** (bottom sheet): grabber 44×5px, título "Semanas anteriores" 15/900 + mes 11/800, 4 filas: rango ("19 – 25 may") 10.5/800 ancho 88px · 7 dots 12px · chip resultado inset 9.5/900 ("Florecida" verde `#2E7C39` sobre `#DFEAD6`; "5 de 7" gris `#8FA089` sobre `#E8E6E0`). Animación: sube con spring 350ms, dots stagger 40ms.

## Hero — sistema de estados (cards 2a–2f en la página)
Shell: card gradient hero radius 30–32, partículas ≤8–12, padding 19×20.
- **2a Empezar**: sin racha. Brot seed. "Plantá tu primer brote" + CTA "Plantar mi primer brote".
- **2b A tiempo**: racha viva, sin plantar hoy. Brot wave. "Plantá para sumar" + CTA "Plantar hoy". *(estado por defecto en el mockup)*
- **2c Plantado hoy**: registro hecho. Brot love. "¡Brote plantado!" + pill inset "Listo por hoy · volvé mañana para seguir".
- **2d Floreciendo**: plantado + racha ≥7. Brot radiant + halo. Pill "Ver mi jardín ›".
- **2e En riesgo**: sin plantar ≥20:00. Brot worried, acento ámbar (`#F2C48A`/`#F2A87E`), CTA naranja "Plantar antes de medianoche".
- **2f Cortada**: ayer sin plantar. Brot sad, gradiente desaturado, chip "× Perdida", CTA "Empezar de nuevo".

## Cierre de semana — 4 variantes (mockups completos claro+oscuro en la página)
- **Perfecta (7/7)**: hero verde full-bleed + partículas, Brot cheer, "Tu jardín floreció.", mini-brots de la semana festejando (pose cheer), stats (+7 brotes · jardín · récord), logro desbloqueado integrado, CTA "Seguir cultivando".
- **Buena (5–6/7)**: superficie neutra, Brot love, "Casi perfecta.", tarjeta "próximo logro" con barra.
- **Floja (2–4/7)**: Brot think, "Tu jardín aguantó.", coach de Brot con nudge.
- **Cortada (0–1/7)**: Brot sad, "Tu racha se cortó.", protege récord/jardín ("siguen guardados"), CTA "Plantar hoy".
Cada mockup lleva su ficha técnica al lado en la página (disparador, superficie, stats, CTA).

## Pantalla Logros
Resumen (X de N + barra + nudge) y lista de filas: **desbloqueado** (medalla radial verde con Brot o número + check), **en progreso** (badge inset + barra actual/meta), **secreto** (silueta "?" + candado, no se revela). Orden: desbloqueados → en progreso → secretos.

## Matriz de estados + animaciones (35 estados)
Formato: **T** disparador · **V** visual · **A** animación. Los 8 marcados ⚠ no tienen visual diseñado aún.

### ① Hero (8)
1. Empezar (2a) — T: sin racha. A: entrada fade+rise 300ms; seed sway loop 2.5s.
2. A tiempo (2b) — A: saludo cada 6s; partículas lentas.
3. Plantado (2c) — T: registro hecho. A: pop spring 1.15→1 (400ms) + burst 12 partículas al volver del registro.
4. Floreciendo (2d) — A: halo pulse 3s loop.
5. En riesgo (2e) — T: ≥20:00 sin plantar. A: borde ámbar fade-in 400ms; CTA pulse scale 1.03 c/4s.
6. Cortada (2f) — A: sin loops; entrada fade.
7. Transición entre estados — A: crossfade copy 200ms + swap Brot scale 0.9→1 (250ms).
8. ⚠ Carga — V: skeleton de pozos. A: shimmer 1.2s.

### ② Tu jardín (9)
1. Sin riego (7a) — aro track only, seed sway.
2. Regando (7b) — A por gasto: dashoffset ease-out 600ms + gota celeste cae al pozo 400ms + wiggle Brot + count-up del %.
3. Día completo (7c) — A: viraje celeste→verde 500ms + ripple + pop love.
4. Día sin gastos (7d) — T: marca manual. A: check draw 300ms + viraje verde.
5. Semana florecida (7e) — T: domingo 7/7. A: pulse secuencial aros stagger 80ms + partículas 2s + CTA a cierre.
6. ⚠ Día perdido — V: aro congelado al % + Brot wilted 45% opacidad. A: ninguna.
7. Medianoche — A: HOY se congela y encoge 56→40px (300ms); el siguiente pasa de punteado a activo (400ms) con seed nuevo.
8. Historial (7f) — A: sheet spring 350ms + dots stagger 40ms.
9. ⚠ Primera semana — fila historial oculta.

### ③ Semana pasada (6)
Perfecta / Buena / Floja / Cortada (V según cierre; cheer loop 4s sólo perfecta) · ⚠ Cierre sin ver (dot naranja pulse 2s junto al CTA, se apaga al abrir) · Primera semana (card oculta).

### ④ Logros (5)
Normal · ⚠ Logro nuevo sin ver (medalla al frente, pop spring + glow 2s, dot naranja hasta abrir) · Próximo ≤2 días ("?" tiembla c/8s) · ⚠ Colección completa (shine sweep una vez) · ⚠ Usuario nuevo ("Tu primer logro a 1 día", siluetas).

### ⑤ Nota (2)
Visible (primeras 2 semanas o hasta descartar) · ⚠ Descartada (fade + collapse 250ms; requiere "×").

### ⑥ Transversal (5)
Press neumórfico raised→inset 120ms (vuelve 180ms) · Partículas sólo hero y florecida, ≤12, pausadas fuera de viewport · Reduced motion: loops off, fades 150ms, sin partículas · Tema claro/oscuro instantáneo por sistema · Entrada de vista: cards stagger 60ms, fade + rise 12px.

## Design tokens del sistema jardín
Base global (tipografía Nunito, fondos, sombras raised/inset, CTAs, radios): ver `design_handoff_manifiesto_neumorfico/README.md`. Fondo claro actualizado a neutro: **`#EEEDE9`** (sombras claras con base `rgba(166,162,152,…)`); oscuro sin cambios (`#16271C`).

| Token | Claro | Oscuro |
|---|---|---|
| Celeste riego (progreso día) | `#5FB8C9` | `#7FD0DE` |
| Verde día completo / aro lleno | `#63B168` | `#8FCF95` |
| Track de aro | `#E3E1DA` | `#2A4032` |
| Pozo de aro | `#E8E6E0` | `#142519` |
| Pozo HOY (tinte) | `#E4F3DC` | `#24402C` |
| Futuro (dashed) | `#D8D5CC` | `#3A5040` |
| Dot historial lleno / parcial / perdido | `#63B168` / `#A9CE8E` / `#D6C29E` | `#8FCF95` / `#5F8A66` / `#4A3A26` |
| Label HOY / acento | `#2E7C39` | `#A4E3A6` |
| Ámbar riesgo | `#F2C48A` · `#C96F3F` | `#F2A87E` |
| Chip resultado florecida | texto `#2E7C39` bg `#DFEAD6` | equiv. translúcido oscuro |

**Geometría de aros (SVG)**: `r = (size − stroke)/2 − 1`; `C = 2πr`; progreso = `stroke-dashoffset: C × (1 − pct)`; `transform: rotate(−90° centro)`; `stroke-linecap: round`; track siempre debajo. Aro grande 130/10 (pozo 100) · aro día 40/4 (pozo 28) · Brot siempre **centrado** en el pozo.

## Pendientes de diseño (8)
Skeleton del hero · día perdido en fila semanal · primera semana (sin historial) · badge "cierre sin ver" · logro nuevo sin ver · colección completa · usuario nuevo en logros · nota descartada (con "×"). Especificados arriba; falta su visual.

## Assets
- `brot.js` / `particles.js` (canvas, portables) · `support.js` (runtime para abrir el .dc.html, NO portar).
- Fuente: Nunito (Google Fonts) 400–900.
- Iconografía: flechas/chevrons SVG stroke 2.8–3, `stroke-linecap/join: round`. Sin librería de íconos.

## Files
- `Jardín Rediseño.dc.html` — página spec completa: matriz de estados, estados del componente (7a–7f), sistema hero (2a–2f), mockups Mi jardín claro/oscuro, 4 cierres claro/oscuro con fichas, Logros claro/oscuro con ficha.
- `brot.js`, `particles.js`, `support.js`.
