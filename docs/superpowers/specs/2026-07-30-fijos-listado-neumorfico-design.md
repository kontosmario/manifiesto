# Listado de Fijos — migración a la piel neumórfica

Fecha: 2026-07-30 · Branch `feat/ui-redesign`
Contexto previo: `.superpowers/sdd/2026-07-29-fijos-cableado/HANDOFF.md`

## Problema

La pantalla `neo-fijos` monta el kit del rediseño para header, hero y Avisos,
pero la sección "Todos tus fijos" reusa `FijoCategoryGroups` / `FijoRow` de la
pantalla viva. Esa decisión fue CORRECTA y no se re-litiga: el kit dibuja una
sola fila por categoría, sin expansión y sin superficie por-fijo, así que no
puede tener la lista colapsable ni el botón "Pagar" por fijo que el owner pidió
(fallo del 2026-07-30). Pero arrastró la piel vieja entera.

Diff medido en el browser (dark, `expo start --web`), no estimado a ojo:

| Elemento | Hoy | Kit (`FIJOS_SPEC.dark`) |
| --- | --- | --- |
| Card de fila | `#0F2E1F`, radio 16 solo izquierda | `#1A2D21` + `linear-gradient(145deg,#1D3426,#132318)`, radio 22 |
| Sombra de fila | `rgba(242,234,211,0) 0 4px 10px` → alfa 0, INVISIBLE | `RAISE_D` (dual: oscura `8/8/18` + luz `-8/-8/18`) |
| Tile del sticker | `#F2DDEC` plano, radio 12, sin sombra | tinte translúcido del hue + `raiseSm`, radio 16 |
| Botón Pagar | `#F2EAD3` plano, radio 11 | mismo fill neutro + `raiseSm`, radio 15 |

O sea: el listado no está "un poco distinto", está COMPLETAMENTE PLANO — cero
profundidad — mientras todo lo de arriba tiene el doble sombreado neumórfico. Y
los tiles meten placas pastel claras que rompen la paleta oscura.

## Alcance

**Solo la piel.** Mismo layout, misma información, mismos handlers. Cambian
únicamente tokens visuales. NO entra: reordenar la fila, cambiar la densidad de
la lista, ni convertir el header de categoría en card.

Fuera de alcance explícito (tienen gate propio): Fase 2 (detalle expandido del
ítem) y Fase 3 (alta en 2 pasos).

## Restricciones

1. **El kit no se toca.** `fijos-screen.tsx` / `fijos-spec.ts` están esperando
   el gate visual del owner (`REDESIGN_APPROVAL['fijos'] === 'pendiente'`).
2. **La pantalla viva no cambia.** `fijos-v2-screen.tsx` consume los mismos
   `FijoCategoryGroups` / `FijoRow` y sigue en producción con la piel vieja.
3. Los stickers de categoría se preservan. Son PNG del sistema de 90 íconos
   (`CategoryIcon` → `CategorySticker`), resueltos por slug estable. NO son SVG
   — los SVG del kit son otra cosa (chevrons, checks, glifos de estado) y
   también se preservan.

## Enfoque elegido

**Skin por contexto sobre los componentes vivos.**

```
FijosSkinProvider  →  provee el skin 'neo' resuelto desde FIJOS_SPEC[mode]
useFijosSkin()     →  sin provider arriba, devuelve 'classic' (useThemeTokens)
```

La propiedad de seguridad vive en el default: la pantalla viva no envuelve nada,
así que recibe `classic`, que resuelve los mismos valores que hoy. No es "hay
que acordarse de no romperla" — no hay camino por el que cambie.

### Alternativas descartadas

- **Componente neo nuevo que duplique la lista.** La lista viva son 1.793
  líneas en 9 archivos (swipe, confetti, panel expandible, spark de tendencia,
  botón de pago, placeholder). Duplicarla bifurca esa lógica y diverge al
  primer fix que se aplique a una sola rama.
