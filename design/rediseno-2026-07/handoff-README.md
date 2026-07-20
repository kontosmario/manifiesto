# Handoff: Rediseño Manifiesto — App móvil neumórfica

## Overview
Rediseño visual completo de **Manifiesto** ("Finanzas para tu hogar"), app de finanzas del hogar en español (AR). El rediseño aplica **neumorfismo** como lenguaje visual en dos temas (claro "Salvia" y oscuro "Noche de bosque"), preserva la paleta de marca, mantiene el logo oficial (brote de 2 hojas) e introduce a **Brot**, la mascota/asistente animada en canvas, como acompañante en toda la app y cuidador del jardín de rachas.

Cubre: onboarding/login completo (2 versiones: original y "fácil" secuencial), Inicio, Cargar (modal + gasto + ingreso + fijo), Gastos, Fijos, Control, Mi jardín + cierre de semana, Ediciones y Notificaciones (con empty state).

## About the Design Files
Los archivos de este bundle son **referencias de diseño creadas en HTML** — prototipos que muestran el look & feel y el comportamiento esperado, NO código de producción para copiar directo. La tarea es **recrear estas pantallas en el entorno del codebase destino** (React Native, Flutter, SwiftUI/Compose, etc.) usando sus patrones y librerías. Si aún no existe el entorno, elegir el framework más apropiado para una app móvil multiplataforma e implementar allí.

Dos piezas SÍ son portables casi 1:1 porque son lógica de dibujo en `<canvas>` (JS vanilla, sin dependencias):
- `brot.js` — mascota Brot (web component `<brot-mascot>`)
- `particles.js` — partículas flotantes (web component `<brot-particles>`)
Ambas se pueden portar a cualquier vista con canvas (React Native Skia, Flutter CustomPainter, etc.) siguiendo el pseudocódigo de dibujo tal cual.

## Fidelity
**High-fidelity (hifi).** Colores, tipografía, espaciados, sombras y copys son finales. Recrear pixel-perfect con el sistema del codebase. Los mockups están a 393px de ancho (iPhone 15/16). Todos los montos, fechas y textos que se ven son contenido real de ejemplo — respetarlos en los estados demo/preview.

## Design Tokens

### Tipografía
- Familia: **Nunito** (Google Fonts), pesos 400/600/700/800/900. Bold redondeada = voz de la marca.
- Números protagonistas: 900, letter-spacing −0.02em (ej. saldo 41–45px).
- Títulos de pantalla: 30–34px/900. Section labels: 11–11.5px/800, letter-spacing 0.14–0.22em, MAYÚSCULAS.
- Body: 12.5–15px/700–800. Mínimo usado: 9.5px (sólo micro-labels).

### Tema claro "Salvia"
- Fondo base: `#E9EBE0` · sheets de modal: `#F0EFE3` / `#EDECDF` (scrim detrás: `#B9BEAC`)
- Texto: primario `#24382A`, secundario `#6C7B67`, terciario `#9AA694`, apagado `#8FA089`
- Verde marca: `#2E7C39` (accion/positivo), profundo `#1F5429`, links "ver todos"
- Naranja/durazno: `#C96F3F` / `#D97E4F` (alertas, badge), rojo excedido `#C25B33`
- **Sombras raised**: `8px 8px 18px rgba(151,160,136,0.42), -8px -8px 18px rgba(255,255,255,0.92)` (variantes 5/6/10/12px proporcionales)
- **Sombras inset (hundido)**: `inset 4px 4px 9px rgba(151,160,136,0.4), inset -4px -4px 9px rgba(255,255,255,0.95)` (variantes 2/3px)
- Gradiente raised suave: `linear-gradient(145deg, #F0F2E7, #E1E4D6)` o `(#F3F4E9, #E4E6D8)`
- **Hero verde**: `linear-gradient(155deg, #337B39 0%, #4C9A52 55%, #5FAC64 100%)` + sombra `12px 12px 26px rgba(124,138,110,0.55), -8px -8px 20px rgba(255,255,255,0.85), inset 0 1px 0 rgba(255,255,255,0.25)`; texto sobre hero: crema `#F7F4E4`, secundario `rgba(240,248,230,0.75-0.85)`, verde claro `#C9F3C6`, durazno `#FBD9BC`
- **CTA primario**: `radial-gradient(circle at 32% 28%, #63B168, #2E7434 85%)`, texto `#F5F2E1`, sombra `0 12px 24px rgba(46,116,52,0.4), inset 0 2px 3px rgba(255,255,255,0.3)`
- CTA oscuro alternativo (paso final onboarding): `radial-gradient(circle at 32% 28%, #3A5A44, #1D3023 85%)`
- Botón secundario: hundido (inset) con texto `#3E5A44`

