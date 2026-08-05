// Header genérico de wizard: back pill + título centrado + spacer derecho, y
// la barra de progreso por pasos. Extraído de `add-fijo-parts/step-header.tsx`
// sin tocar el markup: acá NO se resuelve copy ni se decide qué significa
// "volver" — el flujo que lo monta pasa el título ya traducido y el handler.
// Es lo que lo hace reusable por agregar-gasto y agregar-ingreso, que tienen
// otros títulos y otra cantidad de pasos.
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useWizardSkin } from '@/components/wizard/wizard-skin'
import { useAppTheme } from '@/theme/theme-provider'

export interface WizardHeaderProps {
  /** Ya traducido: el kit no conoce el namespace del flujo. */
  title: string
  /** Primer paso → cerrar la hoja; pasos siguientes → volver al anterior. */
  onBack: () => void
  backAccessibilityLabel: string
}

export function WizardHeader({ title, onBack, backAccessibilityLabel }: WizardHeaderProps) {
  const { theme } = useAppTheme()
  const skin = useWizardSkin()
  const neo = skin.kind === 'neo' ? skin : null
  return (
    <View style={styles.headerRow}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={backAccessibilityLabel}
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
        {title}
      </Text>
      <View style={[styles.headerRightSpacer, neo ? { width: 0 } : null]} />
    </View>
  )
}

export interface WizardDotsProps {
  /** 1-based. */
  step: number
  /** Cantidad de pasos del flujo. Default 2 (el alta de fijos). */
  total?: number
}

export function WizardDots({ step, total = 2 }: WizardDotsProps) {
  const { theme } = useAppTheme()
  const skin = useWizardSkin()
  const neo = skin.kind === 'neo' ? skin : null
  return (
    <View style={[styles.dotsRow, neo ? { gap: neo.header.progressGap, marginTop: 14 } : null]}>
      {Array.from({ length: total }, (_, i) => i + 1).map((s) => (
        <View
          key={s}
          style={[
            styles.stepBar,
            {
              backgroundColor: s <= step ? theme.colors.text : theme.colors.line,
            },
            // El progreso CODIFICA el paso: los tramos pendientes van en
            // terracota tenue (el color de "todavía no") y los cumplidos en
            // verde. No es un gris neutro — literal del handoff.
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
