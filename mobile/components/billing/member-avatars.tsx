import { memo } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { neoInk } from '@/theme/neo-ink'
import { neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'

/**
 * Avatares solapados con iniciales de los miembros del hogar. Refleja
 * quiénes "consumen" la cuenta. El borde matchea el material de la card
 * que los contiene (recorte visual). Si hay más que `max`, último chip "+N".
 */
export interface MemberAvatarsProps {
  initials: string[]
  max?: number
  /** Color del borde — el material de la card donde viven. */
  borderColor?: string
}

export const MemberAvatars = memo(function MemberAvatars({
  initials,
  max = 4,
  borderColor,
}: MemberAvatarsProps) {
  const mode = useThemeTokens().mode
  const neo = neoTokens(mode)
  const ink = neoInk(mode)
  const shown = initials.slice(0, max)
  const overflow = initials.length - shown.length
  const ring = borderColor ?? neo.surface

  return (
    <View style={styles.row}>
      {shown.map((ini, i) => (
        <View
          key={i}
          style={[
            styles.av,
            i > 0 && styles.overlap,
            { backgroundColor: neo.selectedTint, borderColor: ring },
          ]}
        >
          <Text style={[styles.txt, { color: ink.accent }]}>{ini}</Text>
        </View>
      ))}
      {overflow > 0 && (
        <View
          style={[
            styles.av,
            styles.overlap,
            { backgroundColor: neo.well, borderColor: ring },
          ]}
        >
          <Text style={[styles.txt, { color: neo.text }]}>+{overflow}</Text>
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
  txt: { fontSize: 9, fontWeight: '900', fontFamily: nunitoFamily('900') },
})
