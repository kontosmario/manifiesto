import { useMemo, type ReactNode } from 'react'
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { NeoSurface } from '@/components/ui/neo-surface'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { useThemeTokens } from '@/theme/theme-provider'
import { neoInk } from '@/theme/neo-ink'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { motionDurations } from '@/lib/motion/tokens'

type IconName = keyof typeof MaterialIcons.glyphMap

/**
 * Lista agrupada de Ajustes en material neumórfico (rediseño 2026-07).
 *
 * Migrada el 2026-08-05 junto con el resto de Ajustes. Antes era V1: card con
 * `borderWidth: 1` + `creamCard`/`surfaceMuted`, tile de ícono con hairline y
 * separadores `StyleSheet.hairlineWidth`. Dentro del vocabulario neumórfico ese
 * contorno se lee como un parche de la piel vieja.
 *
 * Traducción al vocabulario del handoff:
 *  · grupo    → `NeoSurface raisedLg` radio `card` (la receta canónica 8/18)
 *  · ícono    → sub-tile `raisedSm` radio `chip` (la receta de chips y botones chicos)
 *  · división → `neo.sheetDivider` a 1.5px. Es el ÚNICO hairline del rediseño y
 *    aplica exactamente en este caso: entre ítems de una misma lista de acciones
 *    (`screens/3c.html` L46 claro / L102 oscuro).
 *  · eyebrow  → sin línea inferior; el neumorfismo separa por relieve, no por borde.
 *
 * La API pública (SettingsGroup / SettingsRow / SettingsSwitchRow y sus props) es
 * idéntica a la V1: la consumen 105 veces 5 pantallas de Ajustes.
 */

function useDangerInk() {
  const theme = useThemeTokens()
  return neoInk(theme.mode).danger
}

/**
 * Android < API 28 descarta el `boxShadow` OUTSET en silencio (< 29 el inset).
 * Sin relieve, la card del grupo queda del mismo material que el fondo de la
 * pantalla y el bloque desaparece. Contorno de 1px como piso.
 */
function useFlatFallback(): ViewStyle | null {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  return useMemo(
    () => (SUPPORTS_INSET_SHADOW ? null : { borderWidth: 1, borderColor: neo.sheetDivider }),
    [neo],
  )
}

// ─── Group ──────────────────────────────────────────────────────────
interface SettingsGroupProps {
  title: string
  footer?: string
  children: ReactNode
  style?: StyleProp<ViewStyle>
}

export function SettingsGroup({ title, footer, children, style }: SettingsGroupProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const flatFallback = useFlatFallback()

  return (
    <View style={[styles.groupStack, style]}>
      <View style={styles.eyebrowWrap}>
        <Text style={[styles.eyebrow, { color: neo.textMuted }]}>{title.toUpperCase()}</Text>
      </View>
      <NeoSurface
        radius={neoRadii.card}
        style={[styles.groupCard, flatFallback]}
        variant="raisedLg"
      >
        {children}
      </NeoSurface>
      {footer ? <Text style={[styles.footer, { color: neo.textMuted }]}>{footer}</Text> : null}
    </View>
  )
}

// ─── Shared row chrome ──────────────────────────────────────────────
function useRowScale() {
  const reduced = useReducedMotion()
  const scale = useSharedValue(1)
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  const onPressIn = () => {
    if (reduced) return

    // @motion-allow: 90ms press-in scale; faster than micro (120) for instant tactile feel on tap
    scale.value = withTiming(0.97, { duration: 90 })
  }
  const onPressOut = () => {
    if (reduced) return

    scale.value = withTiming(1, { duration: motionDurations.exitTab })
  }
  return { style, onPressIn, onPressOut }
}

/** Tile de ícono: sub-relieve del vocabulario (chips y botones chicos). */
function RowIcon({ color, name }: { color: string; name: IconName }) {
  const flatFallback = useFlatFallback()

  return (
    <NeoSurface
      radius={neoRadii.chip}
      style={[styles.iconWrap, flatFallback]}
      variant="raisedSm"
    >
      <MaterialIcons color={color} name={name} size={20} />
    </NeoSurface>
  )
}

// ─── Navigation row ─────────────────────────────────────────────────
interface SettingsRowProps {
  icon: IconName
  label: string
  value?: string
  helper?: string
  onPress?: () => void
  destructive?: boolean
  disabled?: boolean
  disabledHint?: string
  isLoading?: boolean
  trailing?: ReactNode
  isLast?: boolean
}

