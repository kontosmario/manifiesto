import { memo, useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { LinearGradient } from 'expo-linear-gradient'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { RiseView } from '@/components/home/animated/rise-view'
import { CardParticles } from '@/components/ui/card-particles'
import type { HomeHeroMetrics } from '@/features/home/use-home-metrics'
import type { SavingsHeroChip } from '@/components/home/home-hero-savings-helpers'
import { usePressScale } from '@/hooks/use-press-scale'
import { formatMoney, formatMoneyShort, formatUsd } from '@/utils/money'
import { formatProjectionWaitCopy } from '@/components/home/projection-wait-copy'
import { useAppTheme } from '@/theme/theme-provider'
import { decorativeDurations, motionEasings } from '@/lib/motion/tokens'

interface HomeHeroCardProps {
  data: HomeHeroMetrics
  /** Optional handler invoked when the hero is in the
   *  "income not configured" state and the user taps the setup CTA. */
  onPressConfigureIncome?: () => void
  /** Handler del estado vacío en modo INGRESO DINÁMICO ("Cargá tu
   *  primer ingreso") — navega a add-income en vez de Settings. */
  onPressAddIncome?: () => void
  /** Sprint 3 — fraction vs prior cycle (e.g. -0.08 = "-8%"). When
   *  provided and the projection is reliable, the projection tile
   *  renders an arrow + signed % below the main value. `null` hides
   *  the line — used when there's no prior-cycle baseline yet. */
  projectedCloseTrend?: number | null
  /** Read-only "Apartando ahorro" chip. Surfaces the configured
   *  monthly savings target and how much of it survived the cycle's
   *  variable spending. `null` hides the chip — used when savings
   *  isn't configured or income is missing. */
  savingsChip?: SavingsHeroChip | null
  /** Equivalente del saldo en dólares. Render como una línea susurro bajo el
   *  monto, SOLO cuando la conversión está activa y hay un rate real. `null` =
   *  no se muestra (loading / off / sin moneda / USD). El valor del dólar NO se
   *  muestra aquí (vive en el sheet de Settings). */
  usdConversion?: { saldoUsd: number } | null
}

/**
 * Redesigned Home hero. Same visual language as FijosHeroCard — gradient
 * shell, diagonal shine, breathing status dot, CountUpText for money.
 * The two side tiles split the single "available today" figure into
 * "puedes gastar por día" (accent) and "vas a cerrar con" (neutral).
 */
function HomeHeroCardImpl({
  data,
  onPressConfigureIncome,
  onPressAddIncome,
  projectedCloseTrend = null,
  savingsChip = null,
  usdConversion = null,
}: HomeHeroCardProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  // Modo dinámico sin ingresos cargados este ciclo → estado vacío con
  // CTA a add-income (el setup clásico empuja a configurar SUELDO, que
  // es justo lo que este hogar no tiene).
  const dynamicSetup =
    data.incomeConfigured && data.incomeMode === 'dynamic' && !data.hasCycleIncome
  const showSetup = !data.incomeConfigured || dynamicSetup
  const projPositive = data.projectedClose >= 0
  const projColor = projPositive ? theme.colors.heroAccent : '#F8D1C3'

  // Day chip swaps to a warning state when the user hasn't confirmed
  // their cobro after payday. The neutral "día N de M" copy is
  // replaced by either "Cobra hoy" (payday is today) or "+N {día/días}
  // sin cobrar" with a warm peach tint. The chip is informational
  // only — taps live on the FamilyStrip pill — so it pulses gently
  // to communicate the warning without inviting interaction.
  const dayChipLabel = data.paydayPending
    ? data.paydayDaysOverdue <= 0
      ? t('home:hero.payToday')
      : t('home:hero.daysOverdue', { count: data.paydayDaysOverdue })
    : t('home:hero.cycleDay', {
        day: data.cycleDay,
        total: data.cycleTotalDays,
      })

  // Subtle scale pulse for the warning chip. Only animates when
  // pending; gets parked at 1 with reduced motion. Layout-safe
  // because we transform via scale (no width/height changes).
  const pulseScale = useSharedValue(1)
  useEffect(() => {
    if (!data.paydayPending || reduceMotion) {
      pulseScale.value = 1
      return
    }
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: decorativeDurations.pulse, easing: motionEasings.warm }),
        withTiming(1, { duration: decorativeDurations.pulse, easing: motionEasings.warm }),
      ),
      -1,
      false,
    )
    return () => {
      // Stop the pulse on unmount or when payday confirms — leaving
      // the worklet driver alive after the component is gone leaks
      // a UI-runtime allocation per mount cycle.
      cancelAnimation(pulseScale)
    }
  }, [data.paydayPending, reduceMotion, pulseScale])
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }))

  // Press feedback para el estado setup. Hero card per se no es
  // tappable en steady state — solo el CTA inferior. Cuando el income
  // no está configurado, el card entero ES el tap-target (Pressable
  // wrap exterior). usePressScale lo hace sentir responsive (Emil:
  // "buttons must feel responsive"); reemplaza el opacity-only que
  // estaba antes (no daba sensación de press).
  const setupPress = usePressScale({ pressedScale: 0.98 })

  // Compose a single accessibility label for the whole card so screen
  // readers announce it as a summary unit rather than reading each
  // chip / number / chip in document order. The fall-through for the
  // setup state stays simple — there's no number to announce yet.
  const a11yLabel = !showSetup
    ? `${t('home:hero.a11yBalance', { amount: formatMoney(data.availableToday) })} ${
        data.dailyBudget != null
          ? t('home:hero.a11yDailyAllowance', { amount: formatMoney(data.dailyBudget) })
          : ''
      } ${
        data.projectionReliable && data.projectedClose != null
          ? t('home:hero.a11yProjectedClose', { amount: formatMoney(data.projectedClose) })
          : ''
      } ${savingsChip ? savingsChip.a11y : ''} ${
        usdConversion ? t('home:hero.a11yUsdEquivalent', { amount: formatUsd(usdConversion.saldoUsd) }) : ''
      }`.trim()
    : dynamicSetup
      ? t('home:hero.dynamicSetupA11y')
      : t('home:hero.setupA11y')

  return (
    <RiseView delay={60}>
      <LinearGradient
        colors={[...theme.colors.heroGradient] as unknown as readonly [string, string, ...string[]]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[styles.card, { borderColor: 'rgba(166,239,143,0.12)' }]}
        accessible
        accessibilityRole="summary"
        accessibilityLabel={a11yLabel}
      >
        {/* Campo de luciérnagas sobre el gradiente forest, bajo el contenido.
            Un solo wave compartido + phase por partícula → 1 worklet (ver
            card-particles.tsx). Sin aurora ni shine: la Home queda alineada con
            el resto de los heroes (todos forest plano). */}
        <CardParticles count={12} accentColor="#F2A78C" />

        {showSetup ? (
          // Setup state — no monthly income on file (o modo dinámico
          // sin ingresos cargados). Showing "$0 de saldo" is
          // misleading; instead we surface a clear CTA: Settings para
          // configurar sueldo (fixed) o add-income para cargar el
          // primer ingreso (dynamic). Keeps the hero chrome (gradient,
          // shine, aurora) so the user lands on a familiar surface.
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              dynamicSetup
                ? t('home:hero.addIncomeAccessibility')
                : t('home:hero.configureIncomeAccessibility')
            }
            onPress={dynamicSetup ? (onPressAddIncome ?? onPressConfigureIncome) : onPressConfigureIncome}
            onPressIn={setupPress.onPressIn}
            onPressOut={setupPress.onPressOut}
          >
            <Animated.View style={setupPress.animatedStyle}>
              <RiseView>
                <View style={styles.labelRow}>
                  <View style={styles.labelLeft}>
                    <BreatheDot
                      size={8}
                      color={theme.colors.heroAccent}
                      glow={theme.colors.heroAccent}
                    />
                    <Text
                      style={[styles.label, { color: theme.colors.heroAccent }]}
                    >
                      {t('home:hero.startHere')}
                    </Text>
                  </View>
                </View>
              </RiseView>
              <RiseView delay={80}>
                <Text
                  style={[
                    styles.setupTitle,
                    { color: theme.colors.heroText },
                  ]}
                >
                  {dynamicSetup ? t('home:hero.dynamicSetupTitle') : t('home:hero.setupTitle')}
                </Text>
                <Text
                  style={[
                    styles.setupBody,
                    { color: theme.colors.heroMuted },
                  ]}
                >
                  {dynamicSetup ? t('home:hero.dynamicSetupBody') : t('home:hero.setupBody')}
                </Text>
              </RiseView>
              <RiseView delay={160}>
                <View
                  style={[
                    styles.setupCta,
                    {
                      backgroundColor: 'rgba(166,239,143,0.16)',
                      borderColor: 'rgba(166,239,143,0.35)',
                    },
                  ]}
                >
                  <Text
                    style={[styles.setupCtaText, { color: theme.colors.heroAccent }]}
                  >
                    {dynamicSetup ? t('home:hero.addFirstIncome') : t('home:hero.configureNow')}
                  </Text>
                  <MaterialIcons
                    name="arrow-forward"
                    size={16}
                    color={theme.colors.heroAccent}
                  />
                </View>
              </RiseView>
            </Animated.View>
          </Pressable>
        ) : (
        <>
        <RiseView delay={40}>
          {/*
            Top row: label on the left, compact day-counter chip on
            the right (mirrors the GastosHeroCard pattern). The
            cycle-month range was dropped — it added noise without
            any decision-making value; users navigate to "Insights"
            for the full cycle context.
          */}
          <View style={styles.labelRow}>
            <View style={styles.labelLeft}>
              <BreatheDot
                size={8}
                color={theme.colors.heroAccent}
                glow={theme.colors.heroAccent}
              />
              <Text style={[styles.label, { color: theme.colors.heroAccent }]}>
                {data.incomeMode === 'dynamic'
                  ? // Dinámico: la ventana es el CICLO elegido (semana /
                    // quincena / mes) — "del mes" quedaba impreciso.
                    t('home:hero.cycleBalance')
                  : t('home:hero.monthBalance')}
              </Text>
            </View>
            {data.paydayPending ? (
              // Warning chip — peach tint, breathing dot, slow scale
              // pulse. Read-only by design: tap-to-confirm lives on
              // the FamilyStrip pill so we don't double up on
              // interactive surfaces in the same row.
              <Animated.View
                accessibilityRole="text"
                accessibilityLabel={dayChipLabel}
                style={[
                  styles.dayChip,
                  styles.dayChipPending,
                  {
                    backgroundColor: 'rgba(242,167,140,0.18)',
                    borderColor: 'rgba(242,167,140,0.55)',
                  },
                  pulseStyle,
                ]}
              >
                <BreatheDot size={6} color="#F2EAD3" glow="#F2A78C" />
                <Text style={[styles.dayChipText, { color: '#F2EAD3' }]}>
                  {dayChipLabel}
                </Text>
              </Animated.View>
            ) : (
              <View
                style={[
                  styles.dayChip,
                  {
                    backgroundColor: 'rgba(242,167,140,0.20)',
                    borderColor: 'rgba(242,167,140,0.45)',
                  },
                ]}
              >
                <Text style={[styles.dayChipText, { color: theme.colors.heroText }]}>
                  {dayChipLabel}
                </Text>
              </View>
            )}
          </View>
        </RiseView>

        <RiseView delay={80}>
          <CountUpText
            value={data.availableToday}
            flourish
            glowColor={theme.colors.heroAccent}
            format={(n) => formatMoney(n)}
            style={[
              styles.amount,
              {
                color: theme.colors.heroText,
                // Tighter gap when the override pill is present so the
                // amount/chip read as a single block, otherwise keep
                // the original generous spacing before the tiles.
                marginBottom: usdConversion
                  ? 2
                  : data.cycleAdjusted || savingsChip
                    ? 8
                    : 18,
              },
            ]}
          />
        </RiseView>

        {usdConversion ? (
          // Línea susurro: equivalente del saldo en dólares + la cotización en
          // uso. Solo se monta cuando el toggle de cotización está activo y hay
          // rate real (el dashboard pasa null en loading / off / moneda USD).
          // Tono heroMuted2 (el mismo de los tile subs) → secundario al monto,
          // no compite. Sin pill: la pieza más discreta del hero.
          <RiseView delay={100}>
            <Text
              accessibilityRole="text"
              accessibilityLabel={t('home:hero.a11yUsdEquivalent', { amount: formatUsd(usdConversion.saldoUsd) })}
              numberOfLines={1}
              maxFontSizeMultiplier={1.4}
              style={[
                styles.usdLine,
                {
                  color: theme.colors.heroMuted2,
                  marginBottom: data.cycleAdjusted || savingsChip ? 8 : 18,
                },
              ]}
            >
              {`≈ ${formatUsd(usdConversion.saldoUsd)}`}
            </Text>
          </RiseView>
        ) : null}

        {data.cycleAdjusted ||
        savingsChip ||
        data.acumulado ||
        data.monthlyReserveAmount > 0 ||
        data.fixedPendingReserved > 0 ? (
          // Read-only chip stack between the saldo amount and the
          // tiles row. Two captions can co-exist: "Ajustado/Acumulado"
          // (cycle override origin) y "Apartando ahorro" (savings).
          // The wrapper owns the bottom spacing so adding/removing
          // either chip doesn't shift the tiles.
          <View style={styles.heroChipStack}>
            {data.acumulado ? (
              // Acumulado del mes anterior — tono verde positivo.
              // Reemplaza al chip neutral "Ajustado" cuando el override
              // del cycle proviene de una decisión "acumular" (no de
              // un ajuste manual del user). Semántica: celebrar plata
              // que sobró, no advertir corrección.
              <RiseView delay={120}>
                <View
                  accessibilityRole="text"
                  accessibilityLabel={t('home:hero.acumuladoA11y', { amount: formatMoney(data.acumulado.amount) })}
                  style={[
                    styles.adjustedChip,
                    theme.mode === 'dark'
                      ? {
                          backgroundColor: 'rgba(166,239,143,0.18)',
                          borderColor: 'rgba(166,239,143,0.45)',
                        }
                      : {
                          backgroundColor: 'rgba(41,120,17,0.15)',
                          borderColor: 'rgba(41,120,17,0.35)',
                        },
                  ]}
                >
                  {/* Icon trending-up: comunica "valor que viene
                      arrastrando desde el mes anterior" — momentum
                      positivo, on-brand para una métrica financiera. */}
                  <MaterialIcons
                    name="trending-up"
                    size={13}
                    color={theme.colors.heroAccent}
                  />
                  <Text
                    style={[styles.adjustedChipText, { color: theme.colors.heroAccent }]}
                  >
                    {t('home:hero.acumuladoChip', {
                      amount: formatMoneyShort(data.acumulado.amount),
                      period: data.acumulado.periodLabel.toLowerCase(),
                    })}
                  </Text>
                </View>
              </RiseView>
            ) : data.cycleAdjusted && data.cycleBalanceDiff > 0 ? (
              // Override UP — balance > sueldo. El user sumó plata
              // al ciclo (reserva, cobro extra, etc.). Antes leía
              // "Ajustado" (peach, implicaba correción down). Ahora
              // chip indigo "+\$X sumado al mes" — positivo.
              <RiseView delay={120}>
                <View
                  accessibilityRole="text"
                  accessibilityLabel={t('home:hero.addedToMonthA11y', { amount: formatMoney(data.cycleBalanceDiff) })}
                  style={[
                    styles.adjustedChip,
                    {
                      // Hero oscuro en ambos modos → siempre el índigo claro
                      // (dark mode), alineado con el resto de los chips.
                      backgroundColor: 'rgba(165,180,252,0.18)',
                      borderColor: 'rgba(165,180,252,0.42)',
                    },
                  ]}
                >
                  {/* Icon add-circle: acción clara de "sumar/agregar"
                      — el user sumó plata al cycle (típicamente
                      reserva → mes, también aplica a cobro extra). */}
                  <MaterialIcons
                    name="add-circle"
                    size={13}
                    color={theme.colors.heroAccent}
                  />
                  <Text
                    style={[
                      styles.adjustedChipText,
                      { color: theme.colors.heroAccent },
                    ]}
                  >
                    {t('home:hero.addedToMonthChip', { amount: formatMoneyShort(data.cycleBalanceDiff) })}
                  </Text>
                </View>
              </RiseView>
            ) : data.cycleAdjusted ? (
              // Override DOWN (o == 0) — balance < sueldo. El user
              // ajustó hacia abajo (cobro menor al sueldo recurrente,
              // quincena adelantada, etc.). Chip peach neutral que
              // comunica "ajustaste manualmente el saldo del cycle".
              <RiseView delay={120}>
                <View
                  accessibilityRole="text"
                  accessibilityLabel={t('home:hero.adjustedBalanceA11y')}
                  style={[
                    styles.adjustedChip,
                    {
                      backgroundColor: 'rgba(242,167,140,0.20)',
                      borderColor: 'rgba(242,167,140,0.45)',
                    },
                  ]}
                >
                  {/* Icon tune: sliders/diales — comunica "ajuste
                      manual" del saldo (correción hacia abajo: cobro
                      menor al sueldo, quincena adelantada, etc.). */}
                  <MaterialIcons
                    name="tune"
                    size={13}
                    color={theme.colors.heroAccent}
                  />
                  <Text
                    style={[styles.adjustedChipText, { color: theme.colors.heroMuted }]}
                  >
                    {t('home:hero.adjustedBalanceChip')}
                  </Text>
                </View>
              </RiseView>
            ) : null}

            {savingsChip ? (
              // Three states drive tone: healthy (mint, on-track),
              // partial (mint dim, some overspend ate into the buffer),
              // consumed (peach urgency — the whole buffer was wiped).
              <RiseView delay={140}>
                <View
                  accessibilityRole="text"
                  accessibilityLabel={savingsChip.a11y}
                  style={[
                    styles.savingsChip,
                    savingsChip.kind === 'consumed'
                      ? {
                          backgroundColor: 'rgba(242,167,140,0.16)',
                          borderColor: 'rgba(242,167,140,0.45)',
                        }
                      : {
                          backgroundColor: 'rgba(166,239,143,0.16)',
                          borderColor: 'rgba(242,167,140,0.50)',
                        },
                  ]}
                >
                  <MaterialIcons
                    name={savingsChip.kind === 'consumed' ? 'warning-amber' : 'savings'}
                    size={13}
                    color={
                      savingsChip.kind === 'consumed' ? '#F2EAD3' : theme.colors.heroAccent
                    }
                  />
                  <Text
                    style={[
                      styles.savingsChipText,
                      {
                        color:
                          savingsChip.kind === 'consumed'
                            ? '#F2EAD3'
                            : savingsChip.kind === 'partial'
                              ? theme.colors.heroText
                              : theme.colors.heroAccent,
                        fontVariant: ['tabular-nums'],
                      },
                    ]}
                    maxFontSizeMultiplier={1.4}
                    numberOfLines={1}
                  >
                    {savingsChip.label}
                  </Text>
                </View>
              </RiseView>
            ) : null}

            {data.monthlyReserveAmount > 0 ? (
              // Reserva acumulada del cierre de meses anteriores
              // (Spec B — wrapped decisión "Guardar como reserva").
              // Read-only: la única forma de tocar este monto es vía
              // el wrapped. Lo surface aquí para que la plata no
              // Tono AMBER/GOLD (semánticamente "valor guardado/reserva"
              // — wallet → gold reserve). Antes era indigo igual que el
              // chip "+\$X al mes" → 2 chips indigo conviviendo se leían
              // redundantes. Code review M6 finding (2026-06-08). Otros
              // chips: peach=ajustado-down, lime=acumulado, mint=savings,
              // indigo=sumado-al-mes-UP.
              <RiseView delay={160}>
                <View
                  accessibilityRole="text"
                  accessibilityLabel={t('home:hero.reserveA11y', { amount: formatMoney(data.monthlyReserveAmount) })}
                  style={[
                    styles.savingsChip,
                    {
                      // Hero oscuro en ambos modos → siempre el gold (dark
                      // mode). Antes en light usaba rust #B45309 que rompía.
                      // Fill bajado a 0.06 para que el gold claro del texto
                      // alcance AA (4.5:1) sobre el verde del hero.
                      backgroundColor: 'rgba(252,211,77,0.06)',
                      borderColor: 'rgba(252,211,77,0.40)',
                    },
                  ]}
                >
                  <MaterialIcons
                    name="account-balance-wallet"
                    size={13}
                    color={'#FEF0C2'}
                  />
                  <Text
                    style={[
                      styles.savingsChipText,
                      {
                        color: '#FEF0C2',
                        fontVariant: ['tabular-nums'],
                      },
                    ]}
                    maxFontSizeMultiplier={1.4}
                    numberOfLines={1}
                  >
                    {t('home:hero.reserveChip', { amount: formatMoneyShort(data.monthlyReserveAmount) })}
                  </Text>
                </View>
              </RiseView>
            ) : null}

            {data.fixedPendingReserved > 0 ? (
              // "Aparta $X en fijos" — read-only, tono neutro
              // (informativo, no un status/celebración). Explica por qué
              // el saldo del mes NO baja al confirmar el pago de un fijo:
              // la plata ya estaba reservada (el saldo aparta pagados +
              // pendientes de una). `event-repeat` = recurrencia de fijos.
              <RiseView delay={180}>
                <View
                  accessibilityRole="text"
                  accessibilityLabel={t('home:hero.fixedReservedA11y', {
                    amount: formatMoney(data.fixedPendingReserved),
                  })}
                  style={[
                    styles.savingsChip,
                    {
                      backgroundColor: 'rgba(246,251,239,0.06)',
                      borderColor: 'rgba(255,255,255,0.16)',
                    },
                  ]}
                >
                  <MaterialIcons
                    name="event-repeat"
                    size={13}
                    color={theme.colors.heroMuted}
                  />
                  <Text
                    style={[
                      styles.savingsChipText,
                      {
                        color: theme.colors.heroMuted,
                        fontVariant: ['tabular-nums'],
                      },
                    ]}
                    maxFontSizeMultiplier={1.4}
                    numberOfLines={1}
                  >
                    {t('home:hero.fixedReservedChip', {
                      amount: formatMoneyShort(data.fixedPendingReserved),
                    })}
                  </Text>
                </View>
              </RiseView>
            ) : null}
          </View>
        ) : null}

        <View style={styles.tilesRow}>
          <RiseView delay={160} style={styles.tileFlex}>
            <View
              style={[
                styles.tile,
                {
                  backgroundColor: 'rgba(166,239,143,0.10)',
                  borderColor: 'rgba(166,239,143,0.22)',
                },
              ]}
            >
              <Text style={[styles.tileLabel, { color: theme.colors.heroAccent }]}>
                {t('home:hero.canSpendPerDay')}
              </Text>
              <Text style={[styles.tileValue, { color: theme.colors.heroText }]}>
                {formatMoneyShort(data.dailyBudget)}
              </Text>
              <Text style={[styles.tileSub, { color: theme.colors.heroText }]}>
                {t('home:hero.untilCycleEnd')}
              </Text>
            </View>
          </RiseView>

          <RiseView delay={240} style={styles.tileFlex}>
            <View
              style={[
                styles.tile,
                {
                  backgroundColor: 'rgba(246,251,239,0.05)',
                  borderColor: 'rgba(255,255,255,0.08)',
                },
              ]}
            >
              <Text style={[styles.tileLabel, { color: theme.colors.heroText }]}>
                {t('home:hero.youWillCloseWith')}
              </Text>
              {data.projectionReliable ? (
                <>
                  <Text style={[styles.tileValue, { color: projColor }]}>
                    {projPositive ? '+' : ''}
                    {formatMoneyShort(data.projectedClose)}
                  </Text>
                  {/* Sprint 3 — show the trend arrow + signed % vs
                      prior cycle when we have a baseline. The hint
                      "si sigues este ritmo" stays as a fallback when
                      no comparison data exists yet. */}
                  {projectedCloseTrend != null ? (
                    <View
                      style={styles.tileTrendRow}
                      accessibilityRole="text"
                      accessibilityLabel={(() => {
                        const pct = Math.abs(Math.round(projectedCloseTrend * 100))
                        if (projectedCloseTrend > 0) {
                          return t('home:hero.trendUpA11y', { pct })
                        }
                        if (projectedCloseTrend < 0) {
                          return t('home:hero.trendDownA11y', { pct })
                        }
                        return t('home:hero.trendFlatA11y')
                      })()}
                    >
                      <MaterialIcons
                        name={
                          projectedCloseTrend > 0
                            ? 'trending-up'
                            : projectedCloseTrend < 0
                              ? 'trending-down'
                              : 'trending-flat'
                        }
                        size={11}
                        color={
                          projectedCloseTrend > 0
                            ? '#FBE3D6'
                            : projectedCloseTrend < 0
                              ? theme.colors.heroAccent
                              : theme.colors.heroMuted2
                        }
                      />
                      <Text
                        style={[
                          styles.tileSub,
                          {
                            color:
                              projectedCloseTrend > 0
                                ? '#FBE3D6'
                                : projectedCloseTrend < 0
                                  ? theme.colors.heroAccent
                                  : theme.colors.heroMuted2,
                            fontVariant: ['tabular-nums'],
                          },
                        ]}
                        maxFontSizeMultiplier={1.4}
                      >
                        {t('home:hero.trendVsPrevCycle', {
                          sign: projectedCloseTrend > 0 ? '+' : projectedCloseTrend < 0 ? '−' : '',
                          pct: Math.abs(Math.round(projectedCloseTrend * 100)),
                        })}
                      </Text>
                    </View>
                  ) : (
                    <Text style={[styles.tileSub, { color: theme.colors.heroMuted2 }]}>
                      {t('home:hero.ifYouKeepThisPace')}
                    </Text>
                  )}
                </>
              ) : (
                // Day 1–3 of the cycle: the linear projection swings
                // wildly with each new expense, so we hide the number
                // and tell the user we're still learning instead of
                // misleading them with volatile data.
                (() => {
                  const wait = formatProjectionWaitCopy(4 - data.cycleDay)
                  return (
                    <>
                      <Text
                        style={[styles.tileValue, { color: theme.colors.heroMuted }]}
                      >
                        —
                      </Text>
                      <Text
                        style={[styles.tileSub, { color: theme.colors.heroMuted2 }]}
                        numberOfLines={1}
                      >
                        {`${wait.label} · ${wait.detail}`}
                      </Text>
                    </>
                  )
                })()
              )}
            </View>
          </RiseView>
        </View>
        </>
        )}
      </LinearGradient>
    </RiseView>
  )
}

