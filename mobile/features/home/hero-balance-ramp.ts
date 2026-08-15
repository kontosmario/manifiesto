/**
 * Rampa de la tinta del saldo del hero — acopla el COLOR al valor EN VUELO
 * del contador (pedido del owner 2026-08-13: "graduar el color si tiende a
 * negativo o positivo").
 *
 * Hasta ahora la tinta la decidía la VARIANTE del hero ('steady' /
 * 'adjusted' / 'over'), que se resuelve con el saldo FINAL desde el primer
 * frame: si el ciclo cerraba en rojo, el color ya estaba en terracota
 * mientras el número todavía bajaba desde cero. El fondo sigue diciendo
 * QUÉ (la variante); la tinta pasa a decir CUÁNTO (el valor).
 *
 * Módulo aparte —y no dentro del kit— para que vitest lo importe en
 * `environment: 'node'` sin arrastrar React Native (la suite no tiene
 * renderer). `'worklet'` porque lo lee un `useAnimatedStyle` en el UI
 * thread; en vitest, sin el plugin de Reanimated, la directiva queda como
 * un string literal inerte y la función corre normal.
 */

/**
 * Posición del saldo dentro de la rampa, 0..1:
 *
 *   0    → ≥ +1 escala   holgado   (tinta calma de la variante)
 *   0.5  → exactamente 0 al borde  (durazno)
 *   1    → ≤ −1 escala   pasado    (terracota)
 *
 * Aritmética pura, sin `Intl` ni locale: apta para el UI runtime.
 */
export function heroBalanceRampT(value: number, scale: number): number {
  'worklet'
  const r = value / scale
  return 0.5 - 0.5 * (r > 1 ? 1 : r < -1 ? -1 : r)
}

/**
 * Escala de la rampa: la distancia (en pesos) entre "holgado" y "al borde".
 * El caller pasa el CUPO DIARIO — es la unidad con la que el hogar ya
 * piensa ("te queda menos de un día de cupo") y la que ya manda el medidor.
 *
 * Los dos pisos son load-bearing:
 *  · `dailyBudget` puede ser 0 (override dinámico tocando piso) → sin piso
 *    la rampa dividiría por cero y el color saltaría en seco entre extremos.
 *  · el 2% del propio saldo mantiene la rampa proporcional en hogares con
 *    cupo diario muy chico frente a un saldo grande.
 */
export function heroBalanceRampScale(dailyBudget: number, value: number): number {
  return Math.max(dailyBudget || 0, Math.abs(value) * 0.02, 1)
}