export function SettingsRow({
  icon,
  label,
  value,
  helper,
  onPress,
  destructive = false,
  disabled = false,
  disabledHint,
  isLoading = false,
  trailing,
  isLast = false,
}: SettingsRowProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const dangerInk = useDangerInk()
  const pressScale = useRowScale()

  const iconColor = destructive ? dangerInk : disabled ? neo.textMuted : neo.text
  const labelColor = destructive ? dangerInk : disabled ? neo.textMuted : neo.text
  const showsHint = disabled && Boolean(disabledHint)
  const trailingText = showsHint ? disabledHint : value

  const content = (
    <Animated.View
      style={[
        styles.row,
        !isLast && { borderBottomColor: neo.sheetDivider, borderBottomWidth: 1.5 },
        pressScale.style,
        disabled ? { opacity: 0.5 } : null,
      ]}
    >
      <RowIcon color={iconColor} name={icon} />
      <View style={styles.copyWrap}>
        <Text numberOfLines={1} style={[styles.label, { color: labelColor }]}>
          {label}
        </Text>
        {helper ? (
          <Text numberOfLines={2} style={[styles.helper, { color: neo.textMuted }]}>
            {helper}
          </Text>
        ) : null}
      </View>
      <View style={styles.trailing}>
        {isLoading ? (
          <Text style={[styles.value, { color: neo.textMuted }]}>…</Text>
        ) : trailing ? (
          trailing
        ) : trailingText ? (
          // El hint del estado bloqueado es una FRASE ("Solo el dueño puede
          // editar"), no un valor: a una línea entra cortada en cualquier
          // pantalla. Los valores propiamente dichos siguen a una línea.
          <Text
            numberOfLines={showsHint ? 2 : 1}
            style={[styles.value, { color: neo.textMuted }]}
          >
            {trailingText}
          </Text>
        ) : null}
        {onPress && !trailing ? (
          <MaterialIcons color={neo.textMuted} name="chevron-right" size={22} />
        ) : null}
      </View>
    </Animated.View>
  )

  if (!onPress) {
    return <View accessibilityRole="summary">{content}</View>
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        void triggerHaptic('selection')
        onPress()
      }}
      onPressIn={pressScale.onPressIn}
      onPressOut={pressScale.onPressOut}
      style={({ pressed }) => [{ opacity: pressed && !disabled ? 0.94 : 1 }]}
    >
      {content}
    </Pressable>
  )
}

// ─── Switch row ─────────────────────────────────────────────────────
interface SettingsSwitchRowProps {
  icon: IconName
  label: string
  helper?: string
  value: boolean
  onValueChange: (next: boolean) => void
  disabled?: boolean
  isLast?: boolean
}

export function SettingsSwitchRow({
  icon,
  label,
  helper,
  value,
  onValueChange,
  disabled = false,
  isLast = false,
}: SettingsSwitchRowProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const iconColor = disabled ? neo.textMuted : neo.text
  // Pista apagada: la píldora de arrastre del handoff es el gris neutro del
  // vocabulario en ambos temas, y contra ella el thumb blanco se lee.
  const trackOff = neo.sheetHandle

  return (
    <View
      style={[
        styles.row,
        !isLast && { borderBottomColor: neo.sheetDivider, borderBottomWidth: 1.5 },
        disabled ? { opacity: 0.5 } : null,
      ]}
    >
      <RowIcon color={iconColor} name={icon} />
      <View style={styles.copyWrap}>
        <Text numberOfLines={1} style={[styles.label, { color: neo.text }]}>
          {label}
        </Text>
        {helper ? (
          <Text numberOfLines={2} style={[styles.helper, { color: neo.textMuted }]}>
            {helper}
          </Text>
        ) : null}
      </View>
      <View style={styles.trailing}>
        <Switch
          disabled={disabled}
          ios_backgroundColor={trackOff}
          onValueChange={(next) => {
            void triggerHaptic('selection')
            onValueChange(next)
          }}
          thumbColor="#FFFFFF"
          trackColor={{ false: trackOff, true: neo.green }}
          value={value}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  groupStack: {
    gap: 8,
  },
  eyebrowWrap: {
    paddingHorizontal: 4,
    paddingBottom: 2,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    letterSpacing: 1.6,
  },
  // Sin `overflow: 'hidden'`. En V1 hacía falta porque las filas tenían fondo
  // propio y se salían de las esquinas redondeadas; acá son transparentes y no
  // hay nada que recortar. Y recortar SOBRE la misma view que lleva el
  // `boxShadow` es justo lo que se le come el relieve neumórfico.
  groupCard: {},
  footer: {
    fontSize: 12,
    fontFamily: nunitoFamily('600'),
    lineHeight: 17,
    paddingHorizontal: 4,
    paddingTop: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 56,
  },
  iconWrap: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyWrap: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
  helper: {
    fontSize: 12,
    fontFamily: nunitoFamily('600'),
    lineHeight: 16,
  },
  // El tope es PROPORCIONAL, no un ancho fijo: con un cap en puntos el valor
  // se corta igual en pantallas anchas, y con `flexShrink` solo se lo come el
  // label. 52% deja siempre la mitad de la fila para el label.
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    maxWidth: '52%',
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    flexShrink: 1,
    // La columna está anclada al chevron: cuando el texto pasa a dos líneas
    // (el hint del estado bloqueado) las dos tienen que quedar a ras del
    // borde derecho, no escalonadas.
    textAlign: 'right',
  },
})