- **Refactor a shell presentacional + 2 skins.** Más limpio a largo plazo, pero
  es cirugía mayor sobre código que corre en producción y que NO tiene tests de
  render (la suite es de lógica; no hay renderer de React). Riesgo
  desproporcionado para una migración de piel.

## Contrato del skin

Expone solo lo que difiere, con los valores ya resueltos para el tema:

| Grupo | Campos |
| --- | --- |
| `rowSurface` | `background`, `gradientCss?`, `shadow?`, `radius` |
| `ink` | `title`, `amount`, `meta`, `chevron` |
| `tile` | `radius`, `shadow?`, `fill: 'plate' \| 'tint'` |
| `pay` | `radius`, `shadow?` |

**Lo que NO entra al skin:** el accent por estado (`computeAccent`) y el hue por
categoría (`resolveCategoryHueByName`). Eso es contenido, no piel — lo dicta el
dato, no el tema, y ya se comporta igual en los dos mundos.

La única REGLA que el skin cambia es `tile.fill`:

- `plate` (classic) — el sticker va sobre la placa pastel CLARA del hue, que es
  lo que hoy hace `CategoryIcon` en dark cuando no recibe `onLightSurface`.
- `tint` (neo) — tile con tinte translúcido del hue + `raiseSm`, y el sticker
  con `onLightSurface`. Es exactamente el tratamiento del kit de Gastos, ya
  aprobado por el owner (`gastos-screen.tsx:2313`).

### Por qué el tinte sale del hue y no de los tokens del spec

`FIJOS_SPEC` tokeniza tiles para 3 categorías (`categoryTileHousing` / `Subs` /
`Services`) porque el mockup dibuja 3. La familia real tiene ~11. Si el tinte
saliera de esos tokens, las 11 categorías colapsarían a 3 colores — que es
justo el problema que el HANDOFF dice que se resolvió al reusar la lista viva.
El hue por categoría ya existe y ya es correcto; el skin solo cambia CÓMO se
aplica (tinte translúcido vs placa opaca).

## Archivos

| Archivo | Cambio |
| --- | --- |
| `mobile/components/fijos/fijos-skin.tsx` *(nuevo)* | contexto, provider, resolvers `classic` / `neo` |
| `mobile/components/fijos/fijo-category-groups.tsx` | tintas del header de categoría y del total |
| `mobile/components/fijos/fijo-row.tsx` | superficie de la card, tile del sticker, tintas |
| `mobile/components/fijos/fijo-row-parts/inline-pay-button.tsx` | pill de Pagar |
| `mobile/screens/home/neo/neo-fijos-screen.tsx` | envuelve la lista en el provider |

Flujo de datos: sin cambios. El skin es puramente presentacional y se lee por
contexto; ningún componente recibe props nuevas desde la pantalla.

## Verificación

La suite de tests es de lógica y no tiene renderer de React, así que ningún
test puede ver esto. La verificación es visual y comparativa, en el browser
(`expo start --web`, sesión persistida en dev):

1. **Pantalla viva** (`/fixed-expenses`) antes/después → debe quedar IDÉNTICA.
   Es la prueba de que la rama `classic` no se movió.
2. **Pantalla neo** (`/settings/dev/neo-fijos`) antes/después → debe cambiar
   solo la piel: mismo layout, mismos datos, misma cantidad de filas.
3. Los dos temas, claro y oscuro.
4. `npx tsc --noEmit`, `npx eslint`, y los guards de `npm run validate`.

## Hallazgo: los gradientes del kit NO se ven en el preview web

Verificado midiendo el DOM: en toda la pantalla hay CERO gradientes CSS — los
únicos nodos con `backgroundImage` son los PNG de los stickers.
**`experimental_backgroundImage` no renderiza en react-native-web**; solo
funciona en nativo.

Consecuencias:

1. El patrón del kit "si hay gradiente, NO emitas `backgroundColor`" (que
   existe para no pintar dos fills por fila) deja el elemento TRANSPARENTE en
   web. La fila neo cayó exactamente en eso en el primer intento. Acá se emite
   SIEMPRE el color: nativo pinta el gradiente encima, web cae al sólido del
   spec — que es el color medio del propio gradiente, así que la diferencia es
   imperceptible.
