import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Avatares solapados con iniciales de los miembros del hogar. Refleja
 * quiénes "consumen" la cuenta. El borde matchea el fondo de la card
 * que los contiene (recorte visual). Si hay más que `max`, último chip "+N".
 */
export interface MemberAvatarsProps {
  initials: string[]
  max?: number
  /** Color del borde — el fondo de la card donde viven. */
  borderColor?: string
}

export const MemberAvatars = memo(function MemberAvatars({
  initials,
  max = 4,
  borderColor,
}: MemberAvatarsProps) {
  const { theme } = useAppTheme()
  const shown = initials.slice(0, max)
  const overflow = initials.length - shown.length
  const ring = borderColor ?? theme.colors.creamCard
  return (
    <View style={styles.row}>
      {shown.map((ini, i) => (
        <View
          key={i}
          style={[
            styles.av,
            i > 0 && styles.overlap,
            { backgroundColor: theme.colors.primarySurface, borderColor: ring },
          ]}
        >
          <Text style={[styles.txt, { color: theme.colors.primary }]}>{ini}</Text>
        </View>
      ))}
      {overflow > 0 && (
        <View
          style={[
            styles.av,
            styles.overlap,
            { backgroundColor: theme.colors.surfaceMuted, borderColor: ring },
          ]}
        >
          <Text style={[styles.txt, { color: theme.colors.textMuted }]}>
            +{overflow}
          </Text>
        </View>
      )}
    </View>
  )
})

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  av: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlap: { marginLeft: -7 },
  txt: { fontSize: 9, fontWeight: '900' },
})
