# Reel de presentación de Manifiesto — Diseño

**Fecha:** 2026-07-06
**Estado:** Aprobado por Mario (storyboard + pipeline)

## Qué es

Un reel de ~42 segundos, formato 9:16 (1080×1920, 30fps), para redes sociales
(Instagram Reels / TikTok / Shorts), que presenta la app Manifiesto con un tono
calmo estilo keynote de Apple: componentes reales de la app grabados del
simulador, textos de motion graphics con el design system exacto, y música
minimalista generada con Higgsfield. Sin voiceover.

**Posicionamiento central:** Manifiesto no es otra app para cargar gastos — es
una app para construir un hábito financiero. El copy abre confrontativo
("Anotar gastos no cambia nada.") y resuelve con la metáfora del producto
(el hábito florece / se cultiva, atado a Mi Jardín).

## Storyboard (10 escenas)

| # | Tiempo | Escena | Copy en pantalla |
|---|--------|--------|------------------|
| 1 | 0:00–0:04 | Cold start real: fondo `#0E3A26`, el helecho se dibuja trazo a trazo, luciérnagas, wordmark "Manifiesto." sube | — |
| 2 | 0:04–0:09 | Hook en dos beats sobre verde con partículas. Beat A chico en crema; beat B grande con palabra clave en peach | "Anotar gastos no cambia nada." → "Un **hábito**, sí." |
| 3 | 0:09–0:13 | Device frame → Home: saldo del mes, cupo diario, proyección de cierre | "Tu saldo del mes, de un vistazo." |
| 4 | 0:13–0:17 | Gastos: total del ciclo, categorías, calendario verde/rojo | "Cada peso, a la **vista**." |
| 5 | 0:17–0:21 | Fijos: pagado vs pendiente, % del sueldo, avisos de aumentos (ej. Disney +30%) | "Lo recurrente, en **orden**." + micro-caption "Aumentos detectados" |
| 6 | 0:21–0:24 | Control: proyecciones y señales | "Tu ritmo, bajo control." |
| 7 | 0:24–0:28 | Mi Jardín: brotes de la semana con luciérnagas orbitando | "Los hábitos no se anotan. Se **cultivan**." |
| 8 | 0:28–0:32 | Wrapped de cierre de ciclo ("Tu mes, en cifras") | "Cada cierre, tu resumen." |
| 9 | 0:32–0:36 | Crossfade modo claro ↔ oscuro + header con miembros del hogar | "Solo o en familia. Como quieras." |
| 10 | 0:36–0:42 | Cierre en verde: helecho + wordmark + partículas que se asientan | "Manifiesto. Haz de tus finanzas un **hábito**." + sub-línea: "Tus finanzas, claras." |

Copy en tuteo neutro LATAM. Palabras clave destacadas en peach, mismo gesto que
el punto del wordmark.

## Lenguaje visual

- **Dos mundos de color:** verde profundo `#0E3A26` con luciérnagas/partículas
  para momentos de marca (escenas 1, 2, 7-parcial, 10); crema
  `#F2EEE3`/`#FDFEF9` para momentos de producto (device frames).
- **Tipografía:** la del design system — weights 800–900, letter-spacing
  negativo (wordmark: 46px w800 ls-2 como referencia de proporción; títulos de
  escena estilo `hero`/`displayLarge`).
- **Acentos:** peach `#F2B58A`, clay `#E08E63`; luciérnagas `#F0B488`,
  `#B2E08A`, `#C7EE9C`.
- **Motion:** textos entran con rise (translateY 12–14px + fade, easing
  expo-out `cubic-bezier(0.16, 1, 0.3, 1)` — el mismo de RiseView). Crossfades
  lentos entre escenas. Device frames con drift de escala 1.0→1.03 (Ken Burns
  calmo). Nada estático, nada brusco.
- **Sin manos ni mockups lifestyle** — solo device frame limpio.

## Música

Generada con Higgsfield `generate_audio`: piano minimalista + pads cálidos,
~85 BPM, 42s, estilo Apple keynote. Arranque íntimo, lift sutil hacia
Jardín/Wrapped (escenas 7–8), resolución suave al cierre. Sin drops ni
percusión agresiva. Mezcla final ~-14 LUFS, fade out.

## Pipeline de producción

1. **Captura** — App en simulador iOS vía dev client (`expo run:ios`; nunca
   Expo Go), cuenta demo con datos realistas. Barra de estado limpia con
   `xcrun simctl status_bar override` (9:41, batería/señal llenas). Grabación
   con `xcrun simctl io booted recordVideo`. Clips necesarios: cold start
   completo, scroll suave de Home / Gastos / Fijos / Control, Mi Jardín,
   flujo wrapped, toggle claro↔oscuro, header con miembros del hogar.
   Fallback si `recordVideo` falla: QuickTime sobre la ventana del simulador.
2. **Composición** — Proyecto Remotion nuevo en `marketing/reel/` (versionado
   en el repo como template reutilizable, independiente del código de la app).
   Tokens de color/tipografía/easing espejados del design system como
   constantes. Una composición por escena + composición master que las
   secuencia.
3. **Audio** — Música vía Higgsfield, mezcla con ffmpeg.
4. **Render** — `npx remotion render`, 1080×1920, 30fps, H.264 alta calidad.

## Entregables

- `reel-manifiesto-2026-07.mp4` (1080×1920, ~42s, con música)
- Recordings crudos del simulador (por si se quiere re-editar)
- Template Remotion en `marketing/reel/`

## Riesgos y supuestos

- **Primera vez con Remotion en este entorno**: el render y la grabación del
  simulador pueden tener fricción de setup; hay fallback de captura definido.
- **Duración por escena**: 3–5s por escena es apretado para el tour completo;
  si en el corte se siente apurado, se estira a ~45s antes que acelerar el
  ritmo (el tono calmo manda).
- **Datos de la cuenta demo**: deben verse realistas y sin datos personales
  reales en pantalla.
- El reel es material de marketing para redes; no aplican las reglas de App
  Preview de Apple.