2. **El preview web NO sirve para fallar gradientes.** Para el gate visual del
   kit, cualquier superficie con `*GradientCss` hay que mirarla en simulador o
   device, no en el browser. Vale para el hero, las cards de Avisos y las
   filas.

## Integración de la card del handoff (2026-07-30, 2ª tanda)

Fuente: `~/Downloads/design_handoff_fijos/Detalle Fijo Manifiesto.dc.html`.

**Dónde vive cada cosa en el handoff** — importa, porque determina a qué se
aplica cada métrica:

- `Fijos Manifiesto.dc.html` → "TODOS TUS FIJOS" son filas de **CATEGORÍA**
  (`Vivienda · 4 ítems · 1 vencido · $499.580`, radio 22, gap 12). NO hay
  filas por ítem.
- `Detalle Fijo Manifiesto.dc.html` → la card grande por ÍTEM (radio 26,
  padding 16, tile 52, nombre 19/900, monto 21/900, chips inset r12,
  "SE LLEVA AL AÑO", TENDENCIA, ESTE PAGO, HISTORIAL, CTA) es el estado
  **EXPANDIDO**.

Por lo tanto las métricas grandes se aplican SOLO al expandir (`bigCard =
skin.kind === 'neo' && open`). Aplicarlas a la fila colapsada rompe con datos
reales: al nombre le quedan ~20px y queda "Appl e …".

### Auditoría de sombras (2026-07-30) — el spec NO las tenía

Se contaron las ocurrencias de `box-shadow` en los dos `.dc.html` y se
compararon con `FIJOS_SPEC`, `GASTOS_SPEC` y `home-spec`. Resultado:

| Elemento | Handoff claro | Handoff oscuro | ¿En FIJOS_SPEC? |
| --- | --- | --- | --- |
| Card / fila de categoría (r22/26) | `8/8/18 rgba(151,160,136,0.40)` + `-8/-8/18 rgba(255,255,255,0.92)` | `8/8/18 rgba(0,0,0,0.55)` + `-8/-8/18 rgba(101,152,113,0.1)` | sí (`rowShadow`) |
| Tile del sticker y pill (r15/16) | `5/5/12 rgba(151,160,136,0.42)` + `-5/-5/12 rgba(255,255,255,0.92)` | `5/5/12 rgba(0,0,0,0.5)` + `-4/-4/11 rgba(101,152,113,0.11)` | **NO** (tiene 6/6/14 @0.45) |
| Chip inset (r12) | `inset 3/3/7 rgba(151,160,136,0.38)` + `inset -3/-3/7 rgba(255,255,255,0.92)` | `inset 3/3/7 rgba(0,0,0,0.48)` + `inset -3/-3/7 rgba(101,152,113,0.1)` | **NO** (tiene 3/3/6 @0.4) |

El spec se transcribió de las superficies GRANDES de la pantalla principal, así
que `raiseSm` e `insSoft` NO son los valores que el handoff dibuja para tiles y
chips. Por eso el skin define esos dos como constantes propias, transcritas
contando ocurrencias (5/5/12 aparece 22×, inset 3/3/7 aparece 43×).

**Consistencia con Home y Gastos:** en OSCURO los tres sistemas ya son
idénticos byte a byte. En CLARO, Fijos trae `0.40` y Home/Gastos `0.42` — es
una discrepancia entre handoffs, no del porteo. Por decisión del owner
(2026-07-30) manda la consistencia del sistema: el skin usa `0.42`.

**Tile, dos temas distintos:** en CLARO el handoff usa el pastel OPACO de la
categoría (`#F3C9BC`, `#E6E0F4`); en OSCURO el mismo hue al **14%** (no 16%).
No es el mismo alpha en los dos temas. Efecto lateral bueno: en claro el
sticker se lee a pleno, porque fue dibujado para fondo claro.

