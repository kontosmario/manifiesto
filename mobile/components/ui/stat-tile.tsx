import { StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { nunitoFamily } from '@/theme/typography'

interface StatTileProps {
  iconName: keyof typeof MaterialIcons.glyphMap
  iconColor: string
  label: string
  value: string
  sub: string
  bg: string
  border: string
  text: string
  muted: string
}

/**
 * Mini-tile compacto con icon + label uppercase + value grande + sub.
 * Reusable para grids de 3 stats (alcancía, control, futuras secciones).
 *
 * Diseño: padding 10×10, min-height 64, borderRadius 12 con borde 1pt.
 * Label en uppercase 9sp; value 16sp tabular bold; sub 10sp muted.
 */
export function StatTile({
  iconName,
  iconColor,
  label,
  value,
  sub,
  bg,
  border,
  text,
  muted,
}: StatTileProps) {
  return (
    <View
      style={[styles.tile, { backgroundColor: bg, borderColor: border }]}
    >
      <View style={styles.tileHead}>
        <MaterialIcons name={iconName} size={13} color={iconColor} />
        <Text style={[styles.tileLabel, { color: muted }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={[styles.tileValue, { color: text }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.tileSub, { color: muted }]} numberOfLines={1}>
        {sub}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 64,
  },
  tileHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  tileLabel: {
    fontSize: 9,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  tileValue: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.4,
  },
  tileSub: {
    fontSize: 10,
    fontWeight: '500',
    fontFamily: nunitoFamily('500'),
    marginTop: 2,
  },
})
