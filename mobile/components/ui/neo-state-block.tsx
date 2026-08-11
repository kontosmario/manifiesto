import { useMemo } from 'react'
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { NeoButton } from '@/components/ui/neo-button'
import { NeoSurface } from '@/components/ui/neo-surface'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { neoInk } from '@/theme/neo-ink'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'

/**
 * Bloque de estado en material neo (vacío / error / sin permisos).
 *
 * Reemplaza a `EmptyState` y `ErrorState`, primitivas V1 compartidas por media
 * app: su hairline sobre `surfaceMuted` se lee como un parche de la piel vieja
 * adentro de una card neumórfica.
 *
 * Nació local dentro de `expense-categories-screen` y se promovió acá al migrar
 * Ajustes (2026-08-05), que lo necesita en ~8 pantallas. La lógica es idéntica
 * a la original; lo único que se agregó es `style`, para que un consumidor
 * pueda estirarlo o darle margen sin envolverlo en otra View.
 */
export function NeoStateBlock({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  tone = 'neutral',
  style,
}: {
  icon: keyof typeof MaterialIcons.glyphMap
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  tone?: 'neutral' | 'error'
  style?: StyleProp<ViewStyle>
}) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const errorInk = neoInk(theme.mode).danger
  // Android < API 29 descarta el boxShadow INSET en silencio: sin él, el pozo
  // queda del mismo material que su contenedor y el bloque desaparece.
  const wellFallback = useMemo<ViewStyle | null>(
    () => (SUPPORTS_INSET_SHADOW ? null : { borderWidth: 1, borderColor: neo.sheetDivider }),
    [neo],
  )

  return (
    <NeoSurface
      backgroundColor={neo.well}
      radius={neoRadii.card}
      style={[styles.stateBlock, wellFallback, style]}
      variant="insetMd"
    >
      <MaterialIcons color={tone === 'error' ? errorInk : neo.textMuted} name={icon} size={24} />
      <Text style={[styles.stateTitle, { color: neo.text }]}>{title}</Text>
      <Text style={[styles.stateDescription, { color: neo.textMuted }]}>{description}</Text>
      {onAction && actionLabel ? (
        <View style={styles.action}>
          <NeoButton label={actionLabel} onPress={onAction} variant="ghost" />
        </View>
      ) : null}
    </NeoSurface>
  )
}

const styles = StyleSheet.create({
  stateBlock: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 22,
    paddingVertical: 22,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  stateDescription: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    lineHeight: 20,
    textAlign: 'center',
  },
  action: {
    marginTop: 2,
  },
})
