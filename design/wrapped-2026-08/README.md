# Handoff: Wrapped de cierre de ciclo — "La Edición"

## Overview
Experiencia de **cierre de ciclo** de Manifiesto ("Finanzas para tu hogar"): al terminar cada ciclo (ej. 20 jun → 19 jul), la app genera una **edición coleccionable** que Brot presenta como historia tap-to-advance de **7 pantallas**. Fusión aprobada: **marco editorial** (sello "Edición Nº 3", páginas numeradas, estampa de veredicto, estantería) sobre **energía nocturna** (fondo verde profundo, números gigantes, barra de progreso tipo story). Brot es protagonista y guía: recibe → cuenta → celebra/acompaña → aconseja el destino del sobrante → despide.

Incluye: flujo completo nocturno (canónico) y claro, **compartir resumen** (sheet con toggle de privacidad + tarjeta 9:16 exportable), y **estados** (MARGEN / EXCEDIDO / JUSTO + jardín incompleto).

Complementa a `design_handoff_manifiesto_neumorfico` (tokens globales) y `design_handoff_jardin` (lenguaje de aros y puntos que reutiliza la pantalla 04).

## About the Design Files
Los archivos son **referencias de diseño en HTML** — prototipos de look & feel, NO código de producción. Recrear en el entorno del codebase destino (React Native, Flutter, SwiftUI/Compose, etc.). `Wrapped Manifiesto.dc.html` se abre directo en un navegador (requiere `support.js` al lado) y es el spec visual completo.

Portables casi 1:1 (canvas JS vanilla): `brot.js` (mascota `<brot-mascot>`, poses usadas aquí: `wave, think, wow, sprout, cheer, radiant, coach, love, worried, zen, peek`) y `particles.js` (`<brot-particles>`).

## Fidelity
**High-fidelity.** Colores, tipografía (Nunito 400–900), espaciados, sombras, copys y estados son finales. Mockups a 393×830 (iPhone 15/16). Montos y fechas son contenido demo real del ciclo "Edición Nº 3 · 20 jun → 19 jul 2026" — respetarlos en previews.

## Regla de juego (product spec)
1. **Disparador**: primer día del nuevo ciclo. Entrada por notificación + badge en Inicio. Toda edición cerrada queda en **Ediciones** y se puede **revivir** (re-ver el wrapped) cuando se quiera.
2. **Navegación story**: tap en mitad derecha avanza, mitad izquierda retrocede; swipe down cierra (la edición queda guardada igual). Sin auto-avance: cada pantalla espera el tap.
3. La barra superior de **7 segmentos** marca el progreso (segmento activo crema/verde, resto 22% opacidad).
4. El **veredicto** (pantalla 05) define el estado global: `saldoCierre > umbral` ⇒ **MARGEN** · `< 0` ⇒ **EXCEDIDO** · `0 ≤ saldo ≤ $10.000` ⇒ **JUSTO**.
5. La **pantalla 06 es condicional**: MARGEN ⇒ "Destino del sobrante"; EXCEDIDO ⇒ "Plan de recuperación"; JUSTO ⇒ **se salta** (flujo queda de 6, el resto se suma al nuevo ciclo con aviso en el copy de 05).
6. La decisión de 06 **ejecuta una acción real** al confirmar (mover a reserva / acreditar a meta / sumar al presupuesto del ciclo nuevo) y queda reflejada en el chip de la contratapa.
7. **El wrapped es nocturno en ambos temas de la app** en su versión canónica; existe modo claro completo si producto decide seguir el tema del sistema. La **tarjeta de compartir es siempre nocturna** (asset exportable de marca).

## Fuentes de datos por pantalla
| Pantalla | Fuente en la app |
|---|---|
| 01 Portada | Ediciones (número de edición, rango del ciclo) |
| 02 Los números | Gastos (total, movimientos, promedio/día) |
| 03 Top 3 | Gastos (categorías) + Fijos (pagados/total, monto) |
| 04 Tu jardín | Mi jardín (días registrados, racha, días sin gastos) |
| 05 Veredicto | Control/Inicio (saldo de cierre vs ciclo anterior) |
| 06 Destino | Control (sobrante) + Metas + presupuesto del ciclo |
| 07 Contratapa | Ediciones (estantería, saldo acumulado) + decisión de 06 |

## Flujo — spec por pantalla (nocturno canónico)
Shell común: fondo `linear-gradient(165deg, #1E3F2A 0%, #14301E 55%, #0F1E14 100%)` · status bar crema · barra de progreso 7 segmentos (h 4px, radius 2, gap 5) · marcador "N DE 7" 10/800 (ls 0.2em) al pie · burbuja de Brot: radius `18 18 18 4` (o espejada `18 18 4 18` si Brot está a la derecha), padding 11×14, 12.5/700, card raised oscura.

