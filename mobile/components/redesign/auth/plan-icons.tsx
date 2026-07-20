// @i18n-ignore-file — pieza dev-only del rediseño; sin copy.
import Svg, { Path, Rect } from 'react-native-svg'

/**
 * Íconos propios de la pantalla del plan (4m/4mo) — no existen en
 * auth-icons.tsx. Paths literales del markup (viewBox 24, stroke round).
 */

/** Candado cerrado de la trial card (17px en el mock). */
export function LockClosedIcon({ color, size = 17 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x={5}
        y={10.5}
        width={14}
        height={9}
        rx={2.5}
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M8.5 10.5V8a3.5 3.5 0 0 1 6.5-1.8"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

/** Check de las features (15px en el mock). */
export function CheckIcon({ color, size = 15 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