### Tema oscuro "Noche de bosque"
- Fondo base: `#16271C` · login/bienvenida: `#0F1E14` · sheets: `#1B2F22` / `#192B1E` (scrim `#0A130D`)
- Pozos hundidos: `#142519`
- Texto: primario `#F1EEDD`, secundario `#93A78F`, terciario `#7C917A`, labels hero `#9FB89C`
- Verde brillante: `#A4E3A6` (equivale a `#2E7C39` claro; con glow `0 0 … rgba(164,227,166,…)` en números clave)
- Durazno: `#F2A87E`
- **Sombras raised**: `8px 8px 18px rgba(0,0,0,0.5), -8px -8px 18px rgba(101,152,113,0.1)` sobre gradiente `linear-gradient(145deg, #1D3426, #132318)` (o `#21382A→#16281C`)
- **Sombras inset**: `inset 4px 4px 9px rgba(0,0,0,0.5), inset -4px -4px 9px rgba(101,152,113,0.08)` sobre `#142519`
- **Hero verde noche**: `linear-gradient(150deg, #234931 0%, #1B3A26 55%, #16301F 100%)` + `inset 0 1px 0 rgba(164,227,166,0.12)`
- **CTA primario**: `radial-gradient(circle at 32% 28%, #9FDC9F, #3E7D46 85%)`, texto `#0F1E14`, glow `0 0 26px rgba(140,225,150,0.3)`
- CTA crema (login/bienvenida): `linear-gradient(145deg, #F7F4E6, #E2DEC8)`, texto `#1F3A26`
- Selección de tiles: anillo `0 0 0 2.5px #A4E3A6` + fondo `rgba(164,227,166,0.15)`

### Pasteles de categorías (claro → oscuro)
En oscuro, cada pastel se vuelve translúcido: `rgba(<pastel>, 0.13-0.16)`.
- Mercado mint `#E2EDD2` · Transferencia pink `#F6D9D2` · Ropa sand `#EDE6D4` · Mascotas aqua `#D4EBDF` · Comida peach `#F7E3CF` · Ocio lavender `#E6E0F4` · Hogar sage `#DDEBDD` · Salud rose `#F5D8DD` · Servicios/Impuestos `#F2ECC9` · Cuotas blue `#D6E4F0` · Vivienda tan `#EDE0C8` · Suscripciones `#F6D9E8`
- Iconos de categoría = **emoji** en tile pastel radius 18px (vocabulario original de la app)

### Radios y capas
- Pantalla/phone: 46px · Hero cards: 32px · Cards: 24–28px · Tiles: 18px · Chips/píldoras: 14–22px · Inputs: 18px · Nav: 32px
- Calendarios: celdas 40–44px, radius 13–14px

### Estados de calendario (Gastos)
- Bien: `#DCEBD8` texto `#3E6B44` (oscuro: `rgba(164,227,166,0.16)` texto `#B5DDB4`)
- Exceso: `#F3C9BC` texto `#A84A2F` 900 (oscuro: `rgba(217,115,85,0.24)` texto `#F2A87E`)
- Hoy: sólido `#24382A` texto crema + dot verde (oscuro: `#F1EEDD` texto `#16271C` + glow)
- Futuro: hundido inset, texto `#B3BCA8` / `#5F7361`