1. **Portada** — tag "CIERRE DE CICLO" 11/900 durazno (ls 0.26em) · **sello**: círculo raised 206px + interior inset 162px con logo 48px, "EDICIÓN" 9/900 (ls 0.3em), "Nº 3" 29/900, rango 8.5/800 · título "Tu ciclo se cerró." 31/900 · chip inset "20 JUN → 19 JUL · 30 DÍAS · 64 MOV" · Brot `wave` 104 + burbuja "Te preparé la edición de este ciclo. ¿La abrimos juntos?" · CTA crema "Explorar la edición ›" (el .dc.html congelado dice "Abrir la edición ›": cambio de copy del 2026-08-17, el export de diseño no se re-genera) · partículas 12.
2. **Los números** — tag "EDICIÓN Nº 3 · LOS NÚMEROS" · titular "Un mes escrito a mano." 30/900 · 3 filas editoriales (label 10.5/900 vs valor 31/900, divisor 2px `rgba(164,227,166,0.16)`): GASTASTE $3.008.920 · MOVIMIENTOS **64** (verde) · PROMEDIO POR DÍA $167.162 · Brot `think` 92 + "64 veces anotaste lo que pasó. Yo guardé todo."
3. **Top 3** — tag "TU TOP 3 DEL CICLO" · ranking tipográfico: rank fantasma 58/900 `rgba(164,227,166,0.35)`; #1 nombre 30/900 crema + monto 15/800 verde; #2–3 24/900 `#D9DCC8` + 14/800 gris · strip inset fijos: "Y tus fijos cumplieron: **16 de 16 pagados** · $1.350.482." · Brot `wow` 98 + "La casa primero. Me gusta cómo pensás."
4. **Tu jardín** — lenguaje del handoff de jardín: **aro grande 130/10** (geometría: `r=(size−stroke)/2−1`, dashoffset `C×(1−pct)`, rotate −90°, linecap round) al **100%**, pozo interior 100px inset con Brot `sprout` 52 · chip inset "100% plantado · racha récord nueva: 30 ✦" · card raised "Semana a semana": 5 filas rango 9.5/800 (ancho 88px) + dots 13px gap 6 (lleno `#8FCF95`, día sin gastos celeste `#7FD0DE`) · leyenda · Brot `cheer` 88 + "Jardín completo: hasta el día sin gastos plantó su semilla."
5. **El veredicto** — Brot `radiant` 150 con glow `drop-shadow(0 0 18px rgba(164,227,166,0.3))` · "CERRASTE EL CICLO CON" 12/900 (ls 0.24em) · monto 56/900 crema · **estampa** MARGEN: border 3px `#A4E3A6`, radius 10, padding 5×18, 13/900 (ls 0.24em), rotate −5° · sub "Mejor cierre que mayo…" · CTA crema "¿Y ese sobrante? ›" · partículas 22.
6. **Destino del sobrante** — tag "QUEDA UN SOBRANTE" · titular "¿Qué hacemos con los +$324.617?" (monto verde) · 3 opciones radio (cards radius 22, padding 15×16; no seleccionada = pozo inset + radio outline; **seleccionada = raised + borde 2px verde + check relleno**): 🐷 **Reservar aparte** "Queda apartado del ciclo. Decidís después, sin apuro." · 🎯 **Destinar a mi meta** "Vacaciones 2027 · $1,2M → $1,5M de $3M" + barra de progreso (fill actual 78% del avance + tramo nuevo en verde claro) · 🔄 **Sumarlo al nuevo ciclo** "Julio arranca con +$324.617 extra." · íconos en tiles pastel 46px (sand/lavender/aqua) · Brot `coach` 86 + "A tu meta le faltan $1,8M — este empujón la acerca un mes entero." · CTA "Confirmar destino". Default seleccionado: **meta activa** si existe; si no, "Reservar aparte".
7. **Contratapa** — tag "CONTRATAPA" · "Edición Nº 3, a la estantería." 28/900 · chip inset verde "✓ Sobrante → Meta Vacaciones 2027" (refleja la decisión de 06) · **estantería**: pozo inset radius 24 con 3 mini-cards raised (ABRIL +$1,7M verde · MAYO −$1,6M durazno · JUNIO ✦ NUEVA con logo + borde 2px verde) + listón inset + "SALDO ACUMULADO · +$463.725 EN 3 EDICIONES" · Brot `love` 104 + "Mañana arranca el ciclo nuevo…" · CTA primario "**Compartir resumen**" + link "Empezar el nuevo ciclo ›" · partículas 16 · barra 7/7 llena.

