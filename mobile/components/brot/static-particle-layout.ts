/**
 * Layout determinístico para el campo de partículas ESTÁTICO del tier de
 * pintura de gama baja (ver brot-particles.tsx). Módulo puro y testeable:
 * dado un count devuelve posiciones/tamaños/opacidades ESTABLES (sin
 * Math.random — dos renders producen el mismo campo, cero layout shift).
 *
 * La dispersión usa secuencias de baja discrepancia (conjugado del ratio
 * áureo y de plástico): cubren el área de forma pareja sin grillas
 * visibles ni clumping — el mismo "desorden natural" del campo Skia,
 * pero computado una sola vez.
 */

export interface StaticParticleSpec {
  /** Posición como fracción [0, 1) del ancho/alto del contenedor. */
  left: number
  top: number
  /** Diámetro del núcleo en dp. */
  size: number
  /** Opacidad del núcleo (el halo usa una fracción fija de esta). */
  opacity: number
  /** Índice dentro de la paleta (i % colorCount). */
  colorIndex: number
}

const GOLDEN = 0.618033988749895
const PLASTIC = 0.754877666246693

function frac(n: number): number {
  return n - Math.floor(n)
}

export function buildStaticParticleLayout(
  count: number,
  colorCount: number,
): StaticParticleSpec[] {
  const specs: StaticParticleSpec[] = []
  const safeColors = Math.max(1, colorCount)
  for (let i = 0; i < count; i += 1) {
    specs.push({
      left: frac(0.17 + (i + 1) * GOLDEN),
      top: frac(0.29 + (i + 1) * PLASTIC),
      // 3–7.5dp — el rango de radios del campo Skia (partículas chicas).
      size: 3 + (i % 4) * 1.5,
      // 0.35–0.75 — variedad de brillo sin que ninguna grite.
      opacity: 0.35 + ((i * 7) % 5) * 0.1,
      colorIndex: i % safeColors,
    })
  }
  return specs
}