## Brot — la mascota (brot.js)
Web component `<brot-mascot pose size animated shadow>`; canvas con supersampling 3–4x (SIEMPRE ≥3x dpr o se pixela). Anatomía: cuerpo huevo `#A9CB80`→`#9CC172`, contorno `#4E7A44` 2.4px, tallo con 2 hojas (`#8FBE72` izq, `#6FA35C` der), cara `#3D5B36`, rubor `rgba(224,138,110,0.38)`, doble brillo blanco arriba-izquierda.

**18 poses**: `idle` (parpadea, brazos oscilan), `wave` (saluda), `cheer` (rebote + boca abierta + rubor + hojas erguidas), `coach` (brazo levantado explicando), `sleep` (ojos cerrados + zzz), `peek` (sólo cabeza + manitos, para asomarse a cards), `laugh`, `love` (ojos corazón `#E0705F` + corazones flotando), `wow` (ojos abiertos + "!"), `worried` (cejas + gota `#A8CFEA`), `sad`, `dizzy` (ojos X + tambaleo), `shy` (rubor fuerte + brazos al frente), `think` (mirada arriba + "…"), `zen` (flota + ojos cerrados), `magic` (chispas `#E8C46E`/`#7FB069`), `seed` (semilla `#DCC58F` con carita y brotecito), `wilted` (marchito: paleta apagada `#B7C4A0`/`#7A8669`, hojas caídas).

Animación base en TODAS las poses: respiración (squash 1.6% @1.9rad/s), parpadeo cada ~3.7s, hojas oscilan ±0.05rad. Cada instancia arranca con fase random.

**Dónde aparece Brot** (regla: protagonista en momentos emocionales, sub-protagonista en informativos):
- Bienvenida: `wave` + burbuja "¡Hola! Soy Brot. Tu asistente y el cuidador de tu jardín." (logo de marca SIEMPRE arriba, Brot abajo — nunca reemplaza al logo)
- Inicio: `peek` asomado al borde superior del hero de saldo
- Gastos: `idle` chico en el badge del header (con contador)
- Fijos: `worried` junto a "Avisos de aumento"
- Control: `coach` con burbuja "Saldo holgado…" + `love` en la card de mover sobrante a meta
- Jardín: `wave` en header; grid de días = mini-Brots `idle` (crecido) / `wilted` (perdido) / `seed` (hoy pendiente), 32px, `animated="false"` en grids
- Cierre de semana: `cheer` 150px protagonista + 7 mini idle
- Ediciones: `zen` al pie ("Cada ciclo cerrado queda en paz.")
- Notificaciones: `idle` en header; `seed` como icono de "Tu jardín te espera"; empty state `zen` en pedestal
- Onboarding: `coach`/`think`/`cheer` según paso; en "¡Listo!" celebra chico al costado del avatar elegido (avatar = protagonista)
- Formularios con error: `think` + texto durazno explicando qué falta

## Partículas (particles.js) — CORE del producto
Web component `<brot-particles colors="#a,#b,#c" count="N">`, canvas absoluto que llena su contenedor, `pointer-events:none`. Cada partícula: radio 1.2–3.4px, deriva ascendente lenta (0.006–0.018 vh/s, wrap vertical), sway horizontal sutil, alpha titilante 0.25–0.8 sinusoidal + halo 2.6x al 25% alpha.
- Login/bienvenida claro: colores `#7FB069,#E8A87C,#9BB894`, count 18
- Login/bienvenida oscuro y celebraciones oscuras: `#A4E3A6,#F2A87E,#F1EEDD`, count 18–22
- Heros verdes (Inicio/Gastos/Fijos/Control/Jardín, ambos temas): `#C9F3C6,#FBD9BC,#EFF6E2`, count 10, clipeado al radius 32px del hero
- Cierre de semana claro: `#C9F3C6,#FBD9BC,#EFF6E2`, count 22

## Screens / Views
El archivo `Manifiesto Rediseño.dc.html` es un canvas con todos los mockups agrupados por turno (badges con ancla). Índice completo:

