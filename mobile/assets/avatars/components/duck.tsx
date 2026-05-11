// AUTO-GENERATED — do not edit by hand.
// Source: mobile/assets/avatars/raw/duck.svg
// Regenerate via: node scripts/generate-avatar-components.mjs
import * as React from 'react'
import Svg, { Path, G as GRaw } from 'react-native-svg'

// react-native-svg's <G> type rejects children in TSX without a cast;
// matches the codebase pattern in hero-sparkline.tsx / fern-logo.tsx.
const G = GRaw as unknown as React.FC<{
  fill?: string
  children?: React.ReactNode
}>

interface DuckAvatarProps {
  size?: number
  /** Silhouette tint. Defaults to a deep forest that reads on cream;
   *  pass the theme primary in light mode or cream in dark mode from
   *  <AvatarAnimal/>. */
  color?: string
}

/**
 * Monochrome silhouette — every path in the source artwork is
 * stripped of its own `fill` and inherits the parent <G>'s color.
 * No gradient, no filter, no drop shadow — keeps render cost flat for
 * older Android hardware while staying recognizable on iOS.
 */
export function DuckAvatar({ size = 64, color = '#297811' }: DuckAvatarProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <G fill={color}>
        <Path d="M956.9 390.7V460c0 158.6-121 289.5-275.6 305.1v119.6c0 10.8-8.7 19.5-19.5 19.5h-54.1c-10.8 0-19.5-8.7-19.5-19.5s8.7-19.5 19.5-19.5h34.5v-98.5h-70.7v118.1c0 10.8-8.7 19.5-19.5 19.5h-54c-10.8 0-19.5-8.7-19.5-19.5s8.7-19.5 19.5-19.5h34.5v-98.5h-30.9c-62.4 0-121.7-23.8-166.9-67-46-43.9-72.4-102.8-74.2-165.7-0.1-2.4-0.1-115.8-0.1-115.8-21.1-9.3-39.1-24.3-52.3-42.9h-82.7C92.1 375.4 65 348.3 65 315c0-16.1 6.3-31.3 17.6-42.7 11.4-11.4 26.6-17.7 42.7-17.7h69c16.8-40.8 54.4-70.9 99.5-77.2-6.4-11.3-18.5-19-32.4-19-10.8 0-19.5-8.7-19.5-19.5s8.7-19.5 19.5-19.5c22.5 0 42.8 9.8 56.8 25.4 14-15.6 34.3-25.4 56.8-25.4 10.8 0 19.5 8.7 19.5 19.5s-8.7 19.5-19.5 19.5c-13.9 0-26.1 7.7-32.5 19.1 61.1 8.9 108.2 61.5 108.2 125v102.2H849l30.9-40.1c11.4-14.8 30.2-20.5 47.9-14.4 17.6 5.9 29.1 21.9 29.1 40.5z"  /><Path d="M917.8 390.7V460c0 147.6-120 267.6-267.6 267.6H501.6c-52.3 0-102-19.9-140-56.2-38.5-36.8-60.6-86-62.2-138.7-0.1-2-0.1-104.4-0.1-104.4 3.9 0.4 7.9 0.6 11.9 0.6 10.8 0 19.5-8.7 19.5-19.5s-8.7-19.5-19.5-19.5c-48.2 0-87.4-39.2-87.4-87.4s39.2-87.4 87.4-87.4h13c48.2 0 87.4 39.2 87.4 87.4v121.7c0 10.8 8.7 19.5 19.5 19.5h427.5c6.1 0 11.8-2.8 15.5-7.6l36.8-47.7c0.5-0.6 1.7-2.2 4.4-1.3 2.5 0.8 2.5 2.9 2.5 3.6z"  /><Path d="M791.5 501.1v16.2c0 86.4-70.3 156.7-156.7 156.7H509.1c-52.2 0-95.9-41.9-97.4-93.3-0.3-10.8 8.1-19.8 18.9-20.1 10.8-0.3 19.8 8.2 20.1 18.9 0.9 30.6 27.1 55.4 58.4 55.4h125.8c63.8 0 115.8-51 117.6-114.3H552c-10.8 0-19.5-8.7-19.5-19.5s8.7-19.5 19.5-19.5h220c10.8 0 19.5 8.8 19.5 19.5zM309.4 254.5c10.8 0 19.5 8.7 19.5 19.5s-8.7 19.5-19.5 19.5-19.5-8.7-19.5-19.5c-0.1-10.8 8.7-19.5 19.5-19.5z"  /><Path d="M189.5 336.1h-64.1c-11.8 0-21.3-9.6-21.3-21.3 0-5.7 2.2-11.1 6.2-15.1s9.4-6.2 15.1-6.2h59.9c-0.2 3-0.4 6-0.4 9 0 11.6 1.6 22.9 4.6 33.6z"  />
      </G>
    </Svg>
  )
}

export default DuckAvatar