**Fila de categoría = CARD.** El handoff la dibuja elevada (radio 22, raise),
no como texto pelado. Es la superficie que se toca para expandir, así que el
relieve además la vuelve legible como control.

### Conflicto del nombre en la fila superior — RESUELTO (opción 1)

Medido en el DOM con la card expandida: la columna del nombre recibía **47,1px**
y "Netflix" a 19px/900 necesita **~75px**. No era el porteo: a los 393px del
mock al nombre le quedan ~65px, así que **el handoff no entra su propio
ejemplo** con el pill `$ Pagar` en la fila. En HTML el texto desborda; en RN
envuelve y parte.

Resuelto por la **opción 1** (elegida por el owner): al expandir, "Pagar" sale
de la fila superior y baja como **CTA de ancho completo**, en el mismo slot
donde el handoff pone "Editar" (pendiente) y la acción doble (pagada). Libera
~95px y el nombre entra entero. Además la acción queda más directa.

Implementación: `InlinePayButton` gana un prop `fullWidth` — mismo componente,
misma accesibilidad, mismo press-scale, no un botón nuevo. El handler llega al
panel expandido SOLO en `neo` (`onMarkPaid={bigCard ? onMarkPaid : undefined}`);
en `classic` sigue en la fila superior y no se duplica.

Medido en el DOM con la card expandida: la columna del nombre recibe **47,1px**
y "Netflix" a 19px/900 necesita **~75px**.

No es un problema de porteo. La fila superior del handoff es
`tile(52) + gap(13) + nombre + monto(21/900) + pill "$ Pagar"`. A los 393px del
mock, al nombre le quedan ~65px — **sigue sin entrar su propio ejemplo**. El
mock no lo muestra porque en HTML el texto desborda; en RN envuelve y parte.

Opciones (decisión del owner, no tomada):

1. **"Pagar" baja al CTA de ancho completo** cuando la card está expandida. El
   handoff ya establece ese slot ("Editar" en pendiente, acción doble en
   pagada), así que es consistente con su propio lenguaje. Libera ~95px.
   Requiere agregar la acción de pago al panel expandido, que hoy solo tiene
   editar/revertir.
2. **Bajar el nombre de 19/900** en la card expandida hasta que entre
   (~15-16px). Barato, pero pierde la jerarquía que el diseño busca.

Mientras se decide, la card expandida queda con el nombre a 2 líneas.

## `SwipeRow` recortaba el relieve de las filas

Síntoma reportado por el owner: expandida una categoría, los ítems "pierden el
sombreado" y se leen pegados, mientras la card de categoría sí muestra su
relieve.

Causa: `SwipeRow` envuelve su contenido en un contenedor con
`overflow:'hidden'` (`swipe-row.tsx`) para clipear los paneles de acción del
swipe. Ese clip **recorta el `boxShadow` del hijo**. La card de categoría no va
dentro de un `SwipeRow`, por eso era la única que se veía elevada.

Fix: en `neo` la superficie (fondo, gradiente, radio y sombra) sube a un
wrapper POR FUERA del `SwipeRow`; el `SwipeRow` sigue clipeando solo su
contenido y la card interna ya no emite sombra. Verificado midiendo: cero
ancestros con `overflow:hidden` sobre el nodo que lleva la sombra.

### Jerarquía padre/hijo

Antes, categoría e ítem tenían el MISMO fondo y la MISMA sombra (`8/8/18`), así
que la lista expandida se leía como una masa. Ahora son dos niveles del mismo
lenguaje:

| Nivel | Ancho | Raise |
| --- | --- | --- |
| Card de categoría (padre) | 335px | `8/8/18` |
| Fila de ítem (hijo) | 325px (sangría 10) | `5/5/12` |
| Fila de ítem EXPANDIDA | 325px | `8/8/18` — pasa a ser el foco |

Spacing: `gap` de ítems 6 → **12** (con relieve, 6px hacía que la sombra de una
fila se pisara con la de abajo), y entre categorías 16 → **20**.

## Ajustes del owner (2026-07-30, 3ª tanda)

