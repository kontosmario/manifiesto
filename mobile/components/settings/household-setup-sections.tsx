import { useMemo, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AppSymbol } from '@/components/ui/app-symbol'
import { NeoSurface } from '@/components/ui/neo-surface'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import type {
  HouseholdSavingsPreset,
  HouseholdSavingsResearchStat,
} from '@/features/settings/household-setup-wizard.model'
import { withAlpha } from '@/theme/color-utils'
import { DEFAULT_HIT_SLOP, DEFAULT_PRESS_RETENTION_OFFSET } from '@/theme/interaction'
import { useThemeTokens } from '@/theme/theme-provider'
import { neoInk } from '@/theme/neo-ink'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { currencyFormatter } from '@/utils/money'

/**
 * Android < API 28/29 descarta el `boxShadow` (outset e inset) EN SILENCIO:
 * ahí el relieve no existe y las carcasas quedan a ~1.05:1 contra el fondo.
 * Mismo criterio que `settings-primitives`. Ver `SUPPORTS_INSET_SHADOW`.
 */
function useFlatFallback(): ViewStyle | null {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  return useMemo(
    () => (SUPPORTS_INSET_SHADOW ? null : { borderWidth: 1, borderColor: neo.sheetDivider }),
    [neo],
  )
}

/**
 * Carcasa de un paso del wizard. El título es propio de la card (no el
 * eyebrow de `SectionHeader`, que rotula secciones y no bloques): es el
 * segundo nivel de la pantalla, debajo del título del paso.
 */
export function HouseholdSetupCard({
  children,
  subtitle,
  title,
  variant = 'raisedLg',
}: {
  children: ReactNode
  subtitle?: string
  title?: string
  variant?: 'raisedLg' | 'raisedXl'
}) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const flatFallback = useFlatFallback()

  return (
    <NeoSurface radius={neoRadii.card} style={[styles.card, flatFallback]} variant={variant}>
      {title ? (
        <View style={styles.cardHeading}>
          <Text style={[styles.cardTitle, { color: neo.text }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.cardSubtitle, { color: neo.textMuted }]}>{subtitle}</Text>
          ) : null}
        </View>
      ) : null}
      {children}
    </NeoSurface>
  )
}

export function HouseholdSetupProgressCard({
  currentStep,
  subtitle,
  title,
  totalSteps,
}: {
  currentStep: number
  subtitle: string
  title: string
  totalSteps: number
}) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const ink = neoInk(theme.mode)
  const flatFallback = useFlatFallback()
  const { t } = useTranslation()

  return (
    <NeoSurface
      radius={neoRadii.card}
      style={[styles.progressCard, flatFallback]}
      variant="insetMd"
    >
      <View style={styles.progressHeader}>
        <Text style={[styles.progressEyebrow, { color: ink.accent }]}>
          {t('settings:householdSetup.stepOf', { current: currentStep, total: totalSteps })}
        </Text>
        <View style={styles.progressDots}>
          {Array.from({ length: totalSteps }).map((_, index) => {
            const isActive = index + 1 <= currentStep

            return (
              <View
                key={`setup-dot-${index + 1}`}
                style={[
                  styles.progressDot,
                  {
                    backgroundColor: isActive
                      ? ink.accent
                      : withAlpha(neo.text, theme.isDark ? 0.16 : 0.12),
                  },
                ]}
              />
            )
          })}
        </View>
      </View>
      <Text style={[styles.progressTitle, { color: neo.text }]}>{title}</Text>
      <Text style={[styles.progressSubtitle, { color: neo.textMuted }]}>{subtitle}</Text>
    </NeoSurface>
  )
}

export function HouseholdSavingsResearchPanel({
  benchmarkFund,
  note,
  stats,
}: {
  benchmarkFund: number
  note: string
  stats: readonly HouseholdSavingsResearchStat[]
}) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const ink = neoInk(theme.mode)
  const flatFallback = useFlatFallback()
  const { t } = useTranslation()

  return (
    <NeoSurface
      radius={neoRadii.card}
      style={[styles.researchCard, flatFallback]}
      variant="raisedLg"
    >
      <View style={styles.researchHeader}>
        <NeoSurface radius={neoRadii.pill} style={styles.researchIconWrap} variant="raisedSm">
          <AppSymbol
            color={ink.accent}
            fallback="insights"
            name="chart.bar.doc.horizontal.fill"
            size={18}
          />
        </NeoSurface>
        <View style={styles.researchCopy}>
          <Text style={[styles.researchTitle, { color: neo.text }]}>
            {t('settings:householdSetup.researchTitle')}
          </Text>
          <Text style={[styles.researchSubtitle, { color: neo.textMuted }]}>
            {t('settings:householdSetup.researchSubtitle')}
          </Text>
        </View>
      </View>

      <View style={styles.researchStats}>
        {stats.map((stat) => (
          <NeoSurface
            key={stat.label}
            radius={neoRadii.tile}
            style={[styles.researchStat, flatFallback]}
            variant="insetSm"
          >
            <Text style={[styles.researchValue, { color: ink.accent }]}>{stat.value}</Text>
            <Text style={[styles.researchLabel, { color: neo.text }]}>{stat.label}</Text>
            <Text style={[styles.researchDetail, { color: neo.textMuted }]}>{stat.detail}</Text>
            <Text style={[styles.researchSource, { color: neo.textMuted }]}>{stat.source}</Text>
          </NeoSurface>
        ))}
      </View>

      <Text style={[styles.benchmarkText, { color: neo.text }]}>
        {t('settings:householdSetup.benchmarkText', {
          amount: currencyFormatter.format(benchmarkFund || 0),
        })}
      </Text>
      <Text style={[styles.researchNote, { color: neo.textMuted }]}>{note}</Text>
    </NeoSurface>
  )
}