### Turno 6 — Notificaciones
- **7a/7ao** Lista: header back + título + Brot idle; chip hundido "9 pendientes" (dot durazno) + link "Marcar todas"; cards raised con icono pastel por tipo (🔥 resumen matutino, 🌙 cierre del día, ☀️ medio día, Brot-seed jardín), título 14.5/900 + timestamp 11/800 + body 12.5/700; check circular hundido 36px por ítem (✓ verde); una card mostrada semi-deslizada revelando acción **swipe "Listo"** (fondo radial verde CTA, en oscuro con texto `#0F1E14`); la más vieja al 72% opacity (leída).
- **7b/7bo** Empty state: pedestal circular 170px (raised) con pozo hundido 136px y Brot `zen` flotando; "Todo en calma" 22/900; copy "No tenés avisos pendientes. Brot te avisa cuando haya algo del hogar."; chip hundido "Al día · 0 pendientes" con dot verde.

### Turno 5 — Onboarding fácil (claro 5a–5f + oscuro 5ao–5fo)
Flujo secuencial de 4 pasos con barra de progreso (4 segmentos, activo sólido / resto hundido) y back circular:
- **5a** Tu hogar: nombre del espacio (input hundido con sugerencias chip), miembros 1/2 (tiles), CTA "Siguiente".
- **5b** Tu identidad: nombre + avatar animal en grid 4×2 (medallón pastel; seleccionado con anillo verde), preview grande arriba.
- **5c** Tipo de sueldo (SECUENCIAL — primero esto): 2 cards grandes "Mensual fijo" 📅 vs "Variable / freelance" 💻; al elegir se revela lo siguiente.
- **5d…5d5** Ingresos según caso (los 5 casos):
  - Mensual → monto (display grande $ tap-to-edit + chips rápidos) → **ciclo de cobro**: Mensual / Quincenal / Semanal / **Custom** (stepper numérico "cada N días", 1–N) → **día de cobro con calendario de 31 días completos** (día seleccionado en CTA verde, caption "Tu ciclo empieza el día N de cada mes").
  - Variable → promedio mensual estimado + mismo bloque de ciclo/calendario (5d4/5d5).
- **5e** Fijos rápidos (opcional): sugeridos de un toque (Alquiler, Expensas, Internet…) con montos editables.
- **5e2** Meta (opcional): sugeridas de un toque (🎯 fondo de emergencia, 🏖️ vacaciones, etc.) con cuota calculada; **salida visible**: botón secundario hundido full-width "Empezar sin meta" + caption "Sin culpa — la creas cuando quieras desde Control." (NUNCA link chiquito escondido; no existe "No estoy seguro").
- **5f** ¡Listo!: chip "Ya estás en Manifiesto", pedestal circular grande con medallón del avatar elegido (protagonista) + Brot `cheer` chico asomado al borde (sub-protagonista), línea "Marcos · Guacamayo", resumen SOLO LECTURA en filas (hogar, sueldo, ciclo, fijos, meta) — sin botones "Editar" (copy: "Todo se ajusta después desde Ajustes"), CTA "Crear meta y empezar" / "Ir a mi Inicio".

### Turno 4 — Login + alta (claro 4a–4m + oscuro 4ao–4mo)
- **4a** Bienvenida: logo oficial grande (light/dark según tema), "Manifiesto." (punto durazno) + tagline, partículas full-screen, CTA "Empezar ›" + secundario hundido "Ya tengo cuenta" + legal 2 líneas.
- **4b** Login "Hola de vuelta": email/contraseña hundidos, CTA verde "Entrar", divisor "o", **fila con 2 providers visibles: Apple + Google** (pills lado a lado, nunca ocultos), link "Olvidé mi contraseña".
- **4c–4e** Alta: email → código 6 dígitos (cajas hundidas, la activa con anillo) → contraseña con checklist.
- **4f–4l**: nombre de hogar, miembros, avatar (grid), moneda, primer fijo, primera meta, **4l "Todo listo"**: pedestal circular con medallón avatar 🦜 protagonista + Brot `cheer` sub-protagonista abajo-derecha.
- **4m** Plan del hogar (paywall): toggle Mensual/Anual, precio grande, features con checks, **Brot `love` junto al headline "Todo tu hogar, en una cuenta."** y **Brot `coach` con burbuja "Con el anual ahorras $19.89 · −33%"**, fila de 7 tiles de metas 42px, CTA + "Quizás después".