**Ancho.** Los ítems van al MISMO ancho que la card de categoría (335px, sin
sangría). La jerarquía la comunican el raise más chico y el orden vertical, no
un escalón horizontal.

**Sombra del lado izquierdo.** El `5/5/12` del handoff calibra su término de
LUZ (arriba-izquierda) para tiles de 44-52px sobre el fondo de pantalla. Sobre
una fila de 335px apoyada en una card del mismo ancho, ese borde quedaba sin
definición y las filas se leían pegadas al padre. `nestedRowShadow` sube SOLO
la luz —`0.11 → 0.20` en oscuro, `0.92 → 0.98` en claro, y la lleva a `-5/-5`
para igualar la distancia de la sombra oscura—, así que la dirección del foco y
el peso de la sombra no cambian.

**Colapso por tab, con memoria.** `vencidos` abre (requiere acción),
`pendientes` y `pagados` cierran (son consulta). El colapso manual se guarda en
un mapa `${tab}:${categoryId}` que vive en `FijoCategoryGroups` —que NO se
desmonta al cambiar de tab—, así que al volver la categoría aparece como el
usuario la dejó. La llave incluye el tab a propósito: el mismo fijo puede estar
en dos tabs y "colapsé Vivienda en Pagados" no debería colapsarla en Vencidos.
Sin el prop `tab` (la pantalla viva) todo abre, como siempre.

**Animaciones.** `LinearTransition` y las de entrada/salida pasan a tokens
(`motionDurations.standard` / `.exitTab`, `motionEasings.enterSmooth` /
`.exitStandard`), y la bezier inline del chevron se reemplaza por
`motionEasings.enterSmooth` (es la misma curva, ahora nombrada).

> **Trampa verificada:** `FadeInUp`/`FadeOutUp` en este bloque ROMPE el layout.
> Reanimated deja el elemento saliente ocupando su posición mientras el padre
> —envuelto en `LinearTransition`— ya colapsó la altura, así que las categorías
> se montan una encima de otra y el orden se mezcla. El desplazamiento vertical
> tiene que venir de la layout transition del grupo, que es quien conoce las
> alturas nuevas; entrada y salida se quedan en fade puro.

## Acciones del detalle y auto-scroll (2026-07-30, 4ª tanda)

### Acciones por estado

| Estado | Acciones |
| --- | --- |
| `pending` / `overdue` | **Pagar** (CTA lleno) · **Editar** · **Eliminar fijo** |
| `paid` | **Revertir pago** · **Editar** · **Eliminar fijo** |

Jerarquía deliberada, en tres escalones: el CTA primario ocupa su propia fila
llena; Editar/Revertir van en la fila de acciones; **Eliminar queda aparte, sin
fill y en el rojo del sistema**. Es destructivo e irreversible (se lleva el
historial de pagos), así que no comparte prominencia con Editar ni queda a un
dedo del CTA de pago. Confirma con `Alert` antes de mutar, con el mismo copy y
el mismo manejo de errores que la pantalla viva.

`onDelete` llega al panel SOLO en `neo`: en `classic` eliminar vive en el swipe
y solo ahí, así que pasarlo duplicaría la acción.

Keys nuevas en los dos locales: `fijos:detailPanel.deleteFijo` / `.delete` /
`.deleteHint`.

### Auto-scroll al cambiar de tab

Al cambiar de tab, la sección "TODOS TUS FIJOS" sube al tope del área visible
(8px de aire). El ancla es el TÍTULO, no la primera fila, para que la sección
se lea desde su encabezado. Solo dispara en cambios por interacción, nunca en
el primer render: el controller elige el tab inicial por urgencia y sin ese
guard la pantalla abriría ya scrolleada, escondiendo el hero y los Avisos.

**Cómo se mide** (dos caminos más simples fallaron, verificado en el browser):

