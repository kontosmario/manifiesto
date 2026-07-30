# Handoff · Sección FIJOS — Manifiesto

Paquete para desarrollo de la sección **Fijos** completa: pantalla principal, flujo de alta y detalle del ítem, en claro + oscuro, con todos los estados del hero y del componente Avisos.

## Archivos

| Archivo | Qué es |
|---|---|
| `Fijos Manifiesto.dc.html` | **Fuente de verdad** de la vista Fijos. Teléfono claro + oscuro, más dos canvases de estados: **Hero (E1–E8)** y **componente Avisos (A1–A6)**. Abre directo en browser. |
| `Agregar Fijo Manifiesto.dc.html` | Flujo de alta en **2 pasos sin scroll** (Paso 1 datos · Paso 2 impacto/confirmación) + tarjeta "después de agregar", claro y oscuro. |
| `Detalle Fijo Manifiesto.dc.html` | Detalle expandido del ítem con tabs de estado (Vencidos/Pendientes/Pagados) — casos **Pendiente** y **Pagada**, claro y oscuro. |
| `brot.js` | Web component `<brot-mascot>`. Poses usadas en Fijos: `wave`, `worried`, `sad`, `think`, `cool` (gafas), + resto del set. |
| `particles.js` | Web component `<brot-particles>` — partículas del hero. |
| `support.js` | Runtime para abrir los `.dc.html`. No se programa contra él. |

## Tokens (idénticos al resto del sistema — Home / Gastos)

### Tema claro
- Material base `#E9EBE0` · texto `#24382A` · secundario `#6C7B67` · apagado `#9AA694` · medio `#3E5A44` · verde acción `#2E7C39`
- Raise: `8px 8px 18px rgba(151,160,136,0.42), -8px -8px 18px rgba(255,255,255,0.92)`
- Inset: `inset 4px 4px 9px rgba(151,160,136,0.4), inset -4px -4px 9px rgba(255,255,255,0.95)`
- Pozo del ticker: fondo `#E1E3D6` + inset `inset 5px 5px 12px rgba(151,160,136,0.55), inset -5px -5px 12px rgba(255,255,255,0.95)`

### Tema oscuro
- Fondo `#16271C` · cards `linear-gradient(145deg,#1D3426,#132318)` · pozos `#142519` / ticker `#0F1C13` · nav pill `#142519`
- Texto `#F1EEDD` · secundario `#93A78F` · apagado `#7C917A` · medio `#B9CCB2` · verde `#A4E3A6` (glow `rgba(140,225,150,…)`)
- Raise: `8px 8px 18px rgba(0,0,0,0.55), -8px -8px 18px rgba(101,152,113,0.1)`
- Inset: `inset 4px 4px 9px rgba(0,0,0,0.5), inset -4px -4px 9px rgba(101,152,113,0.1)`

### Semántica de estado (ambos temas)
- **Vencido / urgente**: durazno `#C25B33`/`#D97355`; card en alerta lleva anillo `0 0 0 2px #D97355`; tag VENCIDO fondo `#F3C9BC` (claro) / `rgba(217,115,85,0.24)` (oscuro).
- **Hoy**: pill sólida — claro texto `#F5F2E1` sobre `#24382A`; oscuro texto `#16271C` sobre `#F1EEDD`.
- **Próximo / al día**: verde `#DCEBD8`/`#3E6B44` (claro), `rgba(164,227,166,0.16)`/`#B5DDB4` (oscuro).
- Fuente **Nunito** 400–900. Hero forest `linear-gradient(155deg,#2E6B33,#3F8746 55%,#57A05C)`, pozo del total `rgba(13,34,18,0.30)` + inset profundo, partículas `#C9F3C6,#FBD9BC,#EFF6E2`.
- Radios: teléfono 46 · hero 32 · cards 28 · filas/tiles 22/16 · chips 15–18. FAB N1: disco `linear-gradient(145deg,#6DBC71,#327E39)` + pozo interno (invertido en dark: disco crema, "+" verde).

## Estructura de la pantalla (orden vertical)

1. **Header** — "Fijos" + trigger de ciclo `● Ciclo 20 jun → 19 jul · día 18 ▾` + Brot con badge `🌱 1` (acceso a Jardín).
2. **Hero "Te falta pagar"** — número accionable **$122.831** en el pozo, chip `3 DE 16 · 1 VENCIDO`, "Ya pagaste $1.227.651 · 13 ✓", **línea de ciclo con perilla HOY · DÍA 18**, 16 segmentos de progreso (91% pagado), y hairline "Proyección de cierre en Control ›". "Dinero libre" vive en Control, no acá.
3. **Componente Avisos** (fusión de *próximos vencimientos* + *aumentos*):
   - **POR PAGAR · ESTE MES** — ticker horizontal animado (chips con dot de urgencia + nombre + monto + tag). Punto "live" pulsante.
   - **AUMENTOS Y RECORDATORIOS** — filas con ícono de tendencia (`Expensas +37% · $284.400 → $389.580`) + fila-resumen de calendario.
   - Contador en el pill del título; **Brot reacciona** al peor estado (worried / sad / think / cheer / wave).
