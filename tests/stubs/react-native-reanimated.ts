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
