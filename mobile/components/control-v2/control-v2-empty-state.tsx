import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { RiseView } from '@/components/home/animated/rise-view'
import { usePressScale } from '@/hooks/use-press-scale'
import { useAppTheme } from '@/theme/theme-provider'

interface ControlV2EmptyStateProps {
  /** True si el usuario aún no configuró su sueldo mensual. */
  missingIncome: boolean
  /** True si el usuario aún no registró ningún gasto. */
  missingExpenses: boolean
  onPressSetupIncome: () => void
  onPressAddExpense: () => void
}

/**
 * Vista del Control para cuentas recién creadas.
 *
 * La otra versión llamaba a `buildControlSignals` con un dataset mock
 * si faltaban ingreso/gastos — eso pintaba en pantalla cupos, rachas
 * y promedios que no eran del usuario. Aquí devolvemos una vista
 * neutra que explica por qué no hay datos todavía y guía al próximo
 * paso según lo que falte.
 */
export function ControlV2EmptyState({
  missingIncome,
  missingExpenses,
  onPressSetupIncome,
  onPressAddExpense,
}: ControlV2EmptyStateProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  // Dark: muted surface (#0F2E1F) to match the rest of the near-black
  // Control canvas — was hardcoded to the old creamCard dark (#305A47),
  // which now reads too bright. Light keeps the cream shell.
  const shellBg = theme.isDark ? theme.colors.surfaceMuted : '#FFFBF2'  // surfaceMuted dark / cream light
  const shellBorder = theme.isDark ? '#244235' : '#D5E6DF'  // V1 surface-900 / surface-200
  const accent = theme.colors.text
  const muted = theme.colors.textMuted
  // Press scale 0.97 — primary CTA del empty state, lo único interactivo.
  const ctaPress = usePressScale({ pressedScale: 0.97 })

  const heading = missingIncome
    ? t('control:empty.headingMissingIncome')
    : missingExpenses
      ? t('control:empty.headingMissingExpenses')
      : t('control:empty.headingGathering')

  const subtitle = missingIncome
    ? t('control:empty.subtitleMissingIncome')
    : missingExpenses
      ? t('control:empty.subtitleMissingExpenses')
      : t('control:empty.subtitleGathering')

  return (
    <RiseView delay={80}>
      <View
        style={[
          styles.card,
          { backgroundColor: shellBg, borderColor: shellBorder },
        ]}
      >
        <View style={[styles.iconCircle, { borderColor: theme.colors.line }]}>
          <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
            <Path
              d="M12 5v14M5 12h14"
              stroke={accent}
              strokeWidth={2.4}
              strokeLinecap="round"
            />
          </Svg>
        </View>

        <Text style={[styles.title, { color: accent }]}>{heading}</Text>
        <Text style={[styles.body, { color: muted }]}>{subtitle}</Text>

        <View style={styles.ctas}>
          {missingIncome ? (
            <Pressable
              onPress={onPressSetupIncome}
              onPressIn={ctaPress.onPressIn}
              onPressOut={ctaPress.onPressOut}
              accessibilityRole="button"
              accessibilityLabel={t('control:empty.a11ySetupIncome')}
            >
              <Animated.View
                style={[styles.primaryBtn, { backgroundColor: accent }, ctaPress.animatedStyle]}
              >
                <Text style={[styles.primaryText, { color: theme.colors.creamCard }]}>
                  {t('control:empty.ctaSetupIncome')}
                </Text>
              </Animated.View>
            </Pressable>
          ) : (
            <Pressable
              onPress={onPressAddExpense}
              onPressIn={ctaPress.onPressIn}
              onPressOut={ctaPress.onPressOut}
              accessibilityRole="button"
              accessibilityLabel={t('control:empty.a11yAddExpense')}
            >
              <Animated.View
                style={[styles.primaryBtn, { backgroundColor: accent }, ctaPress.animatedStyle]}
              >
                <Text style={[styles.primaryText, { color: theme.colors.creamCard }]}>
                  {t('control:empty.ctaAddExpense')}
                </Text>
              </Animated.View>
            </Pressable>
          )}
        </View>

        <View style={[styles.checklist, { borderTopColor: theme.colors.line }]}>
          <ChecklistRow
            done={!missingIncome}
            text={t('control:empty.checklistIncome')}
            textColor={accent}
            mutedColor={muted}
            accentColor={accent}
          />
          <ChecklistRow
            done={!missingExpenses}
            text={t('control:empty.checklistExpense')}
            textColor={accent}
            mutedColor={muted}
            accentColor={accent}
          />
        </View>
      </View>
    </RiseView>
  )
}

function ChecklistRow({
  done,
  text,
  textColor,
  mutedColor,
  accentColor,
}: {
  done: boolean
  text: string
  textColor: string
  mutedColor: string
  accentColor: string
}) {
  return (
    <View style={styles.checklistRow}>
      <View
        style={[
          styles.checkCircle,
          {
            borderColor: done ? accentColor : mutedColor,
            backgroundColor: done ? accentColor : 'transparent',
          },
        ]}
      >
        {done ? (
          <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
            <Path
              d="M5 12l4 4 10-10"
              stroke="#FFFBF2"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        ) : null}
      </View>
      <Text
        style={[
          styles.checklistText,
          { color: done ? textColor : mutedColor, opacity: done ? 1 : 0.8 },
        ]}
      >
        {text}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    gap: 14,
    alignItems: 'flex-start',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 26,
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  ctas: {
    width: '100%',
    marginTop: 4,
  },
  primaryBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  checklist: {
    width: '100%',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 14,
    marginTop: 6,
    gap: 10,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkCircle: {
    width: 20,
    height: 20,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checklistText: {
    fontSize: 13,
    fontWeight: '600',
  },
})
