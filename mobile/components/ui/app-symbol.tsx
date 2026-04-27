import { MaterialIcons } from '@expo/vector-icons'
import type { SymbolType, SymbolWeight } from 'expo-symbols'

interface AppSymbolProps {
  /** SF Symbol name. Kept for API compatibility; ignored when rendering. */
  name?: string
  /** MaterialIcons glyph name — the one actually rendered across all platforms. */
  fallback: keyof typeof MaterialIcons.glyphMap
  size?: number
  color: string
  /** Kept for API compatibility; ignored. */
  type?: SymbolType
  /** Kept for API compatibility; ignored. */
  weight?: SymbolWeight
  style?: object
}

/**
 * Renders a vector icon from MaterialIcons on every platform (iOS,
 * Android, web). Previously this branched to SF Symbols on iOS via
 * `expo-symbols`, which made the iOS build visually diverge from web
 * and Android. Unifying on MaterialIcons gives pixel-identical icons
 * on all targets and keeps the icon system token-driven.
 *
 * The `name`, `type`, and `weight` props are kept in the signature so
 * existing call-sites (~14 across the app) compile unchanged, but
 * they're ignored at render time — only `fallback` is used.
 */
export function AppSymbol({
  fallback,
  size = 22,
  color,
  style,
}: AppSymbolProps) {
  return <MaterialIcons color={color} name={fallback} size={size} style={style} />
}
