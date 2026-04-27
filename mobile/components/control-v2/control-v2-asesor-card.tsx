import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { RiseView } from '@/components/home/animated/rise-view'
import { triggerHaptic } from '@/lib/haptics'
import { formatMoney, formatMoneyShort } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'
import { controlV2Tokens } from './control-v2-tokens'
import { useDismissedIds } from '@/features/insights/control-dismiss-store'
import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'

interface ControlV2AsesorCardProps {
  tareas: ControlAdvisorTask[]
  onTaskPress?: (task: ControlAdvisorTask) => void
}

/**
 * Advisor card — three task suggestions with urgency ribbon,
 * copy, monetary impact, and CTA. Below the tasks, a summary
 * banner with the projected month-end outcome.
 */
export function ControlV2AsesorCard({
  tareas,
  onTaskPress,
}: ControlV2AsesorCardProps) {
  const { theme } = useAppTheme()
  const muted = theme.colors.textMuted
  const deepText = theme.colors.text
  // Hide celebratory cards the user already dismissed today.
  const dismissed = useDismissedIds()
  const visible = tareas.filter((t) => {
    if (t.action?.kind === 'dismiss') return !dismissed.has(t.action.dismissId)
    return !dismissed.has(t.id)
  })
  const totalImpact = visible.reduce((s, t) => s + t.impactRaw, 0)
  if (visible.length === 0) return null

  return (
    <RiseView delay={420}>
      <View style={styles.wrap}>
        <View style={styles.brandRow}>
          <LinearGradient
            colors={[controlV2Tokens.good.tint, controlV2Tokens.good.solid]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.brandBadge}
          >
            <Text style={styles.brandBadgeGlyph}>✨</Text>
          </LinearGradient>
          <View style={styles.flex}>
            <Text style={[styles.brandLabel, { color: controlV2Tokens.good.light }]}>
              ASISTENTE FINANCIERO
            </Text>
            <Text style={[styles.brandSub, { color: muted }]}>
              Lee tus gastos, tu sueldo y tu historial · {visible.length}{' '}
              {visible.length === 1 ? 'idea' : 'ideas'} para esta semana
            </Text>
          </View>
        </View>

        <View style={styles.headerRow}>
          <View style={styles.flex}>
            <Text style={[styles.eyebrow, { color: muted }]}>
              QUÉ HACER ESTA SEMANA
            </Text>
            <Text style={[styles.subhead, { color: deepText }]}>
              Haciendo esto, ganás{' '}
              <Text style={{ color: controlV2Tokens.good.light }}>
                +{formatMoney(totalImpact)} por mes
              </Text>
            </Text>
          </View>
          <LinearGradient
            colors={[controlV2Tokens.good.tint, controlV2Tokens.good.solid]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.countPill}
          >
            <Text style={styles.countPillText}>{tareas.length} IDEAS</Text>
          </LinearGradient>
        </View>

        <View style={styles.taskList}>
          {visible.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onPress={() => {
                void triggerHaptic('selection')
                onTaskPress?.(task)
              }}
            />
          ))}
        </View>

        <LinearGradient
          colors={
            theme.isDark
              ? (['#13221B', '#0E1A15'] as const)
              : (['#FFFBF2', '#F6F1E4'] as const)
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.summary,
            {
              borderColor: theme.isDark ? '#1F332A' : '#EFE8D9',
            },
          ]}
        >
          <Text style={styles.summaryEmoji}>🌱</Text>
          <Text
            style={[
              styles.summaryEyebrow,
              { color: controlV2Tokens.good.tint },
            ]}
          >
            AL CERRAR EL MES
          </Text>
          <Text style={[styles.summaryHeadline, { color: deepText }]}>
            Si seguís así, vas a guardar{' '}
            <Text style={{ color: controlV2Tokens.good.tint }}>
              {formatMoneyShort(480_000)}
            </Text>{' '}
            más que el mes pasado.
          </Text>
          <Text style={[styles.summaryBody, { color: muted }]}>
            El mes pasado cerraste con {formatMoney(1_440_000)}. Este mes
            apuntás a {formatMoney(1_920_000)}.
          </Text>
        </LinearGradient>
      </View>
    </RiseView>
  )
}

