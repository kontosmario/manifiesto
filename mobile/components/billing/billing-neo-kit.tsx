import { useMemo, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { AUTH_SPEC } from '@/components/redesign/auth/auth-spec'
import { triggerHaptic } from '@/lib/haptics'
import { neoInk } from '@/theme/neo-ink'
import { neoRadii, neoTokens, type NeoShadows } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'
import type { MembershipTone } from '@/features/billing/membership-state'

/**
 * Piezas compartidas del área de suscripción en material neumórfico.
 *
 * El paywall (Estado A) ya se dibuja con el vocabulario del handoff
 * (`auth-plan-hogar`); estas piezas son las que le faltaban a la gestión
 * (Estado B) y a los sheets de compra para pertenecer a la misma app: el pozo
 * con su fallback de Android, el chip de estado y el link legal con la tinta
 * exacta del paywall.
 */

/**
 * Pozo del vocabulario. Android < API 29 descarta el `boxShadow` inset EN
 * SILENCIO: sin relieve el pozo queda del mismo material que su contenedor y
 * desaparece, así que en ese piso cae a un contorno de 1px.
 */
export function useWellStyle(variant: Extract<keyof NeoShadows, 'insetSm' | 'insetMd' | 'insetLg'> = 'insetSm'): ViewStyle {
  const neo = neoTokens(useThemeTokens().mode)
  return useMemo(
    () => ({
      backgroundColor: neo.well,
      boxShadow: neo.shadows[variant],
      ...(SUPPORTS_INSET_SHADOW
        ? null
        : { borderWidth: 1, borderColor: neo.sheetDivider }),
    }),
    [neo, variant],
  )
}

/**
 * Mismo piso para las cards extruidas: sin `boxShadow` outset (Android < 28)
 * la card se funde con el fondo de la pantalla.
 */
export function useRaisedFallback(): ViewStyle | null {
  const neo = neoTokens(useThemeTokens().mode)
  return useMemo(
    () => (SUPPORTS_INSET_SHADOW ? null : { borderWidth: 1, borderColor: neo.sheetDivider }),
    [neo],
  )
}

/** Tinta del tono de membresía, corregida por contraste en ambos temas. */
export function useToneInk(tone: MembershipTone): string {
  const mode = useThemeTokens().mode
  const neo = neoTokens(mode)
  const ink = neoInk(mode)
  return tone === 'active' ? ink.accent : tone === 'warn' ? ink.warn : neo.text
}

/**
 * Chip de estado: pozo + punto + label. El estado se comunica por la TINTA
 * (verde de acción / cálido de alerta / texto neutro), no por un fill saturado
 * fuera del sistema.
 */
export function BillingStatusChip({
  label,
  tone,
  style,
}: {
  label: string
  tone: MembershipTone
  style?: StyleProp<ViewStyle>
}) {
  const well = useWellStyle('insetSm')
  const toneInk = useToneInk(tone)
  return (
    <View style={[styles.chip, well, style]}>
      <View style={[styles.chipDot, { backgroundColor: toneInk }]} />
      <Text style={[styles.chipLabel, { color: toneInk }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

/**
 * Link de texto con la tinta `linkSoft` del paywall — el mismo verde apagado
 * que ya usan "Restaurar compras", "Términos" y "Privacidad" en el Estado A.
 */
export function BillingLink({
  label,
  onPress,
  accessibilityLabel,
  style,
}: {
  label: string
  onPress: () => void
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
}) {
  const s = AUTH_SPEC[useThemeTokens().mode]
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={8}
      onPress={() => {
        void triggerHaptic('light')
        onPress()
      }}
      style={({ pressed }) => [styles.linkHit, style, { opacity: pressed ? 0.55 : 1 }]}
    >
      <Text style={[styles.link, { color: s.linkSoft }]}>{label}</Text>
    </Pressable>
  )
}

/** Separador " · " entre links, con la misma tinta apagada. */
export function BillingLinkSeparator() {
  const s = AUTH_SPEC[useThemeTokens().mode]
  return <Text style={[styles.link, { color: s.linkSoft }]}> · </Text>
}

/** Tile de ícono del vocabulario (chips y botones chicos). */
export function BillingIconTile({
  children,
  size = 30,
}: {
  children: ReactNode
  size?: number
}) {
  const neo = neoTokens(useThemeTokens().mode)
  const flatFallback = useRaisedFallback()
  return (
    <View
      style={[
        styles.iconTile,
        { width: size, height: size, backgroundColor: neo.surface, boxShadow: neo.shadows.raisedSm },
        flatFallback,
      ]}
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: neoRadii.chip,
    paddingHorizontal: 9,
    paddingVertical: 5,
    flexShrink: 0,
  },
  chipDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
  },
  chipLabel: {
    fontSize: 10.5,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  linkHit: {
    paddingVertical: 4,
  },
  link: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  iconTile: {
    borderRadius: neoRadii.chip,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
})
