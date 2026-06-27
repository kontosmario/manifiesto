import { useCallback, useEffect } from 'react'
import { Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import i18n from '@/lib/i18n'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import type { CycleWrappedPayload } from '@/lib/cycle-wrapped-emitter'
import { formatMoney } from '@/utils/money'
import { closingStyles, summaryStyles } from './closing-styles'
import { LeftoverOptionCard } from './leftover-option-card'
import type { LeftoverOption, Scene } from './types'

// 5. Closing scene — forest deep (statement de marca), monthly income
// hero, achievements pill si hay, summary row con gastaste + movimientos,
// CTA primary. Integra Spec B (leftover decision) cuando el payload
// trae pending o past decision.
export function buildClosingScene(
  payload: CycleWrappedPayload,
  leftoverSelected: LeftoverOption | null,
  onSelectLeftover: (next: LeftoverOption) => void,
): Scene {
  return {
    id: 'closing',
    background: '#0F2E1F', // forest deep, brand statement
    foreground: '#F4FDF2',
    // Sobre forest deep el contraste es altísimo, pero bumpeamos a
    // 0.82 para que eyebrow/labels no parezcan "apagados".
    foregroundSoft: 'rgba(244,253,242,0.82)',
    progressTrack: 'rgba(244,253,242,0.24)',
    progressFill: '#A6EF8F',
    ctaBg: '#A6EF8F',
    ctaFg: '#0F2E1F',
    render: ({ reduced }) => (
      <ClosingSceneRender
        payload={payload}
        leftoverSelected={leftoverSelected}
        onSelectLeftover={onSelectLeftover}
        reduced={reduced}
      />
    ),
  }
}

// Closing scene como sub-componente: necesita hooks propios para el
// pulse del amount y el stagger de las OptionCards. Extraerlo del
// builder mantiene los hooks dentro de una React component (no en una
// pure function), evitando "hooks called in non-component".
function ClosingSceneRender({
  payload,
  leftoverSelected,
  onSelectLeftover,
  reduced,
}: {
  payload: CycleWrappedPayload
  leftoverSelected: LeftoverOption | null
  onSelectLeftover: (next: LeftoverOption) => void
  reduced: boolean
}) {
  const hasPending = Boolean(
    payload.pendingLeftoverDecision && payload.onApplyLeftoverDecision,
  )
  // `past` solo se considera cuando NO hay pending (mutuamente
  // exclusivos en spec). Si por error llegan los dos, `pending`
  // gana porque está actualmente operando un flow no-decidido.
  const past = hasPending ? undefined : payload.pastLeftoverDecision
  // skip no es interesante visualizarlo (el user explícitamente
  // se saltó la decisión) → fallback a la closing scene vanilla.
  const showLeftoverSection =
    hasPending || (past != null && past.decision !== 'skip')
  const goalTitle = payload.activeGoal?.title ?? null

  // ── Pulse del amount en mode pending ────────────────────
  // Loop sutil 1 → 1.015 → 1 cada 2.5s (1250ms por dirección).
  // Solo en pending — past mode es read-only, sería ruido.
  const amountPulse = useSharedValue(1)
  useEffect(() => {
    if (reduced || !hasPending) {
      cancelAnimation(amountPulse)
      amountPulse.value = 1
      return
    }
    amountPulse.value = withRepeat(
      withSequence(
        // @motion-allow: 1250ms amount idle pulse (cycle 2.5s) — calm-urgent breathing del monto pendiente; entre decorativeDurations.pulse (1200) y pulseSlow (2400) por diseño.
        withTiming(1.015, {
          duration: 1250,
          easing: Easing.inOut(Easing.quad),
        }),
        // @motion-allow: 1250ms — paired with the up-phase above.
        withTiming(1, {
          duration: 1250,
          easing: Easing.inOut(Easing.quad),
        }),
      ),
      -1,
      false,
    )
    return () => {
      cancelAnimation(amountPulse)
    }
  }, [reduced, hasPending, amountPulse])

  const amountAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: amountPulse.value }],
  }))

  // Memoize selection handlers para que las LeftoverOptionCard hijas
  // no re-rendereen por una nueva fn ref en cada render del parent.
  // El `disabled` de las cards se pasa explícito (no usamos `undefined`
  // con `() => {}` no-op).
  const handleSelectMeta = useCallback(
    () => onSelectLeftover('meta'),
    [onSelectLeftover],
  )
  const handleSelectAcumular = useCallback(
    () => onSelectLeftover('acumular'),
    [onSelectLeftover],
  )
  const handleSelectReserva = useCallback(
    () => onSelectLeftover('reserva'),
    [onSelectLeftover],
  )

  return (
    <View style={closingStyles.stage}>
      {/* ── Sección histórica (siempre presente) ────────── */}
      <Text style={[closingStyles.eyebrow, { color: 'rgba(244,253,242,0.82)' }]}>
        {i18n.t('control:wrapped.closing.eyebrow')}
      </Text>
      <Text
        style={[
          showLeftoverSection ? closingStyles.titleCompact : closingStyles.title,
          { color: '#F4FDF2' },
        ]}
        accessibilityRole="header"
      >
        {i18n.t('control:wrapped.closing.title', {
          amount: formatMoney(Math.round(payload.monthlyIncome)),
        })}
      </Text>
      {payload.achievementsEarnedInCycle > 0 ? (
        <View
          style={[
            closingStyles.achievementsRow,
            { borderColor: 'rgba(166,239,143,0.55)' },
          ]}
        >
          <MaterialIcons name="emoji-events" size={16} color="#A6EF8F" />
          <Text style={[closingStyles.achievementsText, { color: '#A6EF8F' }]}>
            {i18n.t('control:wrapped.closing.achievements', {
              count: payload.achievementsEarnedInCycle,
            })}
          </Text>
        </View>
      ) : null}
      <View style={closingStyles.summaryRow}>
        <SummaryStat
          label={i18n.t('control:wrapped.closing.summaryGastaste')}
          value={formatMoney(Math.round(payload.totalSpent))}
          color="#F4FDF2"
          mutedColor="rgba(244,253,242,0.82)"
        />
        <View style={closingStyles.summaryDivider} />
        <SummaryStat
          label={i18n.t('control:wrapped.closing.summaryMovimientos')}
          value={String(payload.expensesCount)}
          color="#F4FDF2"
          mutedColor="rgba(244,253,242,0.82)"
        />
      </View>

      {/* ── Sección decisión sobrante (pending o past) ── */}
      {showLeftoverSection ? (
        <>
          <View style={closingStyles.sectionDivider} />
          <Text style={[closingStyles.leftoverEyebrow, { color: 'rgba(244,253,242,0.82)' }]}>
            {past
              ? i18n.t('control:wrapped.closing.leftoverEyebrowDecidido')
              : i18n.t('control:wrapped.closing.leftoverEyebrowSobraron')}
          </Text>
          {hasPending ? (
            <Animated.Text
              style={[
                closingStyles.leftoverAmount,
                { color: '#A6EF8F' },
                amountAnimatedStyle,
              ]}
            >
              {formatMoney(Math.round(payload.pendingLeftoverDecision!.sobrante))}
            </Animated.Text>
          ) : (
            <Text style={[closingStyles.leftoverAmount, { color: '#A6EF8F' }]}>
              {formatMoney(Math.round(past!.sobrante))}
            </Text>
          )}
          {!past ? (
            <Text style={[closingStyles.leftoverSubtitle, { color: 'rgba(244,253,242,0.82)' }]}>
              {i18n.t('control:wrapped.closing.leftoverQueHaces')}
            </Text>
          ) : null}
          <View style={closingStyles.optionsStack}>
            <LeftoverOptionCard
              icon="track-changes"
              title={
                past?.decision === 'meta' && past?.metaGoalTitle
                  ? i18n.t('control:wrapped.closing.optionMetaAportaste', {
                      title: past.metaGoalTitle,
                    })
                  : goalTitle
                    ? i18n.t('control:wrapped.closing.optionMetaSumar', {
                        title: goalTitle,
                      })
                    : i18n.t('control:wrapped.closing.optionMetaTitulo')
              }
              subtitle={
                past?.decision === 'meta'
                  ? i18n.t('control:wrapped.closing.optionMetaSubAporteRealizado')
                  : goalTitle
                    ? i18n.t('control:wrapped.closing.optionMetaSubAporteDirecto')
                    : i18n.t('control:wrapped.closing.optionMetaSubCrearPrimero')
              }
              selected={past ? past.decision === 'meta' : leftoverSelected === 'meta'}
              disabled={Boolean(past) || !payload.activeGoal}
              readOnly={Boolean(past)}
              onPress={handleSelectMeta}
              staggerIndex={0}
              stagger={hasPending && !reduced}
            />
            <LeftoverOptionCard
              icon="trending-up"
              title={i18n.t('control:wrapped.closing.optionAcumularTitle')}
              subtitle={
                past?.decision === 'acumular'
                  ? i18n.t('control:wrapped.closing.optionAcumularSubHecho')
                  : i18n.t('control:wrapped.closing.optionAcumularSub')
              }
              selected={past ? past.decision === 'acumular' : leftoverSelected === 'acumular'}
              disabled={Boolean(past)}
              readOnly={Boolean(past)}
              onPress={handleSelectAcumular}
              staggerIndex={1}
              stagger={hasPending && !reduced}
            />
            <LeftoverOptionCard
              icon="savings"
              title={i18n.t('control:wrapped.closing.optionReservaTitle')}
              subtitle={
                past?.decision === 'reserva'
                  ? i18n.t('control:wrapped.closing.optionReservaSubGuardado')
                  : i18n.t('control:wrapped.closing.optionReservaSub')
              }
              selected={past ? past.decision === 'reserva' : leftoverSelected === 'reserva'}
              disabled={Boolean(past)}
              readOnly={Boolean(past)}
              onPress={handleSelectReserva}
              staggerIndex={2}
              stagger={hasPending && !reduced}
            />
          </View>
          {past ? (
            <Text style={closingStyles.pastDecisionHint}>
              {i18n.t('control:wrapped.closing.pastDecisionHint', {
                date: formatPastDate(past.decidedAt),
              })}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  )
}

function SummaryStat({
  label,
  value,
  color,
  mutedColor,
}: {
  label: string
  value: string
  color: string
  mutedColor: string
}) {
  return (
    <View style={summaryStyles.cell}>
      <Text style={[summaryStyles.label, { color: mutedColor }]}>{label}</Text>
      <Text style={[summaryStyles.value, { color }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  )
}

/** Formato compacto para "Decidiste el ..." en replay read-only.
 *  Parsea timestamptz/ISO completo (no solo YYYY-MM-DD) — `decided_at`
 *  es timestamptz en la DB. El nombre del mes viene de i18n; el patrón
 *  (orden día/mes/año + conector) vive en `wrapped.closing.dateFormat`. */
function formatPastDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const day = d.getDate()
  const month = i18n.t(`control:months.long.${d.getMonth()}`)
  const year = d.getFullYear()
  return i18n.t('control:wrapped.closing.dateFormat', { day, month, year })
}