### Turno 3 — Los 8 flujos core (claro + oscuro cada uno)
- **3a Bienvenida** (= 4a).
- **3b Inicio** (ver 1b/1c abajo, versión final con Brot peek en canvas).
- **3c Cargar**: modal sheet "¿Qué cargas?" sobre scrim borroso — fila protagonista "+ Gasto" (CTA verde grande) + 4 filas (Importar captura 📸, Día sin gasto 🌿, Ingreso 📈, Gasto fijo 🗓️); sheet "Agregar gasto" (monto $12.500 con caret, chips +$5k…+$100k, grid 4×2 categorías con seleccionada anillada, descripción, nota opcional, CTA); "Agregar ingreso" (fuentes 4×2, chips sugeridos de descripción, ¿Cuándo? Hoy/Ayer/Anteayer, CTA); "Nuevo fijo" paso 1/2 (progreso 2 segmentos, nombre, monto $0 gris, categorías, frecuencia 5 tiles, **CTA deshabilitado hundido "Completa los datos"** + Brot `think` con "Falta nombre, monto y categoría para continuar.").
- **3d Gastos**: hero verde (total $3.008.920, chip movs, promedio/día con mini bar chart 7 barras, top 3 categorías con barras de progreso claras), card "TU MES EN UN VISTAZO" (leyenda bien/alerta/exceso, calendario del ciclo 20jun→19jul con estados, hoy destacado, 28 con brotecito 🌱, futuros hundidos), chips de filtro por categoría (activo CTA verde).
- **3e Fijos**: hero verde con rango del ciclo + badge "1 VENCIDO", **timeline JUN 20 ─ HOY·DÍA 18 ─ JUL 19** (línea punteada, recorrido sólido, perilla brillante), "Ya pagaste $1.227.651 · 13" vs "Te falta $122.831 · 3", 16 píldoras de progreso (13 verdes, 2 tenues, 1 durazno), "91% pagado · Total $1.350.482", divisor dashed, "DINERO LIBRE $5.049.518" + "21% va a fijos"; card "POR PAGAR · ESTE MES" con chips [HOY sólido] Cochera $110.000 [EN 28D]…; "AVISOS DE AUMENTO" + Brot `worried` (Expensas +37% · $284.400 → $389.580 ✓, etc.); tabs Vencidos(1)/Pendientes(2)/Pagados(13); fila acordeón "Vivienda · 1 ítem vencido · $110.000".
- **3f Control**: header + score circular "65 PTS"; hero "HOY · MARTES 7 / **Vas adelantado.** / LIBRE HOY $179.208" + 4 stats (RACHA 1d | VS MES −32% | SIN GASTOS 🌱1 | AL COBRO 13d); **Brot `coach` 104px + burbuja** con chip ✓ "Saldo holgado" + "El presupuesto alcanza todo el mes — con margen de sobra." + ⓘ $6,5M confirmados; card "HASTA CUÁNDO TE ALCANZA" (RITMO $124k/día | CUPO $179k/día | SOBRANTE +$837k, slider INICIO—HOY—PRÓX. SUELDO con perilla neumórfica); card Brot `love` + "Sobra $837k. ¿Movemos una parte a tu meta?" + CTA "Mover a ahorro".
- **3g Mi jardín**: header con Brot `wave`; hero verde RACHA ACTIVA **1** + JARDÍN 51 | RÉCORD 28 | SEMILLAS ×0; card "Semana perfecta · 7/7" con Brot `cheer` + CTA "Ver cierre ›"; **grid 5 semanas de mini-Brots** (idle/wilted/seed, hoy con anillo dashed durazno, futuros pozos vacíos); explicación al pie. **Cierre de semana**: pantalla full verde (gradiente + partículas), "CIERRE DE SEMANA / Tu jardín floreció." + chip "Semana perfecta · 7 de 7 días", Brot `cheer` 150px, fila 7 mini-Brots L→D, CTA crema "Seguir cultivando".
- **3h Ediciones**: intro "Cada ciclo cerrado es una edición…", card acumulado "$1.588.087 en 2 ediciones", filas Mayo 2026 (dot durazno, −$1.588.087 EXCEDIDO) / Abril 2026 (dot verde, +$1.727.195 MARGEN), Brot `zen` al pie.

