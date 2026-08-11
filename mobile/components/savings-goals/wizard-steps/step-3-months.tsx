import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { NumpadGrid } from '@/components/ui/numpad-grid'
import { useWizardSkin } from '@/components/wizard/wizard-skin'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { motionDurations, motionEasings } from '@/lib/motion/tokens'
import { neoInk } from '@/theme/neo-ink'
import { neoRadii, neoTokens, type NeoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'
import { WizardValueWell } from './wizard-value-well'

// CR Sprint D Minor #2: reuso del token central (misma curva que EXPO_OUT).
const EXPO_OUT = motionEasings.enterSmooth

export const MONTH_OPTIONS = [3, 6, 12, 24] as const
export const DEFAULT_MONTHS = 12
// 240 = 20 años. Más que eso → la meta deja de ser "objetivo a 20
// años" y entra territorio de retirement planning, no del flow.
export const MAX_CUSTOM_MONTHS = 240

export interface Step3MonthsProps {
  targetMonths: number
  customMonthsActive: boolean
  customMonthsText: string
  customMonthsNumpadExpanded: boolean
  reduceMotion: boolean
  onSelectPreset: (months: number) => void
  onToggleCustom: () => void
  onExpandCustomNumpad: () => void
  onChangeCustomText: (v: string) => void
  onCustomDone: () => void
}

export function Step3Months({
  targetMonths,
  customMonthsActive,
  customMonthsText,
  customMonthsNumpadExpanded,
  reduceMotion,
  onSelectPreset,
  onToggleCustom,
  onExpandCustomNumpad,
  onChangeCustomText,
  onCustomDone,
}: Step3MonthsProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const ink = neoInk(theme.mode)
  const skin = useWizardSkin()
  const helperInk = skin.kind === 'neo' ? skin.mutedInkStrong : neo.textMuted
  const { t } = useTranslation()
  const customDigits = customMonthsText.replace(/[^\d]/g, '')
  const customMonthsParsed = customDigits === '' ? 0 : parseInt(customDigits, 10)
  const customPlaceholder = customMonthsParsed <= 0
  return (
    <View style={styles.step3Body}>
      <View style={styles.monthsGrid}>
        {MONTH_OPTIONS.map((m) => {
          const isActive = !customMonthsActive && targetMonths === m
          return (
            <MonthChip
              key={m}
              label={t('settings:savingsWizard.monthsLabel', { count: m })}
              isActive={isActive}
              onPress={() => onSelectPreset(m)}
              accessibilityLabel={t('settings:savingsWizard.monthsLabel', { count: m })}
              neo={neo}
              accentInk={ink.accent}
              style={styles.monthsGridItem}
            />
          )
        })}
        <MonthChip
          label={t('settings:savingsWizard.custom')}
          isActive={customMonthsActive}
          onPress={onToggleCustom}
          accessibilityLabel={t('settings:savingsWizard.customA11y')}
          neo={neo}
          accentInk={ink.accent}
          style={styles.monthsGridFullRow}
        />
      </View>

      {customMonthsActive ? (
        <>
          {/* Mismo pozo que el monto del step 2: el user ve el plazo elegido
              y abre el numpad de la app (no el teclado nativo) al tocarlo. */}
          <WizardValueWell
            label={t('settings:savingsWizard.customEyebrow')}
            value={
              customPlaceholder
                ? t('settings:savingsWizard.tapToType')
                : t('settings:savingsWizard.monthsValue', { count: customMonthsParsed })
            }
            placeholder={customPlaceholder}
            expanded={customMonthsNumpadExpanded}
            onPress={onExpandCustomNumpad}
            accessibilityLabel={
              customMonthsNumpadExpanded
                ? t('settings:savingsWizard.customExpandedA11y', { count: customMonthsParsed })
                : t('settings:savingsWizard.customTapA11y', { count: customMonthsParsed })
            }
          />

          {customMonthsNumpadExpanded ? (
            <Animated.View
              entering={
                reduceMotion
                  ? FadeIn.duration(motionDurations.micro)
                  : SlideInDown.duration(motionDurations.deliberate).easing(EXPO_OUT)
              }
              exiting={
                reduceMotion
                  ? FadeOut.duration(motionDurations.micro)
                  : SlideOutDown.duration(motionDurations.exitModal).easing(EXPO_OUT)
              }
            >
              <NumpadGrid
                rawValue={customMonthsText}
                onChangeRawValue={onChangeCustomText}
                onDone={onCustomDone}
                hideDoneButton
                maxIntegerDigits={3}
                maxDecimalDigits={0}
              />
            </Animated.View>
          ) : null}

          {/* Helper bajo el numpad. Antes el clamp a 240 era silencioso
              (el `Math.min(240, value)` en el parent recortaba sin avisar)
              → el user tipeaba 999 y veía 240 sin entender por qué. Ahora
              mostramos la razón explícita y, en rango, una guía de copy. */}
          <Text style={[styles.customMonthsHelper, { color: helperInk }]}>
            {customMonthsParsed > MAX_CUSTOM_MONTHS
              ? t('settings:savingsWizard.maxMonthsHelper', { max: MAX_CUSTOM_MONTHS })
              : t('settings:savingsWizard.monthsHelper')}
          </Text>
        </>
      ) : null}
    </View>
  )
}

interface MonthChipProps {
  label: string
  isActive: boolean
  onPress: () => void
  accessibilityLabel: string
  neo: NeoTokens
  /** Tinta del chip elegido — `neoInk`, la variante corregida por contraste. */
  accentInk: string
  style?: StyleProp<ViewStyle>
}

/**
 * Chip de plazo: extruido en reposo (`raisedSm`), HUNDIDO con anillo verde
 * al elegirlo (`selectedTint` + `ringSelected`) — el recurso de "presionado"
 * del neumorfismo, el mismo que usan los tiles de categoría del alta de
 * fijos y el stepper del cupo diario. Donde el sistema descarta el
 * `boxShadow`, el anillo pasa a borde para que el elegido siga leyéndose.
 */
function MonthChip({
  label,
  isActive,
  onPress,
  accessibilityLabel,
  neo,
  accentInk,
  style,
}: MonthChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.monthChip,
        style,
        isActive
          ? { backgroundColor: neo.selectedTint, boxShadow: neo.shadows.ringSelected }
          : { backgroundColor: neo.surface, boxShadow: neo.shadows.raisedSm },
        SUPPORTS_INSET_SHADOW
          ? null
          : {
              borderWidth: isActive ? 2.5 : 1,
              borderColor: isActive ? neo.green : neo.sheetDivider,
            },
        { opacity: pressed ? 0.78 : 1 },
      ]}
    >
      <Text
        style={[styles.monthChipText, { color: isActive ? accentInk : neo.text }]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  step3Body: {
    gap: 12,
  },
  monthsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  monthsGridItem: {
    flexBasis: '47%',
    flexGrow: 1,
  },
  monthsGridFullRow: {
    flexBasis: '100%',
  },
  monthChip: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 56,
    borderRadius: neoRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthChipText: {
    fontSize: 15,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.2,
  },
  customMonthsHelper: {
    paddingHorizontal: 4,
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    lineHeight: 17,
    textAlign: 'center',
  },
})