function TaskCard({
  task,
  onPress,
}: {
  task: ControlAdvisorTask
  onPress: () => void
}) {
  const { theme } = useAppTheme()
  const [explainerOpen, setExplainerOpen] = useState(false)
  const shellBg = theme.isDark ? '#13221B' : '#FFFBF2'
  const shellBorder = theme.isDark ? '#1F332A' : '#EFE8D9'
  const explainerBg = theme.isDark ? '#0E1A15' : '#F6F1E4'
  const explainerBorder = theme.isDark ? '#1F332A' : '#EFE8D9'
  const muted = theme.colors.textMuted
  const deepText = theme.colors.text
  const clr =
    task.urgency === 'alta'
      ? controlV2Tokens.warn.tint
      : task.urgency === 'media'
        ? controlV2Tokens.warn.solid
        : controlV2Tokens.warn.light
  const iconBg =
    task.urgency === 'alta'
      ? 'rgba(232,138,112,0.14)'
      : task.urgency === 'media'
        ? 'rgba(242,181,138,0.14)'
        : 'rgba(241,214,144,0.14)'

  const hasExplainer = Boolean(task.dummyExplanation)

  return (
    <Animated.View
      layout={LinearTransition.duration(220)}
      style={[
        styles.taskCard,
        { backgroundColor: shellBg, borderColor: shellBorder },
      ]}
    >
      <View style={[styles.urgencyStripe, { backgroundColor: clr }]} />
      <View style={styles.taskRow}>
        <View
          style={[
            styles.taskIcon,
            { backgroundColor: iconBg, borderColor: `${clr}55` },
          ]}
        >
          <Text style={styles.taskEmoji}>{task.emoji}</Text>
        </View>
        <View style={styles.flex}>
          <Text style={[styles.taskTitle, { color: deepText }]}>
            {task.title}
          </Text>
          <Text style={[styles.taskBody, { color: muted }]}>{task.body}</Text>

          {hasExplainer ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                explainerOpen
                  ? 'Ocultar explicación'
                  : '¿Qué significa esto?'
              }
              accessibilityState={{ expanded: explainerOpen }}
              onPress={() => {
                void triggerHaptic('selection')
                setExplainerOpen((v) => !v)
              }}
              style={styles.explainerToggle}
            >
              <Text style={[styles.explainerToggleText, { color: muted }]}>
                {explainerOpen ? '▾ Ocultar' : '▸ ¿Qué significa?'}
              </Text>
            </Pressable>
          ) : null}

          {explainerOpen && hasExplainer ? (
            <Animated.View
              entering={FadeIn.duration(160)}
              exiting={FadeOut.duration(120)}
              style={[
                styles.explainerBox,
                {
                  backgroundColor: explainerBg,
                  borderColor: explainerBorder,
                },
              ]}
            >
              <Text style={styles.explainerEmoji}>💡</Text>
              <Text style={[styles.explainerText, { color: deepText }]}>
                {task.dummyExplanation}
              </Text>
            </Animated.View>
          ) : null}

          {task.confidence < 0.7 ? (
            <View style={styles.confidenceRow}>
              <Text style={[styles.confidenceText, { color: muted }]}>
                {`Según ${task.dataDays} ${task.dataDays === 1 ? 'día' : 'días'} de datos · se afina con el tiempo`}
              </Text>
            </View>
          ) : null}

          <View style={styles.taskFooter}>
            <Text
              style={[styles.taskImpact, { color: controlV2Tokens.good.light }]}
            >
              💰 {task.impact}
            </Text>
            {task.action?.kind === 'dismiss' ? (
              // Awareness card: muted acknowledgement button — no arrow,
              // no gradient. Just "got it", tap to collapse.
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${task.cta} — marcar como leído`}
                onPress={onPress}
                style={({ pressed }) => [
                  styles.ackCta,
                  {
                    backgroundColor: pressed
                      ? theme.isDark
                        ? 'rgba(246,251,239,0.08)'
                        : 'rgba(15,42,30,0.06)'
                      : theme.isDark
                        ? 'rgba(246,251,239,0.04)'
                        : 'rgba(15,42,30,0.04)',
                    borderColor: theme.isDark
                      ? 'rgba(246,251,239,0.12)'
                      : 'rgba(15,42,30,0.14)',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.ackCtaText,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  {task.cta}
                </Text>
              </Pressable>
            ) : (
              // Real-action card: solid gradient with arrow — "go do
              // something in the app".
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${task.cta} para ${task.title}`}
                onPress={onPress}
                style={styles.taskCtaWrap}
              >
                <LinearGradient
                  colors={[
                    controlV2Tokens.good.tint,
                    controlV2Tokens.good.solid,
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.taskCta}
                >
                  <Text style={styles.taskCtaText}>{task.cta} →</Text>
                </LinearGradient>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  brandBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandBadgeGlyph: {
    fontSize: 20,
    lineHeight: 22,
  },
  brandLabel: {
    fontSize: 10,
    letterSpacing: 1.8,
    fontWeight: '800',
  },
  brandSub: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 2,
  },
  flex: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.6,
    fontWeight: '700',
  },
  subhead: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  countPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  countPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#0A1410',
  },
  taskList: {
    gap: 10,
  },
  taskCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    paddingLeft: 18,
    position: 'relative',
    overflow: 'hidden',
  },
  urgencyStripe: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 4,
    opacity: 0.85,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  taskIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  taskEmoji: {
    fontSize: 20,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  taskBody: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  explainerToggle: {
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  explainerToggleText: {
    fontSize: 11,
    fontWeight: '600',
  },
  explainerBox: {
    flexDirection: 'row',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
  explainerEmoji: {
    fontSize: 14,
    lineHeight: 18,
  },
  explainerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  confidenceRow: {
    marginTop: 6,
  },
  confidenceText: {
    fontSize: 10,
    fontStyle: 'italic',
    fontWeight: '500',
  },
  taskFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  taskImpact: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
  },
  taskCtaWrap: {
    borderRadius: 999,
    overflow: 'hidden',
  },
  taskCta: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  taskCtaText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0A1410',
  },
  ackCta: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  ackCtaText: {
    fontSize: 12,
    fontWeight: '600',
  },
  summary: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    overflow: 'hidden',
    marginTop: 2,
  },
  summaryEmoji: {
    position: 'absolute',
    top: -16,
    right: -16,
    fontSize: 72,
    opacity: 0.12,
  },
  summaryEyebrow: {
    fontSize: 10,
    letterSpacing: 1.6,
    fontWeight: '800',
  },
  summaryHeadline: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 22,
    marginTop: 4,
  },
  summaryBody: {
    fontSize: 11,
    marginTop: 6,
    lineHeight: 16,
  },
})
