# Handoff: Animaciones de arranque — Manifiesto

Dos animaciones core del producto, en un solo paquete:

1. **Cold start** (`coldstart.js`) — splash de apertura: el logo brota con overshoot sobre partículas, aparece el wordmark y el splash se disuelve en la Bienvenida. Logo y wordmark quedan pixel-alineados con la Bienvenida para que se sienta una única transición.
2. **Bridge auth → Inicio** (`authbridge2.js`) — puente post-autenticación: mismo pop de logo del cold start dentro de un cuenco neumórfico hundido, "Hola, {nombre}" y barra de progreso. Estados `success` y `fail`.

Referencia visual: abrir `demo.html` (4 teléfonos: cold start claro/oscuro + bridge success/fail; los bridges alternan tema). Loop ~6.2s/6.8s.

## Files
- `demo.html` — demo standalone de ambas animaciones
- `coldstart.js` — web component `<cold-start>` (vanilla JS, sin dependencias)
- `authbridge2.js` — web component `<auth-bridge-logo>` (vanilla JS, sin dependencias)
- `particles.js` — `<brot-particles>` para la pantalla que queda debajo del splash
- `logo-light.png` / `logo-dark.png` — logo oficial con transparencia (usar según tema)

Son referencias de diseño en HTML/canvas: portar la lógica al stack destino (React Native Skia / Flutter / SwiftUI-Compose). La lógica de dibujo y timing se traduce 1:1.

## 1 · Cold start — timeline (demo 6.2s; en producción una sola vez)
| t | Qué pasa | Easing |
|---|---|---|
| 0.00s | Splash opaco (bg del tema) con partículas; logo oculto (scale 0.55, opacity 0) | — |
| 0.08s | Logo: opacity→1 (0.7s) + scale 0.55→1 con **overshoot** | `cubic-bezier(0.3, 1.5, 0.4, 1)` 0.9s |
| 0.75s | Wordmark "Manifiesto." fade-in + translateY 10→0 | ease 0.6s |
| 2.40s | Splash opacity→0 (revela la Bienvenida idéntica debajo) | ease 0.65s |

Alineación splash ↔ Bienvenida: spacer status bar **52px** → zona central `flex:1` → spacer inferior **228px** (bloque CTA+legal); logo **160×128**; wordmark Nunito **42/900** margin-top 22px; spacer **29px** bajo el wordmark (reserva del tagline). El fade de salida es puro (sin zoom) para no romper la alineación.

Uso: `<cold-start logo="logo-light.png" bg="#E9EBE0" text="#24382A" dot="#D97E4F" particles="#7FB069,#E8A87C,#9BB894" top="52" bottom="228">` como overlay absoluto sobre la Bienvenida ya montada.

## 2 · Bridge auth — timeline (demo 6.8s; en producción una sola vez)
| t | Qué pasa | Easing |
|---|---|---|
| 0.08s | Pedestal (Ø190, cuenco hundido Ø154) fade + scale 0.85→1; logo (104×83): opacity→1 + scale 0.55→1 con el MISMO overshoot del cold start | logo: `cubic-bezier(0.3, 1.5, 0.4, 1)` 0.9s, delay 0.12s |
| 0.75s | "Hola, Mario" fade-up + track de barra (150×8) + "Cargando tu hogar…" | ease 0.6s |
| 0.95s | Barra: width 0→100% | `cubic-bezier(0.5, 0, 0.2, 1)` 1.6s |
| 2.60s | SUCCESS: sub → "Todo listo ✓" | — |
| 3.10s | SUCCESS: overlay opacity→0 → Inicio real debajo | ease 0.65s |

**FAIL** (mismo componente, `state="fail"`): la barra corre solo hasta **65%** (1.15s ease-out); a los 2.2s vira al durazno (`#D97E4F` claro / `#F2A87E` oscuro), el pedestal hace **shake** (translateX −6/+6/−4/0 px cada 90ms), sub → "No pudimos sincronizar · revisa tu conexión" en color fail; a los 2.55s aparecen el botón **Reintentar** (píldora verde) y el link "Continuar sin sincronizar". No hay fade: el bridge no avanza al Inicio.

Uso: `<auth-bridge-logo theme="light|dark" state="success|fail" name="Mario">` como overlay absoluto sobre el Inicio ya montado.

## Tokens por tema
Claro: bg `#E9EBE0` · texto `#24382A` · sub `#6C7B67` · barra `#2E7434` · fail `#D97E4F`/texto `#B05E2F` · partículas `#7FB069, #E8A87C, #9BB894` · logo-light · pedestal sombras `14px 14px 30px rgba(151,160,136,0.46), -14px -14px 30px rgba(255,255,255,0.95)` · cuenco inset `6px 6px 13px rgba(151,160,136,0.4) / -6 -6 rgba(255,255,255,0.95)`
Oscuro: bg `#16271C` · texto `#F1EEDD` · sub `#93A78F` · barra `#A4E3A6` (+glow `0 0 10px rgba(164,227,166,0.5)`) · fail `#F2A87E` · partículas `#A4E3A6, #F2A87E, #F1EEDD` · logo-dark (+drop-shadow glow 12px) · pedestal `linear-gradient(145deg, #1D3426, #132318)` sombras `14px 14px 30px rgba(0,0,0,0.6), -14px -14px 30px rgba(101,152,113,0.12)`

## Partículas (compartidas)
16–18 puntos; radio 1.2–3.4px; deriva ascendente 0.008–0.02 alto/s con wrap; sway `sin(t·0.5+φ)·2%`; alpha 0.25–0.8 sinusoidal; halo 2.6× radio al 25% del alpha; fase aleatoria por partícula.

## Notas de producción
- Los demos hacen loop (`setInterval` 6.2s/6.8s + reset) — **eliminar el loop en producción**: reproducir una vez y desmontar el overlay al terminar (`pointer-events:none` ya está).
- Status bar y home indicator viven FUERA del overlay (z-index superior): visibles siempre.
- Ambos overlays cubren la pantalla real ya renderizada debajo — el fade revela contenido real, no una segunda pantalla.
- Flujo completo: cold start → Bienvenida → auth → bridge (success → Inicio | fail → Reintentar).