1. El `y` de `onLayout` **queda viejo**: corre al montar la sección, con el
   hero y los Avisos todavía en su altura de carga. Después llegan los datos,
   el contenido de arriba crece ~600px y la sección baja, pero `onLayout` no
   vuelve a disparar cuando lo único que cambia es la POSICIÓN. Medido: el
   valor cacheado quedaba en ~260 con la sección realmente en ~856.
2. `measureLayout` contra el ScrollView devuelve coordenadas relativas a su
   caja VISIBLE, no al contenido → con la lista scrolleada da un número que no
   sirve para `scrollTo`.

Lo que funciona: medir en PANTALLA los dos nodos (sección y ScrollView) con
`measure()` y scrollear por la diferencia, sumando el offset vivo que trae
`onScroll`. Restar el `pageY` del ScrollView en vez de asumir 0 lo hace
correcto aunque arriba haya safe-area o chrome.

Verificado: Pagados → Vencidos deja el título en `y = 8` exacto. Pagados tiene
un solo fijo, así que ahí el scroll queda clampeado al máximo del contenido
(`scrollTop === maxScroll === 252`): es el tope físico, no un bug.

## Panel expandido — transcripción literal del handoff (5ª tanda)

El panel estaba desalineado del diseño. Valores extraídos de las **4 variantes**
de `Detalle Fijo Manifiesto.dc.html` (pendiente/pagada × claro/oscuro):

| Elemento | Estaba | Handoff |
| --- | --- | --- |
| Bloque "SE LLEVA AL AÑO" — radio | 12 | **18** |
| — padding | L18/R14/V12 | **14 × 16** (+6 de sangría en los textos) |
| — barra de acento | 3px | **5px** |
| — anillo | ninguno | **`inset 0 0 0 1.5px`** del acento |
| Eyebrow del bloque | 10/800, ls 1.2 | **11/900, ls 1.54** |
| Cifra | 26/800, ls −0.6 | **30/900, ls −0.3** |
| Sub (% del sueldo) | 11/600 gris | **12.5/800 en el acento**, ícono 15 |
| Labels de sección | 9/800, ls 1.4 | **11/800, ls 1.76** |
| Fila de TENDENCIA | plana, sin fondo | **pozo inset r16, padding 11 × 14** |
| — título / sub | 13/700 · 11/500 | **14.5/900 · 12/800** |
| Info-lines | gap 8, pad 2, ícono 14 gris, 13/500 | **gap 11, pad 7, ícono 18 verde, 14/700** |
| CTA Editar | borde, r12, pv10 | **relleno tintado, r15, padding 13, 13.5/900** |
| CTA Revertir | relleno durazno | **OUTLINE `inset 0 0 0 1.5px`, sin relleno** |

Fondo y anillo del bloque, por variante (no es el mismo tinte que los chips —
más saturado en claro, más tenue en oscuro):

| Variante | fondo | anillo | barra |
| --- | --- | --- | --- |
| pendiente claro | `rgba(246,220,203,0.6)` | `rgba(194,91,51,0.2)` | `#C25B33` |
| pendiente oscuro | `rgba(240,164,126,0.1)` | `rgba(240,164,126,0.2)` | `#F0A47E` |
| pagada claro | `rgba(219,235,215,0.7)` | `rgba(46,116,52,0.18)` | `#2E7C39` |
| pagada oscuro | `rgba(164,227,166,0.09)` | `rgba(164,227,166,0.18)` | `#A4E3A6` |

`letterSpacing` va en px: el markup usa `em` (0.14em sobre 11px = 1.54;
0.16em = 1.76) y RN no acepta `em`.

## El auto-scroll NO debe correr al entrar

Corregido. No alcanzaba con "ignorar el primer render": el controller re-elige
el tab activo por urgencia cuando llegan los datos y cuando una tab se queda
sin ítems, así que `controller.tab` cambia SOLO por eso al abrir la pantalla —
y eso la dejaba ya scrolleada, escondiendo el hero y los Avisos.

La señal ahora es la **intención del usuario**, no el cambio de valor: el tap
en una tab levanta un flag y el efecto solo scrollea si el flag está puesto.
Los cambios automáticos del controller (líneas 235/239, que usan el `setTab`
crudo) no lo levantan, así que no disparan scroll.

