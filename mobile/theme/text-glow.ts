import type { TextStyle } from 'react-native'

/**
 * Halo de texto (`textShadow`) que NO se recorta contra su propia caja.
 *
 * ── El bug que esto resuelve (QA del owner, 2026-08-17) ────────────────
 * En iOS/Fabric un `<Text>` se pinta dentro de `RCTParagraphTextView.drawRect:`
 * y esa vista tiene `frame = self.bounds`, o sea EXACTAMENTE la caja Yoga del
 * nodo. El `textShadow` es un `NSShadow` por glifo: se dibuja alrededor de cada
 * letra y después se GUILLOTINA contra esa caja. Con un blur grande y una caja
 * ajustada (el monto del hero de Gastos: fontSize 40 / lineHeight 46 contra un
 * radio de 26) el halo se corta donde la gaussiana todavía está fuerte y deja
 * un CONTORNO RECTANGULAR brillante — el "cuadrado de sombra cortado" que se
 * ve en oscuro y no en claro (ahí el halo es oscuro y de radio 8: se recorta
 * igual, pero es invisible sobre un pozo oscuro).
 *
 * En CSS esto no pasa —`text-shadow` nunca se recorta contra el elemento—, así
 * que los mocks web pasan el valor tal cual y el trap aparece recién en device.
 * Es el mismo tipo de trampa CSS→RN que ya está documentada para `lineHeight`.
 *
 * ── Por qué padding + margen negativo ─────────────────────────────────
 * El lienzo del párrafo es el FRAME, pero los glifos se dibujan en el CONTENT
 * FRAME (= frame − padding). O sea: cada punto de padding es un punto de
 * superficie de pintado EXTRA, gratis. El margen negativo del mismo tamaño
 * devuelve la caja a su tamaño original, así que el layout no se mueve ni un
 * punto: el texto queda donde estaba y el halo pasa a tener lugar donde
 * dibujarse.
 *
 * ── Invariante ────────────────────────────────────────────────────────
 * El padding se DERIVA del radio, nunca se escribe a mano. Un literal se
 * desincroniza en silencio el día que alguien sube el radio en el spec y el
 * rectángulo vuelve sin que nada falle.
 *
 * ⚠️ No envolver un texto con este estilo en un contenedor con
 * `overflow: 'hidden'`: ahí el recorte vuelve, ahora en el ancestro.
 */
export function glowSafeTextShadow(glow: {
  color: string
  radius: number
  offset: { width: number; height: number }
}): TextStyle {
  // El halo alcanza `radius` en cada dirección desde el glifo, más lo que lo
  // corra el offset. Se toma el máximo de ambos ejes para un padding uniforme:
  // asimétrico ahorraría unos puntos y multiplicaría las formas de romperlo.
  const reach =
    Math.ceil(glow.radius) +
    Math.ceil(Math.max(Math.abs(glow.offset.width), Math.abs(glow.offset.height)))
  return {
    textShadowColor: glow.color,
    textShadowOffset: glow.offset,
    textShadowRadius: glow.radius,
    padding: reach,
    margin: -reach,
  }
}
