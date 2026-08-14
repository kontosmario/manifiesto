import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { MaterialIcons } from '@expo/vector-icons'
import { useFijosSkin } from '@/components/fijos/fijos-skin'
import { useThemeTokens } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

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
  const skin = useFijosSkin()
  const neo = skin.kind === 'neo' ? skin : null
  return (
    <View
      style={[
        styles.infoLine,
        // El handoff da a estas líneas MUCHO más aire (gap 11, 7px arriba y
        // abajo) y un ícono verde de 18: leen como una lista de datos, no
        // como metadata apretada.
        neo
          ? {
              gap: neo.detail.infoGap,
              paddingVertical: neo.detail.infoPadV,
              alignItems: 'center',
            }
          : null,
      ]}
    >
      <MaterialIcons
        name={icon}
        size={neo ? 18 : 14}
        color={neo ? neo.detail.sectionLabelInk : theme.colors.textMuted}
      />
      <Text
        style={[
          styles.infoLineText,
          { color: theme.colors.text },
          neo ? { ...neo.detail.infoText, color: neo.ink.title, lineHeight: 19 } : null,
        ]}
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
    fontFamily: nunitoFamily('500'),
    lineHeight: 18,
  },
})