Verificado: al entrar `scrollTop === 0` en 5 lecturas consecutivas; al tocar
una tab, el título aterriza en `y === 8`.

## Ajustes finales (6ª tanda)

**Estados de la tendencia — eran 2, son 3.** El bug: `FijoTrendSpark` devuelve
`null` cuando no hay variación de precio, pero el slot reservaba 70×30 igual →
hueco vacío al lado de un "Mantiene el precio" que afirmaba una comparación que
el gráfico no mostraba. Ahora `trendState(history, deltaPct)` distingue:

| Estado | Cuándo | Qué se muestra |
| --- | --- | --- |
| `no-comparison` | `history.length < 2` o sin delta | la sección TENDENCIA **no se renderiza** |
| `flat` | hay pagos previos, precio sin moverse | copy + "Sin cambios en N pagos", **sin slot de spark** |
| `up` / `down` | el precio se movió | copy con % + spark |

El slot solo existe cuando hay curva que dibujar. Keys nuevas:
`trendCopy.noComparison` / `.noComparisonSub` / `.noChangeOverPayments`.

**Ticker de Avisos — sentido invertido.** Iba de `-shiftWidth` a `0`, o sea los
chips entraban por la izquierda y salían por la derecha, al revés de cómo se lee
un ticker. Ahora va de `0` a `-shiftWidth` (derecha → izquierda). La lista
duplicada hace el loop igual de continuo en este sentido.

**Transición de altura al cambiar de tab.** `LinearTransition` gateada sobre el
contenedor de la lista: pasar de 8 fijos a 1 saltaba de golpe mientras Avisos
—que sí anima— se quedaba quieto, dos lenguajes de movimiento en la misma
pantalla. Gateada como el resto para que el primer attach no interpole (warp).

**Relieve en todos los CTA del detalle.** Editar, Revertir y Eliminar llevan el
mismo `raise` que el pill de Pagar, en los dos temas. Revertir lo combina con su
anillo del handoff en una sola prop (`inset … , raise`). Eliminar deja de ser
texto pelado y gana superficie propia.

**"+ Agregar fijo" eliminado** del header de la sección: el alta ya está a un
tap desde el botón de calendario del header y desde el FAB, así que era una
tercera puerta a lo mismo compitiendo con el título.

## Identificación de categoría — v2 (aprobada 2026-07-30)

Se probaron 3 variantes con datos reales y el owner eligió **card tintada**: el
sticker de la categoría a 124px sangrando por el borde derecho (opacidad 30%
claro / 34% oscuro) sobre una superficie del tono de la categoría, **sin tile
chico a la izquierda** — repetir el ícono al lado competía con el fondo.

### Paleta propia, no `categoryHues`

`categoryHues` está calibrada para badges de 32-52px; a tamaño de card grita.
Además tenía dos problemas que en 11 categorías se ven enseguida:

- **Se repetía**: `matchHueKeyByName` mapea `impuesto → servicios` y
  `cuidado personal → belleza`; en la base, **Salud y Seguros comparten
  `#4A7FB8`** e Inversiones no tiene color.
- **Chocaba con la semántica de estado**: rojo = vencido, verde de marca =
  pagado.

`mobile/components/fijos/fijos-category-palette.ts` define 11 familias con
**22° mínimo** de separación en la rueda, saturación pareja y baja (34% claro /
30% oscuro), sin rojo puro y con el verde reservado a Inversiones. `Otros` va
en neutro.

Las superficies claras están todas en **L=90.5%** —la misma luminosidad que el
`#E9EBE0` del kit— y las oscuras en **L=16.5%** como el `#1A2D21`. Deliberado:
las sombras neumórficas están calibradas contra esa luminosidad, así que tintar
la card no las desafina.

### Contraste

Los 22 pares (11 × 2 temas) verificados a **≥4.5:1** (AA de texto normal, más
estricto que el 3:1 que pediría el título de 19px/900). Medido después en el
DOM: 9.05 / 9.28 / 9.27 en oscuro; 8.76 / 5.76 / 6.93 en claro.

