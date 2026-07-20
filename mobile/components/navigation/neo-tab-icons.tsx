import Svg, { Circle, Path, Rect } from 'react-native-svg'

export type NeoTabIconName = 'home' | 'expenses' | 'fixed' | 'control' | 'plus'

interface NeoTabIconProps {
  name: NeoTabIconName
  color: string
  size?: number
  strokeWidth?: number
}

/**
 * Iconos de la tab bar del rediseño 2026-07 — paths literales del
 * design doc (screens/1b.html · 1c.html). Stroke round, sin fills:
 * idénticos en iOS y Android (reemplazan SF Symbols + fallback
 * Material, que divergían por plataforma).
 */
export function NeoTabIcon({ name, color, size = 20, strokeWidth = 2.2 }: NeoTabIconProps) {
  const common = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    fill: 'none' as const,
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'home' ? (
        <Path d="M4 11.2L12 4.6l8 6.6V20h-5.6v-4.8h-4.8V20H4z" {...common} strokeLinejoin="round" />
      ) : null}
      {name === 'expenses' ? (
        <>
          <Rect x={6} y={4} width={12} height={16} rx={2.5} {...common} />
          <Path d="M9.5 9h5M9.5 13h5" {...common} />
        </>
      ) : null}
      {name === 'fixed' ? (
        <>
          <Rect x={3.5} y={7} width={17} height={10} rx={3} {...common} />
          <Circle cx={12} cy={12} r={2.3} {...common} />
        </>
      ) : null}
      {name === 'control' ? (
        <>
          <Path d="M4 16.5l4.5-5.5 3.5 4L20 7" {...common} strokeLinejoin="round" />
          <Path d="M16.5 7H20v3.5" {...common} strokeLinejoin="round" />
        </>
      ) : null}
      {name === 'plus' ? <Path d="M12 5.5v13M5.5 12h13" {...common} /> : null}
    </Svg>
  )
}