/**
 * En el vocabulario neo el preset elegido no se marca con un borde de
 * acento: se HUNDE (`ringSelected`, pozo + anillo verde) contra el relieve
 * `raisedMd` de los otros. El `Pressable` queda por fuera de la superficie
 * para que la opacidad del press atenúe también el relieve.
 *
 * El pozo va SIN el `selectedTint` que suele acompañar al anillo: sobre el
 * tinte compuesto el helper de 12px cae a 3.58:1 en oscuro, y el anillo ya
 * marca la selección por sí solo (4.01:1 claro / 8.98:1 oscuro).
 */
export function HouseholdSavingsPresetCard({
  isSelected,
  onPress,
  preset,
}: {
  isSelected: boolean
  onPress: () => void
  preset: HouseholdSavingsPreset
}) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const ink = neoInk(theme.mode)
  const { t } = useTranslation()
  const presetFallback = useMemo<ViewStyle | null>(
    () =>
      SUPPORTS_INSET_SHADOW
        ? null
        : { borderWidth: 1.5, borderColor: isSelected ? neo.green : neo.sheetDivider },
    [isSelected, neo],
  )

  return (
    <Pressable
      accessibilityLabel={t('settings:householdSetup.usePresetA11y', { title: preset.title })}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      hitSlop={DEFAULT_HIT_SLOP}
      onPress={onPress}
      pressRetentionOffset={DEFAULT_PRESS_RETENTION_OFFSET}
      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
    >
      <NeoSurface
        radius={neoRadii.tile}
        style={[styles.presetCard, presetFallback]}
        variant={isSelected ? 'ringSelected' : 'raisedMd'}
      >
        <View style={styles.presetHeader}>
          <View style={styles.presetTitleWrap}>
            <Text style={[styles.presetTitle, { color: neo.text }]}>{preset.title}</Text>
            <Text style={[styles.presetMix, { color: neo.textMuted }]}>
              50 / {preset.flexiblePercent} / {preset.savingsPercent}
            </Text>
          </View>
          <View style={styles.presetValueWrap}>
            <Text style={[styles.presetPercent, { color: ink.accent }]}>
              {preset.savingsPercent}%
            </Text>
            <Text style={[styles.presetValue, { color: neo.textMuted }]}>
              {currencyFormatter.format(preset.monthlyGoal)}
            </Text>
          </View>
        </View>
        <Text style={[styles.presetSubtitle, { color: neo.textMuted }]}>{preset.subtitle}</Text>
        <Text style={[styles.presetHelper, { color: neo.textMuted }]}>{preset.helper}</Text>
      </NeoSurface>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    gap: 18,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  cardHeading: {
    gap: 4,
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    lineHeight: 18,
  },
  progressCard: {
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  progressHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  progressEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  progressDots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  progressDot: {
    borderRadius: neoRadii.pill,
    height: 8,
    width: 24,
  },
  progressTitle: {
    fontSize: 24,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.6,
  },
  progressSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    fontFamily: nunitoFamily('400'),
    lineHeight: 20,
  },
  researchCard: {
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  researchHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  researchIconWrap: {
    alignItems: 'center',
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  researchCopy: {
    flex: 1,
    gap: 2,
  },
  researchTitle: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  researchSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    fontFamily: nunitoFamily('400'),
    lineHeight: 18,
  },
  researchStats: {
    gap: 10,
  },
  researchStat: {
    gap: 2,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  researchValue: {
    fontSize: 24,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.6,
  },
  researchLabel: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  researchDetail: {
    fontSize: 13,
    fontWeight: '400',
    fontFamily: nunitoFamily('400'),
    lineHeight: 18,
  },
  researchSource: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    letterSpacing: 0.4,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  benchmarkText: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  researchNote: {
    fontSize: 12,
    fontWeight: '400',
    fontFamily: nunitoFamily('400'),
    lineHeight: 18,
  },
  presetCard: {
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  presetHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  presetTitleWrap: {
    flex: 1,
    gap: 4,
  },
  presetTitle: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  presetMix: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    letterSpacing: 0.3,
  },
  presetValueWrap: {
    alignItems: 'flex-end',
    gap: 2,
  },
  presetPercent: {
    fontSize: 22,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.5,
  },
  presetValue: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
  presetSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    fontFamily: nunitoFamily('400'),
    lineHeight: 18,
  },
  presetHelper: {
    fontSize: 12,
    fontWeight: '400',
    fontFamily: nunitoFamily('400'),
    lineHeight: 17,
  },
})