> **Trampa:** el conteo ("5 ítems") tenía `opacity: 0.78` para bajarle peso.
> `getComputedStyle().color` NO refleja la opacidad, así que medir el color
> daba un falso OK — el contraste COMPUESTO caía a **3.63:1** (Deporte en
> claro). Se sacó la opacidad; la jerarquía la dan el tamaño y el peso.

## Siguiente: alta de fijo (arrancado)

**El flujo NO hay que construirlo — ya existe y está cableado.**
`mobile/screens/home/add-fijo-v2-screen.tsx` (430 líneas) orquesta los 2 pasos
con `Step1Form` + `Step2Summary`, `useAddFijoForm`, el impact math, el
calendario de días y el encadenado create/update/record-payment: **2.294 líneas
en 9 archivos**. Falta solo la PIEL.

La estructura ya coincide con el handoff: categorías en grid de 4 columnas,
frecuencia en rail horizontal con máscara de fade, montos rápidos idénticos, y
el paso 2 con impacto/antes-ahora/calendario/recordatorio.

> El handoff dibuja **8 categorías y 5 frecuencias**; la app real tiene **11 y
> 7** (el mock no incluye Anual ni Cuotas). Misma limitación de mockup que las
> "3 categorías" de la pantalla principal. **No se recortan opciones reales**
> para parecerse al mock.

Ruta dev creada: `app/(app)/settings/dev/neo-add-fijo.tsx`, que monta la MISMA
pantalla envuelta en `FijosSkinProvider`. La ruta viva
(`add-fixed-expense`) no la envuelve, así que no puede cambiar por accidente —
el mismo mecanismo que protegió a la lista.

### Vocabulario del handoff (Paso 1), transcrito

| Elemento | Claro | Oscuro |
| --- | --- | --- |
| Label de sección | 11/800, ls 1.98, `#6C7B67` | `#93A78F` |
| Campo (nombre/monto) | r18, `#F4F5EE`, **INSET** `4/4/9` | r18, `#20372A`, inset `4/4/9 rgba(0,0,0,0.5)` |
| Chip de monto rápido | r13, 7×13, 12/800, `#C25B33` sobre `#E9EBE0`, raise `5/5/12` | `#F0A47E` sobre gradiente `145deg,#1D3426,#132318` |
| Tile de categoría | r16, pastel + raise `4/4/9 @0.32` | r16, `rgba(255,255,255,0.06)` + raise `4/4/9 @0.45` |
| Tile SELECCIONADO | **hundido**: inset `2/2/6` + anillo `2.5px #2E7C39` | inset `2/2/6` + anillo `2.5px #A4E3A6` |
| Chip de frecuencia activo | r15, 9×15, 12.5/800, `#24382A`/`#F5F2E1` | `#F1EEDD`/`#16271C` |
| CTA Continuar | r20, pad 16, 16/900, gradiente `180deg,#6DBC71,#327E39` | `180deg,#7ED083,#35793E` |

Notar que el tile seleccionado va **hundido con anillo**, no relleno — es el
mismo recurso de "presionado" del neumorfismo, no un fill de selección.

## Riesgos conocidos

- **`boxShadow` en Android viejo.** RN 0.81 lo descarta en silencio (outset
  < API 28, inset < API 29), así que el neumorfismo se aplana en el piso
  Android. Es un problema que el rediseño YA tiene app-wide, no lo introduce
  esta migración; se hereda tal cual y se resuelve aparte (`neoDepth`
  version-aware).
- **Mezcla de idiomas en la vista neo.** `neo-fijos-screen.tsx` es
  `@i18n-ignore-file` (español hardcodeado) mientras los componentes reusados
  van por i18n. En un browser con locale EN se ve "Subscriptions" / "July" /
  "Pay" al lado de "TODOS TUS FIJOS". En el teléfono del owner (ES) no pasa.
  No se toca acá: es del swap, no de la piel.