4. **Todos tus fijos** — tabs `Vencidos·1 / Pendientes·2 / Pagados·13` + categorías (Vivienda, Suscripciones, Servicios) con "+ Agregar fijo".
5. **Nav** — Fijos activo (pastilla hundida) + FAB N1.

## Estados del HERO (canvas E1–E8)

- **E1 · Al día** — celebración estilo estado-vacío: Brot `cool` centrado, badge `✓ 16 DE 16 · SIN VENCIDOS`, titular **"Cero pendientes"**, bajada "A disfrutar lo que queda del mes", barra 100% de pagos completos y bloque **TE QUEDA DISPONIBLE $5.049.518**.
- **E2 · En curso** — el default ($122.831, 91%, 1 vencida).
- **E3 · Sin vencidas** — todo al día pero aún quedan próximos (sin anillo de alerta).
- **E4 · Arranque de ciclo** — recién abierto, 0% pagado, todo por pagar.
- **E5 · Disponible ajustado** — fijos comen alto % del sueldo (aviso naranja en "va a fijos").
- **E6 · Sin fijos (nuevo)** — estado vacío usuario nuevo + "Agregar tu primer fijo".
- **E7 · Cerrado** — ciclo pasado, solo lectura.
- **E8 · Fuera de ciclo** — pagos que quedaron fuera, van al próximo.

## Estados del componente AVISOS (canvas A1–A6)

- **A1 · Con avisos** (actual) — ticker + aumentos + recordatorio · Brot `worried`.
- **A2 · Sin aumentos** — ticker + "✓ Sin cambios de precio este mes" · `think`.
- **A3 · Nada por pagar** — "✓ Nada vence en los próximos días" + aumentos · `think`.
- **A4 · Todo tranquilo** — sin avisos, mensaje feliz · `cheer`.
- **A5 · Urgente** — varios VENCIDO, card con anillo durazno, resumen "3 fijos ya vencieron" · `sad`, pill del contador en rojo.
- **A6 · Sin fijos (nuevo)** — estado vacío + "Agregar tu primer fijo" · `wave`.

## Flujo Agregar fijo (2 pasos, sin scroll)

- **Paso 1 — Datos**: nombre, monto (con montos rápidos), categoría (con sugerencia por nombre), fila de **Frecuencia** (Mensual/Quincenal/Semanal/Trimestral/Semestral — scroll horizontal con fade), día de cobro. CTA primario abajo, fijado (`margin-top:auto`).
- **Paso 2 — Impacto**: preview del ítem (`Netflix · Suscripciones · Mensual · $12.900`), impacto sobre el disponible y sobre el % del sueldo, confirmación.
- **Después de agregar**: tarjeta de éxito con el nuevo fijo integrado al total.
- Regla: cada paso **entra completo en una pantalla de 393×924**, sin scroll vertical.

## Detalle del fijo (expandido)

- **Tabs de estado** compactos: Vencidos / Pendientes / Pagados (padding 8×11, gap 6, pill de conteo).
- Encabezado de categoría (ícono + nombre) colapsable.
- Tarjeta expandida: "se lleva al año" (proyección anual), **tendencia** de últimos pagos, secciones **ESTE PAGO** e **HISTORIAL**.
- **Pendiente**: CTA único "Editar". **Pagada**: acciones dobles (p. ej. deshacer pago / editar).

## Animaciones

- `@keyframes fijosTicker` — desplazamiento horizontal continuo del ticker de "POR PAGAR" (`30s linear infinite`, lista duplicada + máscara de fade en los bordes).
- `@keyframes fijosLive` — el punto "live" del ticker pulsa (opacity + scale, `1.6s`).
- Al portar: respetar `prefers-reduced-motion` (pausar ticker y pulso).

## Notas de producción

- Estilos inline en los `.dc.html` — portar a los tokens/componentes del design system.
- Montos es-AR (`$122.831`), semana empieza en **L**, ciclo configurable (20→19); la línea de progreso se calcula sobre el ciclo, no el mes calendario.
- El ticker duplica la lista para loop sin costura; el ancho es `max-content` y la máscara (`mask-image: linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent)`) da el fade de bordes.
- Brot y partículas son web components listos (`<brot-mascot pose size shadow>`, `<brot-particles colors count>`); copiar tal cual. La pose `cool` dibuja las gafas en canvas (no requiere assets).
- Los canvases de estados (E1–E8, A1–A6) están en tema claro; el oscuro usa el mapeo de tokens de arriba (ver los dos teléfonos claro/oscuro de la vista principal como referencia 1:1).
