import { StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useThemeTokens } from '@/theme/theme-provider'

/**
 * Línea info del expand panel — icon + label en una fila. Mirror del
 * patrón "list item with leading icon" típico de iOS settings, simple
 * y consistente. Icon size 14 para no competir con el texto. Color del
 * icon es textMuted para no robar atención del label.
 */
export function InfoLine({
  icon,
  label,
  theme,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name']
  label: string
  theme: ReturnType<typeof useThemeTokens>
}) {
  return (
    <View style={styles.infoLine}>
      <MaterialIcons name={icon} size={14} color={theme.colors.textMuted} />
      <Text
        style={[styles.infoLineText, { color: theme.colors.text }]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  // InfoLine — fila simple con icon + label, usada para frecuencia /
  // vencimiento / categoría / historial.
  infoLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 2,
  },
  infoLineText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
})
