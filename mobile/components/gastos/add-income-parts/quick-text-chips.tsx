// Chips de descripción rápida ("Transferencia", "Aguinaldo", …).
//
// Es el MISMO material que los chips de monto rápido (`SuggestedAmountStrip`):
// ambos son atajos para llenar un campo, así que comparten superficie. No se
// reusa aquel componente porque su contrato es numérico (`+$5k` lo formatea
// adentro); acá el label es texto libre.
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native'
import { useWizardSkin, WIZARD_SHADOW_BLEED } from '@/components/wizard/wizard-skin'
import { useAppTheme } from '@/theme/theme-provider'

export interface QuickTextChipsProps {
  options: readonly string[]
  onSelect: (value: string) => void
  /** El chip elegido queda marcado — sin esto, tocar "Aguinaldo" y ver el
   *  texto aparecer arriba era el único feedback y se perdía al scrollear. */
  selected?: string
}

export function QuickTextChips({ options, onSelect, selected }: QuickTextChipsProps) {
  const { theme } = useAppTheme()
  const skin = useWizardSkin()
  const neo = skin.kind === 'neo' ? skin : null

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      // El ScrollView recorta la sombra contra sus bordes: sangra hacia afuera
      // lo mismo que el contenido se mete hacia adentro (ver
      // `WIZARD_SHADOW_BLEED`).
      style={neo ? styles.bleedNeo : styles.scroll}
      contentContainerStyle={[styles.row, neo ? styles.rowNeo : null]}
    >
      {options.map((option) => {
        const isSelected = option === selected
        return (
          <Pressable
            key={option}
            onPress={() => onSelect(option)}
            // El chip mide ~28pt de alto (padV 7 + 12px de texto), muy por
            // debajo del mínimo de 44. El `hitSlop` agranda el área real sin
            // tocar el layout del handoff: fallar el tap acá arrastraba el
            // scroll o pisaba la descripción con la del chip vecino.
            hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={option}
            style={[
              styles.chip,
              { backgroundColor: theme.colors.creamSoft, borderColor: theme.colors.line },
              neo
                ? {
                    backgroundColor: neo.add.quickChip.background,
                    experimental_backgroundImage: neo.add.quickChip.gradientCss,
                    borderRadius: neo.add.quickChip.radius,
                    borderWidth: 0,
                    paddingHorizontal: neo.add.quickChip.padH,
                    paddingVertical: neo.add.quickChip.padV,
                    // El elegido se HUNDE con anillo, igual que el tile del
                    // rail: es el recurso de "presionado" del neumorfismo, no
                    // un fill de selección.
                    boxShadow: isSelected
                      ? `${neo.add.tile.selectedShadow}, 0 0 0 2px ${neo.add.tile.selectedRing}`
                      : neo.add.quickChip.shadow,
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
                      // La variante de TEXTO del clay: `quickChip.ink` es el
                      // `#C25B33` de bordes/fills, que a 12px sobre `#E9EBE0`
                      // se queda en 3.60:1. Ver `accentClayInk` en la piel.
                      color: isSelected
                        ? neo.add.tile.selectedRing
                        : neo.add.accentClayInk,
                      fontSize: neo.add.quickChip.fontSize,
                      fontWeight: '800',
                      fontFamily: neo.font('800'),
                    }
                  : null,
              ]}
              numberOfLines={1}
            >
              {option}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: { gap: 6, paddingRight: 4, alignItems: 'center' },
  bleedNeo: { marginHorizontal: -WIZARD_SHADOW_BLEED, flexGrow: 0 },
  rowNeo: { gap: 8, paddingVertical: 13, paddingHorizontal: WIZARD_SHADOW_BLEED },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: '700' },
})
