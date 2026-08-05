import { useMemo } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { triggerHaptic } from '@/lib/haptics'
import { cssGradient, neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'

export type NeoButtonVariant =
  /** Acción principal: fill radial verde del handoff + sombra `cta`. */
  | 'primary'
  /** Borrado: mismo fill radial pero en el rojo "excedido". */
  | 'danger'
  /** Irreversible-pero-no-destructivo: naranja de alerta. */
  | 'warm'
  /** Secundario: tile extruido sobre la hoja, tinta apagada. */
  | 'ghost'

interface NeoButtonProps {
  label: string
  onPress: () => void
  variant?: NeoButtonVariant
  disabled?: boolean
  /** Operación en vuelo: ignora presses y muestra un spinner. */
  busy?: boolean
  /** `true` estira el botón a todo el ancho disponible. */
  block?: boolean
  style?: StyleProp<ViewStyle>
  accessibilityHint?: string
}

/**
 * Botón del rediseño neumórfico. El primario transcribe el CTA del
 * handoff (`screens/3c.html` L34): radial `circle at 32% 28%` sobre el
 * par `ctaGradient` del tema, con la sombra proyectada + la línea de
 * luz interna de `shadows.cta`.
 *
 * `danger` y `warm` reutilizan la MISMA receta cambiando sólo el par de
 * color: en el vocabulario neo la jerarquía la da el relieve, no la
 * forma, así que un botón destructivo no cambia de silueta — cambia de
 * tinta. El `ghost` es un tile `raisedSm`, el mismo material que los
 * chips.
 */
export function NeoButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  block = false,
  style,
  accessibilityHint,
}: NeoButtonProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const isDark = theme.mode === 'dark'

  const skin = useMemo(() => {
    if (variant === 'ghost') {
      return {
        // El ghost NO lleva gradiente: es el material `raised` del tema,
        // igual que un chip, para que se lea como secundario sin
        // recurrir a un outline (vocabulario V1).
        background: { backgroundColor: neo.surface } as ViewStyle,
        shadow: neo.shadows.raisedSm,
        ink: neo.textMuted,
      }
    }
    // Los tres rellenos comparten receta y sólo cambian el par de color.
    // En oscuro el handoff invierte el CTA (fill claro, tinta oscura),
    // así que la tinta sale de `ctaText`, que ya codifica esa inversión.
    const pair: readonly [string, string] =
      variant === 'danger'
        ? isDark
          ? ['#E9A183', neo.danger]
          : ['#D98561', neo.danger]
        : variant === 'warm'
          ? isDark
            ? ['#F5BE9C', neo.warm]
            : ['#D98E5E', neo.warm]
          : neo.ctaGradient
    const shadow =
      variant === 'primary'
        ? neo.shadows.cta
        : // Misma geometría que `shadows.cta` pero teñida con el color
          // del propio botón: una sombra verde bajo un CTA rojo leería
          // como un error de render.
          variant === 'danger'
            ? isDark
              ? '0 12px 24px rgba(0,0,0,0.45), inset 0 2px 3px rgba(255,255,255,0.3)'
              : '0 12px 24px rgba(194,91,51,0.4), inset 0 2px 3px rgba(255,255,255,0.3)'
            : isDark
              ? '0 12px 24px rgba(0,0,0,0.45), inset 0 2px 3px rgba(255,255,255,0.3)'
              : '0 12px 24px rgba(201,111,63,0.4), inset 0 2px 3px rgba(255,255,255,0.3)'
    return {
      background: cssGradient(
        `radial-gradient(circle at 32% 28%, ${pair[0]}, ${pair[1]} 85%)`,
        pair[1],
      ),
      shadow,
      ink: neo.ctaText,
    }
  }, [variant, neo, isDark])

  const inert = disabled || busy

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inert, busy }}
      accessibilityHint={accessibilityHint}
      onPress={() => {
        if (inert) return
        void triggerHaptic('selection')
        onPress()
      }}
      style={({ pressed }) => [
        styles.base,
        block ? styles.block : null,
        skin.background,
        {
          boxShadow: skin.shadow,
          // Android < API 28 descarta el boxShadow outset EN SILENCIO
          // (ver `inset-shadow-support`): sin él, el `ghost` —que no
          // tiene fill propio contra la hoja— se quedaría sin ningún
          // límite visible. El borde sólo aparece en ese piso.
          borderWidth: variant === 'ghost' && !SUPPORTS_INSET_SHADOW ? 1 : 0,
          borderColor: neo.sheetDivider,
          opacity: disabled ? 0.45 : pressed ? 0.92 : 1,
        },
        style,
      ]}
    >
      {busy ? (
        <View style={styles.busyRow}>
          <ActivityIndicator color={skin.ink} size="small" />
          <Text style={[styles.label, { color: skin.ink }]}>{label}</Text>
        </View>
      ) : (
        <Text style={[styles.label, { color: skin.ink }]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    borderRadius: neoRadii.input,
    paddingVertical: 15,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  block: {
    alignSelf: 'stretch',
  },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.2,
  },
})
