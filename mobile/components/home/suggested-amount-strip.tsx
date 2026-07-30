import { Pressable, ScrollView, StyleSheet, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useFijosSkin, FIJOS_SHADOW_BLEED } from '@/components/fijos/fijos-skin'
import { useAppTheme } from '@/theme/theme-provider'

interface SuggestedAmountStripProps {
  amounts: number[]
  currentAmount: number
  onAdd: (delta: number) => void
  onClear: () => void
}

export function SuggestedAmountStrip({
  amounts,
  currentAmount,
  onAdd,
  onClear,
}: SuggestedAmountStripProps) {
  const { theme } = useAppTheme()
  // COMPARTIDO con add-ingreso: solo resuelve a `neo` dentro del wizard de
  // fijos, que es el único que monta el provider.
  const skin = useFijosSkin()
  const neo = skin.kind === 'neo' ? skin : null
  const { t } = useTranslation()

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={neo ? styles.bleedNeo : undefined}
      contentContainerStyle={[styles.row, neo ? styles.rowNeo : null]}
      keyboardShouldPersistTaps="handled"
    >
      {amounts.map((v) => (
        <Pressable
          key={v}
          onPress={() => onAdd(v)}
          accessibilityRole="button"
          accessibilityLabel={t('home:suggestedAmount.addAccessibility', { amount: v })}
          style={[
            styles.chip,
            { backgroundColor: theme.colors.creamSoft, borderColor: theme.colors.line },
            // Handoff: chip ELEVADO con la tinta terracota, radio 13 (no pill)
            // y sin borde — el relieve reemplaza al contorno.
            neo
              ? {
                  backgroundColor: neo.add.quickChip.background,
                  experimental_backgroundImage: neo.add.quickChip.gradientCss,
                  borderRadius: neo.add.quickChip.radius,
                  borderWidth: 0,
                  boxShadow: neo.add.quickChip.shadow,
                  paddingHorizontal: neo.add.quickChip.padH,
                  paddingVertical: neo.add.quickChip.padV,
                }
              : null,
          ]}
        >
          <Text
            style={[
              styles.chipText,
              { color: theme.colors.text },
              neo
                ? {
                    color: neo.add.quickChip.ink,
                    fontSize: neo.add.quickChip.fontSize,
                    fontWeight: '800',
                    fontFamily: neo.font('800'),
                  }
                : null,
            ]}
          >
            +${v / 1000}k
          </Text>
        </Pressable>
      ))}
      {currentAmount > 0 ? (
        <Pressable
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel={t('home:suggestedAmount.clearAccessibility')}
          style={[styles.chipDashed, { borderColor: theme.colors.line }]}
        >
          <Text
            style={[
              styles.chipText,
              { color: theme.colors.textMuted },
              neo ? { color: neo.mutedInk } : null,
            ]}
          >
            {t('home:suggestedAmount.clear')}
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  row: {
    gap: 6,
    paddingRight: 4,
  },
  // El ScrollView clipea en vertical (`overflow: auto hidden`), así que sin
  // este aire la sombra neumórfica —que se extiende 17px: offset 5 + blur 12—
  // se ve CORTADA arriba y abajo. Mismo aire a los lados para que el primer
  // y el último chip no pierdan la suya.
  // El ScrollView recorta la sombra contra sus bordes. Sangra hacia afuera lo
  // mismo que el contenido se mete hacia adentro: los chips no se corren y la
  // sombra entra en el área de clip. Ver `FIJOS_SHADOW_BLEED`.
  bleedNeo: { marginHorizontal: -FIJOS_SHADOW_BLEED },
  rowNeo: { gap: 8, paddingVertical: 13, paddingHorizontal: FIJOS_SHADOW_BLEED },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipDashed: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
  },
})
