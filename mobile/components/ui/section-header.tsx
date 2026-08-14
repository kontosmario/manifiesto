import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily, typography } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'

interface SectionHeaderProps {
  title: string
  subtitle?: string
  rightSlot?: ReactNode
}

/**
 * Encabezado de sección del área de Ajustes. Usa el MISMO eyebrow que
 * los grupos de `settings-grouped-list` (11/uppercase con tracking):
 * las dos piezas titulan bloques de filas neumórficas en la misma área,
 * y con dos escalas distintas la pantalla leía como dos jerarquías
 * superpuestas.
 *
 * La tinta del título es `neo.text` y no la apagada del grupo porque acá
 * el eyebrow es el único rótulo del bloque (el grupo, en cambio, ya se
 * delimita con la card `raisedLg` que lleva debajo).
 */
export function SectionHeader({ title, subtitle, rightSlot }: SectionHeaderProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)

  return (
    <View style={styles.container}>
      <View style={styles.copy}>
        <Text style={[typography.eyebrow, { color: neo.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: neo.textMuted }]}>{subtitle}</Text>
        ) : null}
      </View>
      {rightSlot ? <View>{rightSlot}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  subtitle: {
    ...typography.bodySmall,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
  },
})
