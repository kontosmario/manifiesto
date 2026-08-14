import { memo } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import { BrotParticles } from '@/components/brot/brot-particles'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { FloatView } from '@/components/home/animated/float-view'
import { GoalIcon } from '@/components/savings-goals/goal-icon'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import type { SavingsGoal } from '@/features/savings-goals/savings-goal.model'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { withAlpha } from '@/theme/color-utils'
import { cssGradient, neoParticlePresets, neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'
import { formatMoneyShort } from '@/utils/money'

interface MetaCardNeoProps {
  goal: SavingsGoal
}

/**
 * Hero de la pantalla de meta de ahorro, en el vocabulario neumórfico:
 * superficie de gradiente + `shadows.hero`, radio `neoRadii.hero`, cifra
 * en 900 con tracking negativo y el progreso como POZO (`well` + inset)
 * con fill verde del sistema.
 *
 * Gradiente por tema — en OSCURO es `heroGradientCss` literal. En CLARO
 * el hero del sistema abre en `#337B39` y cierra en `#5FAC64`: sobre ese
 * tramo claro ni la tinta crema (`heroText`, 2.51:1 contra el último
 * stop) ni el verde pálido (`heroGreen`) llegan a AA, y esta pantalla
 * apoya texto chico —el objetivo, el porcentaje— sobre toda la altura de
 * la card. Así que en claro el par sale del extremo PROFUNDO del mismo
 * vocabulario (`text` #24382A → `greenDeep` #1F5429): mismo material,
 * misma familia de verde, y el peor punto del gradiente da 8:1 con la
 * tinta crema, 7.2:1 con `heroGreen` y 5.9:1 con `heroTextSoft`.
 *
 * La barra usa `well` como canal y `green` como fill (4.29:1 claro /
 * 10.8:1 oscuro entre uno y otro, arriba del 3:1 que pide un elemento
 * gráfico). El canal ya tiene fondo propio, así que donde el sistema
 * descarta el `boxShadow` inset (`SUPPORTS_INSET_SHADOW`) no desaparece:
 * pierde el relieve, no el límite — por eso el fallback es sólo el
 * anillo hairline y no un borde en toda la card.
 */
function MetaCardNeoImpl({ goal }: MetaCardNeoProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const isDark = theme.mode === 'dark'
  const reduced = useReducedMotion()
  const { t } = useTranslation()

  const pct =
    goal.goalAmount > 0
      ? Math.min(100, Math.round((goal.currentAmount / goal.goalAmount) * 100))
      : 0
  const remaining = Math.max(0, goal.goalAmount - goal.currentAmount)
  const isComplete = pct >= 100 && goal.currentAmount > 0

  const chipLabel = isComplete
    ? t('home:metaCard.complete')
    : goal.targetMonths != null
      ? t('home:metaCard.chipWithMonths', {
          pct,
          months: t('home:metaCard.months', { count: goal.targetMonths }),
        })
      : t('home:metaCard.chipAchieved', { pct })

  const heroCss = isDark
    ? neo.heroGradientCss
    : `linear-gradient(155deg, ${neo.text} 0%, ${neo.greenDeep} 100%)`
  const heroFallback = isDark ? neo.heroGradient[1] : neo.greenDeep

  return (
    <View
      accessibilityLabel={
        isComplete
          ? t('home:metaCard.completeAccessibility', { title: goal.title })
          : t('home:metaCard.progressAccessibility', {
              title: goal.title,
              pct,
              remaining: formatMoneyShort(remaining),
            })
      }
      style={[
        styles.card,
        cssGradient(heroCss, heroFallback),
        { boxShadow: neo.shadows.hero },
      ]}
    >
      <BrotParticles
        colors={neoParticlePresets.hero.colors}
        count={neoParticlePresets.hero.count}
        borderRadius={neoRadii.hero}
        animated={!reduced}
      />

      <View style={styles.topRow}>
        <Text
          numberOfLines={1}
          style={[styles.eyebrow, { color: neo.heroGreen }]}
        >
          {t('home:metaCard.eyebrow', { title: goal.title.toUpperCase() })}
        </Text>
        <View
          style={[
            styles.chip,
            { backgroundColor: withAlpha(neo.heroText, 0.16) },
          ]}
        >
          <Text style={[styles.chipText, { color: neo.heroText }]}>
            {chipLabel}
          </Text>
        </View>
      </View>

      <View style={styles.amountRow}>
        <View style={styles.amountCol}>
          <CountUpText
            value={goal.currentAmount}
            format={(n) => formatMoneyShort(n)}
            style={[styles.amount, { color: neo.heroText }]}
          />
          <Text style={[styles.objective, { color: neo.heroTextSoft }]}>
            {t('home:metaCard.objective', {
              amount: formatMoneyShort(goal.goalAmount),
            })}
          </Text>
        </View>
        <FloatView amplitude={4} periodMs={3000}>
          <GoalIcon value={goal.emoji} size={44} />
        </FloatView>
      </View>

      <View
        style={[
          styles.track,
          {
            backgroundColor: neo.well,
            boxShadow: neo.shadows.insetSm,
            borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1,
            borderColor: neo.sheetDivider,
          },
        ]}
      >
        <View
          style={[
            styles.trackFill,
            { width: `${pct}%` as `${number}%`, backgroundColor: neo.green },
          ]}
        />
      </View>

      <Text numberOfLines={1} style={[styles.footer, { color: neo.heroTextSoft }]}>
        {isComplete ? (
          <>
            <Text style={[styles.footerStrong, { color: neo.heroGreen }]}>
              {t('home:metaCard.youDidIt')}
            </Text>{' '}
            {t('home:metaCard.enjoyGoal')}
          </>
        ) : (
          <>
            {t('home:metaCard.remaining')}{' '}
            <Text style={[styles.footerStrong, { color: neo.heroText }]}>
              {formatMoneyShort(remaining)}
            </Text>
          </>
        )}
      </Text>
    </View>
  )
}

export const MetaCardNeo = memo(MetaCardNeoImpl)

const styles = StyleSheet.create({
  // Sin `overflow: 'hidden'`: en iOS activa `masksToBounds` y el layer recorta
  // su propia `shadows.hero`, así que el relieve se leía como un filo cuadrado.
  // Las partículas ya se clipean solas (`BrotParticles borderRadius`).
  card: {
    borderRadius: neoRadii.hero,
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 14,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  eyebrow: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: 1.6,
  },
  chip: {
    borderRadius: neoRadii.chip,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 0.4,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  amountCol: {
    flex: 1,
    minWidth: 0,
  },
  amount: {
    fontSize: 38,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -1.4,
    lineHeight: 44,
  },
  objective: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    marginTop: 2,
  },
  track: {
    height: 12,
    borderRadius: 999,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: 999,
    minWidth: 4,
  },
  footer: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
  footerStrong: {
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
})
