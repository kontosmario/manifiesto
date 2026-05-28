/**
 * Canonical chrome for the round 38×38 header affordances shared
 * across every tab (Home bell / settings / assistant, Fijos +, Gastos
 * streak, Control score). Single source of truth so the four headers
 * read as one identical family: same diameter, same circular radius,
 * same theme-aware muted surface, same lifted shadow.
 *
 * Mirrors the Home header button (the visual reference). Anything that
 * sits in a header right-slot should use these values verbatim.
 */
export const CIRCLE_BUTTON_SIZE = 38
export const CIRCLE_BUTTON_RADIUS = 999

// Soft lifted shadow — reads as a floating chip on both the cream
// light canvas and the near-black dark canvas. Matches the Home
// header button exactly.
export const CIRCLE_BUTTON_SHADOW = '0px 3px 10px rgba(15, 42, 30, 0.16)'

/**
 * Neutral surface for a circular header button: the muted card surface
 * in dark, cream in light. Pass `theme.isDark` and `theme.colors`.
 */
export function circleButtonSurface(
  isDark: boolean,
  colors: { surfaceMuted: string; creamCard: string },
): string {
  return isDark ? colors.surfaceMuted : colors.creamCard
}