## Modo claro (mismo flujo, tokens crema)
Fondo `#EEEDE9` · sombras raised `8 8 18 rgba(166,162,152,0.42) / −8 −8 18 rgba(255,255,255,0.92)` · pozos inset `#E8E6E0` · texto `#24382A` / sec `#6C7B67` · tag editorial durazno → `#C96F3F` · progreso activo `#2E7C39`, inactivo `rgba(36,56,42,0.15)` · estampa/valores verde `#2E7C39` / profundo `#1F5429` · rank fantasma `rgba(46,124,57,0.25)` · CTA primario = **botón radial del jardín**: `radial-gradient(circle at 32% 28%, #63B168, #2E7434 85%)`, texto `#F5F2E1`, sombra `0 10px 20px rgba(46,116,52,0.32), inset 0 1.5px 2px rgba(255,255,255,0.3)` · jardín: aro `#63B168`, track `#E3E1DA`, pozo `#E8E6E0`, semilla `#5FB8C9` · partículas `#8FBE77, #E8B48C, #CBD8C0`.

## Compartir resumen
- **Sheet** (sobre contratapa atenuada): grabber 44×5 · título 19/900 · **toggle segmentado inset** "Con montos / Sin montos" (activo = pill verde `#A4E3A6` texto oscuro) · preview en vivo de la tarjeta (~172px) · 4 destinos en círculos raised 52px: WhatsApp · Stories · Guardar · Copiar · "Cancelar".
- **Tarjeta 9:16** (export 1080×1920; mockups 300×533, siempre nocturna): tag "EDICIÓN Nº 3 · JUN → JUL 2026" durazno · Brot `radiant` · **Con montos**: "CERRÉ MI CICLO CON" + monto 34/900 + estampa + stats (64 MOVIMIENTOS · 30/30 DÍAS · 30 RACHA en pozos inset) · **Sin montos** (privacidad): sin cifras de dinero — "CERRÉ MI CICLO EN VERDE" + estampa grande + stats no monetarios (movimientos, días, top categoría en %) · footer logo + "Manifiesto · finanzas para tu hogar" · partículas 12.
- Estampa de la tarjeta sigue el estado (MARGEN verde / EXCEDIDO durazno / JUSTO crema).

## Estados — matriz (T disparador · V visual · A animación)

### ① Veredicto (05)
1. **MARGEN** — T: saldo > $10k. V: Brot radiant + glow, monto crema, estampa verde −5°, partículas 22, CTA "¿Y ese sobrante? ›". A: ver animaciones 05.
2. **EXCEDIDO** — T: saldo < 0. V: Brot `worried` 140 (sin glow), monto durazno `#F2A87E` 50/900, estampa durazno +4°, **sin partículas**, copy contenedor ("Pasa — lo importante es que ya lo viste"), CTA "¿Cómo lo encaramos? ›". A: sin burst; estampa cae sin rebote (300ms).
3. **JUSTO** — T: 0 ≤ saldo ≤ $10k. V: Brot `zen` 140, monto crema, estampa crema −3°, sin partículas, marcador "5 DE 6", CTA "Cerrar la edición ›". A: fade suave, sin celebración.

### ② Paso 6 condicional
1. **Destino del sobrante** (MARGEN) — 3 opciones; ⚠ sin meta activa: opción meta reemplazada por "Crear una meta" (pendiente de visual).
2. **Plan de recuperación** (EXCEDIDO) — tag "HAY UN ROJO QUE CUBRIR" durazno; opciones: 🐷 **Cubrir con la reserva** "Tenés $324.617 apartados de abril · cubre el 20%" (oculta si reserva = 0) · 📉 **Ajustar el nuevo ciclo** "Cupo diario baja de $179k a $126k y julio lo absorbe" (default, selección con borde/check **durazno** `#F2A87E`) · 🔍 **Revisar el top 3** "Ver dónde se fue y marcar categorías a recortar" · Brot coach "Sin drama: julio ajustado lo absorbe. Yo te acompaño día a día." · CTA "Armar el plan".
3. **Saltado** (JUSTO) — no se muestra; el resto se acredita al ciclo nuevo automáticamente.

### ③ Jardín (04)
1. **Completo 30/30** — aro 100%, chip "racha récord nueva: 30 ✦", dots todos llenos, Brot cheer.
2. **Incompleto** (ej. 24/30) — aro al 80% (dashoffset 74.14 sobre C 370.71), chip "80% plantado · mejor racha del ciclo: 12", chip contador durazno "24 de 30", dots perdidos `#4A3A26` (leyenda "sin registrar", label `#8A6A42`), Brot `coach` + "24 brotes igual es un jardín. Los huecos me dicen dónde acompañarte mejor."
3. **Día sin gastos** — dot celeste `#7FD0DE` + leyenda; cuenta como plantado.

### ④ Compartir
1. Con montos / 2. Sin montos — el toggle re-renderiza la preview en vivo. 3. ⚠ Falla de share nativo → fallback "Guardar imagen".

