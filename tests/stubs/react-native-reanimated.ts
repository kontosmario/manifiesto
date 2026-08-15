/**
 * Minimal stub for react-native-reanimated used in vitest (Node environment).
 * Only exports what is needed for motion token tests.
 */

function bezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): (t: number) => number {
  // Minimal cubic bezier implementation sufficient for token shape tests.
  return function cubicBezier(t: number): number {
    // Simple linear fallback — shape tests only care that the result is a function.
    void x1; void y1; void x2; void y2;
    return t;
  };
}

export const Easing = {
  bezier,
  linear: (t: number) => t,
  ease: (t: number) => t,
  quad: (t: number) => t * t,
  cubic: (t: number) => t * t * t,
  sin: (t: number) => Math.sin((t * Math.PI) / 2),
  circle: (t: number) => 1 - Math.sqrt(1 - t * t),
  exp: (t: number) => (t === 0 ? 0 : Math.pow(2, 10 * (t - 1))),
  elastic: (_bounciness?: number) => (t: number) => t,
  back: (_s?: number) => (t: number) => t,
  bounce: (t: number) => t,
  in: (easing: (t: number) => number) => easing,
  out: (easing: (t: number) => number) => easing,
  inOut: (easing: (t: number) => number) => easing,
}

// Hook stubs — return plain objects/values; no UI thread in Node
export function useSharedValue<T>(initial: T): { value: T } {
  return { value: initial }
}

export function useDerivedValue<T>(fn: () => T): { value: T } {
  return { value: fn() }
}

export function useAnimatedStyle<T>(fn: () => T): T {
  return fn()
}

export function useAnimatedProps<T>(fn: () => T): T {
  return fn()
}

export function useAnimatedReaction<T>(
  _prepare: () => T,
  _react: (value: T) => void,
): void {
  return
}

export function useReducedMotion(): boolean {
  return false
}

// Worklet helpers — synchronous identity returns in Node
export function withSpring<T>(toValue: T, _config?: unknown): T {
  return toValue
}

export function withTiming<T>(toValue: T, _config?: unknown): T {
  return toValue
}

export function withDelay<T>(_delay: number, animation: T): T {
  return animation
}

export function withSequence<T>(...animations: T[]): T | undefined {
  return animations[animations.length - 1]
}

export function withRepeat<T>(animation: T, _count?: number, _reverse?: boolean): T {
  return animation
}

export function cancelAnimation(_sv: unknown): void {
  return
}

export function runOnJS<F extends (...args: unknown[]) => unknown>(fn: F): F {
  return fn
}

// Type-only re-export used by hooks/components that consume shared values
// generically. The underlying implementation is just the stubbed object.
export type SharedValue<T> = { value: T }

export function interpolate(
  value: number,
  input: number[],
  output: number[],
): number {
  if (!input.length || !output.length) return value
  if (value <= input[0]) return output[0]
  if (value >= input[input.length - 1]) return output[output.length - 1]
  for (let i = 0; i < input.length - 1; i += 1) {
    if (value >= input[i] && value <= input[i + 1]) {
      const span = input[i + 1] - input[i]
      const t = span === 0 ? 0 : (value - input[i]) / span
      return output[i] + (output[i + 1] - output[i]) * t
    }
  }
  return value
}

// Default export mirrors Reanimated's `Animated` namespace
const Animated = {
  View: 'View',
  Text: 'Text',
  ScrollView: 'ScrollView',
  createAnimatedComponent: <T,>(component: T): T => component,
  // No-op: en runtime whitelistea props nativas animables (p.ej. `text` del
  // TextInput del contador fluido). Se llama a nivel de módulo, así que sin
  // esto cualquier test que importe ese módulo explota al colectar.
  addWhitelistedNativeProps: (_props: Record<string, boolean>): void => {},
}

export default Animated