/**
 * Memo wrap. El hero card es el componente más pesado del Home (gradient
 * + aurora + shine + particles + breathe dot + day chip pulse + tile
 * trends). Sin memo se re-rendereaba en cada parent render (apertura del
 * cycle sheet, telemetry tap, refetch...) reevaluando todas sus
 * animaciones internas. Con memo solo re-rendera cuando `data`,
 * `projectedCloseTrend` o `savingsChip` cambian.
 *
 * `data` viene de `useHomeMetrics` (memoized output object) → reference
 * stable cuando el subyacente no cambia.
 * `savingsChip` viene de `useMemo` en dashboard → reference stable.
 * `projectedCloseTrend` es number | null → primitive.
 * `onPressConfigureIncome` es `useCallback`'d → stable.
 */
export const HomeHeroCard = memo(HomeHeroCardImpl)

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 20,
    paddingTop: 18,
    overflow: 'hidden',
    borderWidth: 1,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
    zIndex: 2,
  },
  labelLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  dayChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  dayChipPending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dayChipText: {
    fontSize: 10,
    fontWeight: '600',
  },
  amount: {
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -1.8,
    lineHeight: 48,
  },
  // Línea susurro del equivalente en dólares — secundaria al monto.
  usdLine: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'],
  },
  // Setup state (income not configured)
  setupTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 30,
    marginTop: 4,
  },
  setupBody: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    marginTop: 8,
  },
  setupCta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 14,
  },
  setupCtaText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  // Stack wrapper for the read-only chips that may sit between the
  // saldo amount and the tiles row. `gap` controls inter-chip
  // spacing; `marginBottom` controls the gap to the tiles below.
  //
  // Layout horizontal con flexWrap: cuando hay 1-2 chips entran en
  // una sola fila; 3 chips wrappean a 2 filas máximo. Antes estaban
  // siempre stackeados verticalmente y sumaban mucha altura al hero
  // (owner feedback 2026-06-08). `alignItems: center` mantiene
  // cualquier diferencia de altura entre chips visualmente alineada.
  heroChipStack: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 6,
    rowGap: 6,
    marginBottom: 14,
  },
  adjustedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  adjustedChipText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  // "Apartando ahorro" chip — sits below the saldo amount,
  // above the tiles row. Stacks with the adjustedChip when both
  // apply (both are short, read-only captions; vertical rhythm
  // remains consistent at the same hierarchical level).
  savingsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  savingsChipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  tilesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tileFlex: { flex: 1 },
  tile: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    // Both side tiles must keep matching heights even when the
    // projection tile renders the "Aún calculando · 2 días"
    // placeholder (taller content than "hasta fin de ciclo"). The
    // row already stretches each `RiseView` wrapper, so `flex: 1`
    // here makes the tile background fill its wrapper end-to-end
    // — without it the colored card stays at intrinsic content
    // height while the wrapper stretches, leaving a visible gap.
    // `minHeight` floors the row at the tallest expected single
    // state so the equal-height contract holds even when *both*
    // tiles use short copy.
    flex: 1,
    minHeight: 88,
  },
  tileLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  tileValue: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  tileSub: {
    fontSize: 11,
    marginTop: 3,
  },
  // Trend arrow + signed % row under the projection value (Sprint 3).
  // Tight gap so the icon hugs the number; uses tabular nums via the
  // text style to keep the percent stable while the value shifts.
  tileTrendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 3,
  },
})
