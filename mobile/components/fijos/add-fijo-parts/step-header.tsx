// Header del wizard add-fijo: back pill + title centrado + spacer
// derecho. Step 1 → back cierra el sheet; step 2 → back vuelve al
// step 1. Y los dots de progreso. Extraído de `add-fijo-v2-screen.tsx`.
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'
import { useFijosSkin } from '@/components/fijos/fijos-skin'
import { useAppTheme } from '@/theme/theme-provider'

type Step = 1 | 2

export interface StepHeaderProps {
  step: Step
  isEditing: boolean
  /** Step 1 → close sheet. Step 2 → back to step 1. */
  onBack: () => void
}

export function StepHeader({ step, isEditing, onBack }: StepHeaderProps) {
  const { theme } = useAppTheme()
  const skin = useFijosSkin()
  const neo = skin.kind === 'neo' ? skin : null
  const { t } = useTranslation()
  const stepTitle =
    step === 1
      ? isEditing
        ? t('fijos:wizard.stepEdit')
        : t('fijos:wizard.stepNew')
      : t('fijos:wizard.stepReview')
  return (
    <View style={styles.headerRow}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={
          step === 2 ? t('fijos:wizard.backToPrevious') : t('fijos:wizard.close')
        }
        style={[
          styles.backPill,
          { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
          // Handoff: 44×44 circular, ELEVADO y sin borde.
          neo
            ? {
                width: neo.header.backSize,
                height: neo.header.backSize,
                borderWidth: 0,
                backgroundColor: neo.header.backBackground,
                experimental_backgroundImage: neo.header.backGradientCss,
                boxShadow: neo.header.backShadow,
              }
            : null,
        ]}
        hitSlop={10}
      >
        <MaterialIcons
          name="arrow-back-ios-new"
          size={18}
          color={neo ? neo.ink.title : theme.colors.text}
        />
      </Pressable>
      <Text
        style={[
          styles.title,
          { color: theme.colors.text },
          neo ? { ...neo.header.title, color: neo.ink.title } : null,
        ]}
      >
        {stepTitle}
      </Text>
      <View style={[styles.headerRightSpacer, neo ? { width: 0 } : null]} />
    </View>
  )
}

export function StepDots({ step }: { step: Step }) {
  const { theme } = useAppTheme()
  const skin = useFijosSkin()
  const neo = skin.kind === 'neo' ? skin : null
  return (
    <View style={[styles.dotsRow, neo ? { gap: neo.header.progressGap, marginTop: 14 } : null]}>
      {[1, 2].map((s) => (
        <View
          key={s}
          style={[
            styles.stepBar,
            {
              backgroundColor: s <= step ? theme.colors.text : theme.colors.line,
            },
            // El progreso CODIFICA el paso: en el 1 el tramo pendiente va en
            // terracota tenue (el color de "todavía no"), y al llegar al 2 los
            // dos quedan verdes. No es un gris neutro — literal del handoff.
            neo
              ? {
                  height: neo.header.progressHeight,
                  backgroundColor:
                    s <= step ? neo.header.progressDone : neo.header.progressPending,
                }
              : null,
          ]}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    // Matches el breathing room que el standard Screen header da
    // (Screen paddingTop=4 + ScreenHeader paddingTop=10 = 14pt).
    marginTop: 14,
  },
  backPill: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 22, fontWeight: '800', letterSpacing: -0.6 },
  headerRightSpacer: { width: 40 },
  dotsRow: { flexDirection: 'row', gap: 6 },
  stepBar: { flex: 1, height: 3, borderRadius: 2 },
})