### Turnos 1–2 (referencia histórica)
- **1a/1b/1c**: exploración de intensidad del Inicio (elegidos: 1b=claro híbrido, 1c=oscuro).
- **2a**: ficha de los 18 emotes de Brot en ambos temas. **2b**: Brot en contexto.

### Nav inferior (todas las pantallas core)
Barra flotante raised radius 32px: Inicio · Gastos · [FAB + 62px circular CTA verde, elevado −26px] · Fijos · Control. Tab activo = pill hundida con icono+label verdes; inactivos texto secundario. Iconos stroke 2.2–2.3px round.

### Status bar
9:41 + señal + batería dibujadas (siempre del color del texto primario del tema). Home indicator 132×5px al pie.

## Interactions & Behavior
- **Tap monto** → teclado numérico inline (display con caret verde parpadeante)
- **Chips +$5k/+$15k/…** suman al monto actual
- **Tiles de categoría/fuente/avatar**: selección única, anillo verde + fondo tinted; el resto raised
- **CTA deshabilitado**: hundido (inset) texto gris; se activa (radial verde) cuando el form valida; mensaje de falta con Brot `think`
- **Swipe izquierda en notificación** → revela "Listo" verde y marca como leída; check por ítem hace lo mismo con tap
- **Onboarding**: revelado progresivo (elegir tipo de sueldo revela monto → ciclo → calendario); back circular arriba-izquierda; progreso por segmentos
- **Calendario de ciclo custom**: stepper 1–N días
- **Cierre de semana**: aparece al completar 7/7; partículas + Brot cheer en loop
- **Jardín**: tap en día filtra/muestra detalle; "día sin gasto" siembra brote
- Transiciones sugeridas: sheets suben con spring suave (~350ms), partículas y Brot en requestAnimationFrame continuo, rebote de cheer ~3.1 rad/s

## State Management (mínimo demo)
- Tema claro/oscuro (toggle del sistema)
- Onboarding: paso actual, tipo de sueldo, monto, ciclo {tipo, N, díaInicio}, fijos[], meta?, hogar {nombre, miembros[], avatar}
- Ciclo activo: rango fechas, día actual, saldo, gastos[], fijos[] con estado pagado/pendiente/vencido
- Jardín: días registrados (brote/marchito/semilla), racha, récord, semillas
- Notificaciones: lista con leída/pendiente

## Assets
- `brot/logo-light.png` / `brot/logo-dark.png` — logo oficial recortado con transparencia (usar el del tema)
- `brot.js` — mascota canvas (portar el dibujo tal cual)
- `particles.js` — partículas canvas (portar tal cual)
- Emojis del sistema como iconos de categoría (decisión de producto)
- Iconos UI: SVG stroke inline (home, docs, card, chart, campana, sparkle, sliders, chevrons, check) — stroke 2.2–2.8, linecap round
- `Manifiesto Rediseño.dc.html` — todos los mockups (abrir en browser)

## Files
- `Manifiesto Rediseño.dc.html` — canvas completo de diseño (todas las pantallas, ambos temas)
- `brot.js`, `particles.js` — componentes canvas reutilizables
- `brot/` — logos + recortes de la mascota original de referencia
- `notes/contenido-app.md` — spec de contenido literal de la app actual (fuente de todos los copys)