### ⑤ Entrada y re-visita
1. **Primera vez** — T: día 1 del ciclo nuevo; badge + push "Tu Edición Nº 3 está lista".
2. **Revivir** — desde Ediciones ("Revivir esta edición"): mismo flujo, paso 6 en modo lectura (muestra la decisión tomada, sin CTA de confirmación).
3. ⚠ **Generando** — loading breve con sello + shimmer (pendiente de visual).

## Animaciones
- **Navegación**: slide horizontal 22px + crossfade 250ms entre pantallas; segmento de progreso se llena 200ms.
- **01**: sello entra scale 1.06→1 + settle 400ms; Brot wave loop c/6s; partículas lentas.
- **02**: filas stagger 80ms (fade + rise 10px); montos count-up 800ms ease-out al entrar.
- **03**: ranking sube stagger 120ms (#3→#1, el #1 al final con pop 1.05→1).
- **04**: aro se llena 0→pct 900ms ease-out + count-up del chip; dots stagger 30ms por fila; pop `love` del Brot del pozo al llegar a 100%.
- **05 (MARGEN)**: monto count-up 700ms → **estampa "sella"**: scale 1.4→1 + rotate settle 350ms con haptic medio + burst de 12 partículas; halo del radiant pulse 3s loop.
- **06**: cards stagger 70ms; al seleccionar: pozo→raised 150ms + check pop spring; barra de meta anima el tramo nuevo 600ms ease-out.
- **07**: la mini-card JUNIO baja al estante (translateY −14→0, 450ms spring) + glow del borde 800ms; saldo acumulado count-up.
- **Compartir**: sheet spring 350ms; toggle crossfade de tarjeta 200ms.
- **Transversal**: press neumórfico raised→inset 120ms (vuelve 180ms) · partículas ≤22 pausadas fuera de viewport · **reduced motion**: sin count-up (valores directos), fades 150ms, sin partículas, estampa sin spring.

## Design tokens propios del wrapped
| Token | Nocturno | Claro |
|---|---|---|
| Fondo | gradiente `#1E3F2A → #14301E 55% → #0F1E14` (165°) | `#EEEDE9` |
| Tag editorial | `#F2A87E` | `#C96F3F` |
| Progreso story activo / resto | `#F1EEDD` / `rgba(241,238,221,0.22)` | `#2E7C39` / `rgba(36,56,42,0.15)` |
| Titular / monto héroe | `#F1EEDD` | `#24382A` / `#1F5429` |
| Estampa MARGEN / EXCEDIDO / JUSTO | `#A4E3A6` / `#F2A87E` / `#F1EEDD` | `#2E7C39` / `#C96F3F` / `#6C7B67` |
| Rank fantasma (top 3) | `rgba(164,227,166,0.35)` | `rgba(46,124,57,0.25)` |
| Divisor editorial | `rgba(164,227,166,0.16)` 2px | `rgba(166,162,152,0.35)` 2px |
| CTA primario | crema `#F1EEDD` texto `#1F3A26` | radial verde `#63B168→#2E7434` texto `#F5F2E1` |
| Card raised / pozo inset | `linear-gradient(145deg,#1C3325,#132318)` / `rgba(11,30,15,0.35)` | `#EEEDE9` / `#E8E6E0` |
| Burbuja de Brot | raised oscura, radius `18 18 18 4` | raised crema, ídem |
| Partículas | `#A4E3A6, #F2A87E, #F1EEDD` | `#8FBE77, #E8B48C, #CBD8C0` |
| Estampa (forma) | border 3px · radius 10 · ls 0.24em · rotate −5°/+4°/−3° | ídem |

Sello portada: círculo raised 206 + interior inset 162 · Aros del jardín: ver tabla y geometría en `design_handoff_jardin`.

## Pendientes de diseño (6)
Paso 6 sin meta activa ("Crear una meta") · estado "Generando tu edición" (loading) · primera edición (estantería con 1 sola card) · ciclo con <10 movimientos (¿wrapped corto?) · wrapped por miembro del hogar (hoy es del hogar completo) · fallback de share nativo.

## Assets
- `brot.js` / `particles.js` (canvas, portables) · `support.js` (runtime para abrir el .dc.html, NO portar).
- `brot/logo-light.png` · `brot/logo-dark.png` (logo oficial por tema — el sello y la estantería lo usan).
- Fuente: Nunito (Google Fonts) 400–900. Emojis de sistema como íconos de opciones (vocabulario de la app).

## Files
- `Wrapped Manifiesto.dc.html` — spec visual completo: flujo nocturno 7 pantallas (2a) + compartir/tarjetas (2b) + flujo claro (3a) + estados (3b).
- `brot.js`, `particles.js`, `support.js`, `brot/`.
