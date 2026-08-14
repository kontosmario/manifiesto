import { useMemo, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { Text } from '@/components/ui/app-text'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { triggerHaptic, type AppHapticTone } from '@/lib/haptics'
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

export type NeoButtonSize = 'default' | 'compact'

interface NeoButtonSizeTokens {
  borderRadius: number
  paddingVertical: number
  paddingHorizontal: number
  fontSize: number
  gap: number
  minHeight?: number
}

/**
 * `default` es la banda del handoff (radio de input, 52pt de alto por
 * padding). `compact` baja al radio de chip y garantiza el mínimo táctil
 * de 44pt por `minHeight`, porque su padding solo llega a ~41.
 */
const SIZES: Record<NeoButtonSize, NeoButtonSizeTokens> = {
  default: {
    borderRadius: neoRadii.input,
    paddingVertical: 15,
    paddingHorizontal: 22,
    fontSize: 16,
    gap: 10,
  },
  compact: {
    borderRadius: neoRadii.chip,
    paddingVertical: 10,
    paddingHorizontal: 16,
    fontSize: 14,
    gap: 8,
    minHeight: 44,
  },
}

interface NeoButtonProps {
  label: string
  onPress: (event: GestureResponderEvent) => void
  variant?: NeoButtonVariant
  size?: NeoButtonSize
  /** Bloquea el press y hunde el botón en la hoja. */
  disabled?: boolean
  /**
   * Pinta el estado hundido SIN bloquear el press. Para formularios que
   * necesitan el tap alcanzable para rutear a su branch de "marcá lo que
   * falta" en vez de enviar. `disabled` y `busy` sí bloquean.
   */
  lookDisabled?: boolean
  /** Operación en vuelo: ignora presses y muestra un spinner. */
  busy?: boolean
  /** Alias de `busy`. Gana sobre él cuando se pasa. */
  loading?: boolean
  /** `true` estira el botón a todo el ancho disponible. */
  block?: boolean
  /** Alias de `block`. Gana sobre él cuando se pasa. */
  fullWidth?: boolean
  /** Tono del háptico al presionar; `'none'` lo apaga. */
  haptic?: AppHapticTone
  /** Glifo a la izquierda del label. Hereda la tinta de la variante. */
  icon?: ReactNode
  style?: StyleProp<ViewStyle>
  testID?: string
  accessibilityLabel?: string
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
 *
 * ESTADO APAGADO — el botón se HUNDE (`insetSm` sobre `well`, sin
 * gradiente) en vez de bajar de opacidad. `opacity` sobre el Pressable
 * aplana el subárbol en una capa y lo compone contra el fondo, así que
 * desvanece el fill Y la tinta contra el mismo material: el par
 * `#489350`/`#F5F2E1` a 0.45 colapsa a ~1.6:1. Con el pozo la tinta se
 * elige contra un fondo conocido y sigue leyéndose. Distingue dos casos
 * porque sólo uno está exento de WCAG 1.4.3:
 *  · `disabled` — control inactivo (exento): `textMuted`, 3.73:1 claro /
 *    6.24:1 oscuro sobre `well`.
 *  · `lookDisabled` — el control SIGUE siendo operable y es el único
 *    camino para enterarse de qué falta, así que NO está exento: `text`,
 *    10.41:1 claro / 13.77:1 oscuro.
 */
export function NeoButton({
  label,
  onPress,
  variant = 'primary',
  size = 'default',
  disabled = false,
  lookDisabled = false,
  busy = false,
  loading,
  block = false,
  fullWidth,
  haptic = 'selection',
  icon,
  style,
  testID,
  accessibilityLabel,
  accessibilityHint,
}: NeoButtonProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const isDark = theme.mode === 'dark'
  const isBusy = loading ?? busy
  const stretches = fullWidth ?? block
  const inert = disabled || isBusy
  const isDimmed = disabled || lookDisabled
  const sizing = SIZES[size]

  const skin = useMemo(() => {
    if (isDimmed) {
      return {
        background: { backgroundColor: neo.well } as ViewStyle,
        shadow: neo.shadows.insetSm,
        ink: disabled ? neo.textMuted : neo.text,
      }
    }
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
  }, [variant, neo, isDark, isDimmed, disabled])

  const labelNode = (
    <Text
      style={[styles.label, { color: skin.ink, fontSize: sizing.fontSize }]}
      numberOfLines={1}
    >
      {label}
    </Text>
  )

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inert, busy: isBusy }}
      accessibilityHint={accessibilityHint}
      testID={testID}
      onPress={(event) => {
        if (inert) return
        // Sin háptico en el press apagado: el branch de "marcá lo que
        // falta" del caller dispara su propio warning y duplicarlo acá
        // ensucia el feel.
        if (haptic !== 'none' && !isDimmed) {
          void triggerHaptic(haptic)
        }
        onPress(event)
      }}
      style={({ pressed }) => [
        styles.base,
        stretches ? styles.block : null,
        skin.background,
        {
          borderRadius: sizing.borderRadius,
          paddingVertical: sizing.paddingVertical,
          paddingHorizontal: sizing.paddingHorizontal,
          minHeight: sizing.minHeight,
          boxShadow: skin.shadow,
          // Android < API 28 descarta el boxShadow outset EN SILENCIO y
          // < 29 el inset (ver `inset-shadow-support`): sin él, el
          // `ghost` y el estado hundido —que no tienen fill propio
          // contra la hoja— se quedarían sin ningún límite visible. El
          // borde sólo aparece en ese piso.
          borderWidth:
            !SUPPORTS_INSET_SHADOW && (isDimmed || variant === 'ghost') ? 1 : 0,
          borderColor: neo.sheetDivider,
          opacity: pressed && !inert ? 0.92 : 1,
        },
        style,
      ]}
    >
      {isBusy || icon ? (
        <View style={[styles.row, { gap: sizing.gap }]}>
          {isBusy ? <ActivityIndicator color={skin.ink} size="small" /> : icon}
          {labelNode}
        </View>
      ) : (
        labelNode
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  block: {
    alignSelf: 'stretch',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.2,
  },
})
