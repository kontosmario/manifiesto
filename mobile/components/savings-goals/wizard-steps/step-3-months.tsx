import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { NumpadGrid } from '@/components/ui/numpad-grid'
import { motionEasings } from '@/lib/motion/tokens'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

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
  const { theme } = useAppTheme()
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
              label={`${m} meses`}
              isActive={isActive}
              onPress={() => onSelectPreset(m)}
              accessibilityLabel={`${m} meses`}
              theme={theme}
              style={styles.monthsGridItem}
            />
          )
        })}
        <MonthChip
          label="Personalizado"
          isActive={customMonthsActive}
          onPress={onToggleCustom}
          accessibilityLabel="Plazo personalizado"
          theme={theme}
          style={styles.monthsGridFullRow}
        />
      </View>

      {customMonthsActive ? (
        <>
          {/* Display tappable — mismo pattern que el monto del step 2.
              El user ve el plazo elegido y abre el numpad al tap.
              Usamos el numpad custom de la app (no teclado nativo). */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              customMonthsNumpadExpanded
                ? `Plazo personalizado. Valor actual ${customMonthsParsed} meses`
                : `Toca para editar plazo personalizado. Valor actual ${customMonthsParsed} meses`
            }
            accessibilityState={{ expanded: customMonthsNumpadExpanded }}
            onPress={() => {
              if (!customMonthsNumpadExpanded) {
                onExpandCustomNumpad()
              }
            }}
            style={({ pressed }) => [
              styles.displayCard,
              {
                backgroundColor: theme.colors.surfaceMuted,
                borderColor: theme.colors.border,
                opacity: pressed && !customMonthsNumpadExpanded ? 0.85 : 1,
              },
            ]}
          >
            <Text
              style={[
                typography.eyebrow,
                styles.displayEyebrow,
                { color: theme.colors.textMuted },
              ]}
            >
              PLAZO PERSONALIZADO
            </Text>
            <View style={styles.displayValueRow}>
              <Text
                numberOfLines={1}
                style={[
                  typography.metricLarge,
                  styles.displayValue,
                  {
                    color: customPlaceholder
                      ? theme.colors.textSoft
                      : theme.colors.text,
                  },
                ]}
              >
                {customPlaceholder
                  ? 'Toca para tipear'
                  : `${customMonthsParsed} ${customMonthsParsed === 1 ? 'mes' : 'meses'}`}
              </Text>
              {!customMonthsNumpadExpanded ? (
                <View
                  style={[
                    styles.displayEditChip,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <MaterialIcons
                    name="edit"
                    size={14}
                    color={theme.colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.displayEditChipText,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    Editar
                  </Text>
                </View>
              ) : null}
            </View>
          </Pressable>

          {customMonthsNumpadExpanded ? (
            <Animated.View
              entering={
                reduceMotion
                  ? FadeIn.duration(120)
                  : SlideInDown.duration(320).easing(EXPO_OUT)
              }
              exiting={
                reduceMotion
                  ? FadeOut.duration(120)
                  : SlideOutDown.duration(220).easing(EXPO_OUT)
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

          {/* Helper text bajo el numpad. Antes el clamp a 240 era silencioso
              (el `Math.min(240, value)` en el parent recortaba sin avisar)
              → el user tipeaba 999 y veía 240 sin entender por qué. Ahora
              mostramos la razón explícita y, en rango, una guía de copy. */}
          <Text
            style={[
              typography.caption,
              styles.customMonthsHelper,
              { color: theme.colors.textMuted },
            ]}
          >
            {customMonthsParsed > MAX_CUSTOM_MONTHS
              ? `Máximo ${MAX_CUSTOM_MONTHS} meses (20 años) — valor ajustado.`
              : 'Cuántos meses hasta llegar a la meta.'}
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
  theme: ReturnType<typeof useAppTheme>['theme']
  style?: object
}

function MonthChip({
  label,
  isActive,
  onPress,
  accessibilityLabel,
  theme,
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
        {
          backgroundColor: isActive
            ? theme.colors.primary
            : theme.isDark
              ? 'rgba(255,255,255,0.05)'
              : 'rgba(15,42,30,0.04)',
          borderColor: isActive ? theme.colors.primary : theme.colors.line,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.monthChipText,
          {
            color: isActive
              ? theme.isDark
                ? theme.colors.background
                : '#FFFFFF'
              : theme.colors.text,
          },
        ]}
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
    gap: 10,
  },
  monthsGridItem: {
    flexBasis: '48%',
    flexGrow: 1,
  },
  monthsGridFullRow: {
    flexBasis: '100%',
  },
  monthChip: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 56,
    borderRadius: radii.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthChipText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  // ── Shared display card (mirrors step-2-amount; kept inline so each
  //    step file is self-contained — the duplication is tiny and the
  //    coupling cost of sharing isn't worth it for 2 callers).
  displayCard: {
    borderRadius: radii['2xl'],
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 6,
  },
  displayEyebrow: {
    letterSpacing: 1.4,
  },
  displayValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  displayValue: {
    flex: 1,
    letterSpacing: -1.2,
  },
  displayEditChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  displayEditChipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  customMonthsHelper: {
    paddingHorizontal: 4,
    marginTop: 10,
    textAlign: 'center',
  },
})
