import Svg, { Path, Rect } from 'react-native-svg'
import { ARC_SIZES, type ArcActionKey } from './arc-hub-geometry'

interface ArcActionIconProps {
  actionKey: ArcActionKey
  color: string
  /** Diámetro del puck que lo aloja; decide el tamaño del glifo. */
  puckSize: number
}

/**
 * Glifos de los pucks del arco. Paths propios del diseño (viewBox 24,
 * cap/join round): `NeoTabIcon` sólo trae los cinco de la barra y
 * `AddQuickActionIcon` usa MaterialIcons, que no matchean el trazo del
 * vocabulario neo a estos tamaños.
 *
 * `no-spend` es el único RELLENO (una hoja): a 22–26px un contorno de
 * hoja se lee como una mancha.
 */
export function ArcActionIcon({ actionKey, color, puckSize }: ArcActionIconProps) {
  // El CTA lleva su glifo más grande y de trazo más grueso: es el mismo
  // "+" del FAB, escalado con el puck.
  const isCta = puckSize >= ARC_SIZES.primary
  const size = isCta ? 30 : puckSize >= ARC_SIZES.daily ? 26 : 22
  const stroke = {
    stroke: color,
    strokeWidth: isCta ? 3 : 2.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {actionKey === 'expense' ? <Path d="M12 5.5v13M5.5 12h13" {...stroke} /> : null}
      {actionKey === 'import' ? (
        <Path
          d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M4 12h16"
          {...stroke}
        />
      ) : null}
      {actionKey === 'no-spend' ? (
        <Path
          d="M6.05 8.05c-2.73 2.73-2.73 7.15-.02 9.88 1.47-3.4 4.09-6.24 7.36-7.93-2.77 2.34-4.71 5.61-5.39 9.32 2.6 1.23 5.8.78 7.95-1.37C19.43 14.47 20 4 20 4S9.53 4.57 6.05 8.05z"
          fill={color}
        />
      ) : null}
      {actionKey === 'income' ? (
        <>
          <Path d="M3.5 17l6-6 3.5 3.5L20.5 7" {...stroke} />
          <Path d="M15.5 7h5v5" {...stroke} />
        </>
      ) : null}
      {actionKey === 'fixed' ? (
        <>
          <Rect x={3.5} y={5} width={17} height={15.5} rx={2.5} {...stroke} />
          <Path d="M3.5 10h17M8 3.2v3.6M16 3.2v3.6" {...stroke} />
          <Path d="M9.2 16.6a3 3 0 1 1 1.1 2.3" {...stroke} />
          <Path d="M9.2 13.9v2.7h2.7" {...stroke} />
        </>
      ) : null}
    </Svg>
  )
}
