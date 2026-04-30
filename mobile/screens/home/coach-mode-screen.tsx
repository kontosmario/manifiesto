// Coach Mode — focused experience for a single signal.
//
// Triggered by `action.kind: 'open-coach-mode'` (super-perfect-storm,
// super-hidden-drain, future health checks). Renders a longer-form
// view than the chat bubble: full body + a list of constituent
// findings (when the signal is a super-signal) + the reusable CTA.
//
// Scope intentionally tight for now — this is the scaffold the v2 spec
// promised so the action kind has a real destination instead of a
// dead route. Future iterations can layer in step-by-step plans,
// embedded charts, and external links per topic.

import { useCallback, useMemo } from 'react'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import Animated, { FadeIn } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { triggerHaptic } from '@/lib/haptics'
import { useControlV2Data } from '@/features/insights/use-control-v2-data'
import { useControlActionDispatcher } from '@/features/insights/use-control-action-dispatcher'
import { iconForSignal } from '@/components/control-v2/asesor-signal-meta'
import { getActionMeta, resolveCtaLabel } from '@/components/control-v2/asesor-action-meta'
import {
  TYPE_TONES,
  bubbleHeadline,
  bubbleType,
  confidenceLabel,
  impactChipLabel,
} from '@/components/control-v2/asesor-bubble-meta'
import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'

interface CoachModeScreenProps {
  familyId: string
  userId: string
  signalId: string
  /** Free-form discriminator (e.g. `'crisis'`, `'leaks'`). Used today
   *  only for the title prefix, kept for future per-topic content. */
  topic?: string
}

const SHELL_GRADIENT = ['#0F2A1E', '#143B2A', '#0A1410'] as const

const TOPIC_TITLES: Record<string, string> = {
  crisis: 'Plan integral',
  leaks: 'Auditoría de drenaje',
}

export function CoachModeScreen({
  familyId,
  userId,
  signalId,
  topic,
}: CoachModeScreenProps) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { signals } = useControlV2Data(familyId, userId)
  const dispatch = useControlActionDispatcher({ familyId, userId })

  const task = useMemo<ControlAdvisorTask | null>(() => {
    return signals.find((s) => s.id === signalId) ?? null
  }, [signals, signalId])

  // Resolve the constituent atomic signals (when this is a super-signal)
  // by id lookup against the same `signals` list — they may have been
  // dropped from the surface but stay accessible here for context.
  const constituents = useMemo<ControlAdvisorTask[]>(() => {
    if (!task?.composedOf) return []
    const idSet = new Set(task.composedOf)
    return signals.filter((s) => idSet.has(s.id))
  }, [task, signals])

  const onClose = useCallback(() => {
    void triggerHaptic('selection')
    if (router.canGoBack()) router.back()
    else router.replace('/(app)/(tabs)/home')
  }, [router])

  const onPrimaryAction = useCallback(() => {
    if (!task?.action) return
    const meta = getActionMeta(task.action)
    void triggerHaptic(meta.haptic)
    dispatch(task.action, {
      taskId: task.id,
      surface: 'asistente_screen',
      taskContext: {
        urgency: task.urgency,
        confidence: task.confidence,
        impactRaw: task.impactRaw,
        cat: task.cat,
        from: 'coach-mode',
      },
    })
  }, [task, dispatch])

  const headerTitle = topic && TOPIC_TITLES[topic] ? TOPIC_TITLES[topic] : 'Modo guiado'
  const tone = task ? TYPE_TONES[bubbleType(task)] : TYPE_TONES.insight

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={SHELL_GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Cerrar modo guiado"
          hitSlop={10}
          style={styles.closeButton}
        >
          <MaterialIcons name="close" size={22} color="#E6F0E2" />
        </Pressable>
        <Text style={styles.headerTitle}>{headerTitle}</Text>
        <View style={styles.closeButton} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {!task ? (
          <Animated.View entering={FadeIn.duration(220)} style={styles.emptyCard}>
            <MaterialIcons name="info-outline" size={28} color="#9FBFA9" />
            <Text style={styles.emptyTitle}>Esta señal ya no está activa</Text>
            <Text style={styles.emptyBody}>
              Pudo haber expirado o haber sido marcada como vista. Volvé al asistente para ver lo que hay ahora.
            </Text>
            <Pressable
              onPress={onClose}
              style={styles.emptyCta}
              accessibilityRole="button"
            >
              <Text style={styles.emptyCtaLabel}>Volver</Text>
            </Pressable>
          </Animated.View>
        ) : (
          <>
            <Animated.View
              entering={FadeIn.duration(280)}
              style={[styles.heroCard, { backgroundColor: tone.soft, borderColor: tone.edge }]}
            >
              <View style={[styles.heroIconWrap, { backgroundColor: tone.bg }]}>
                <MaterialIcons
                  name={iconForSignal(task.id)}
                  size={28}
                  color={tone.fg}
                />
              </View>
              <Text style={[styles.heroEyebrow, { color: tone.fg }]}>
                {bubbleHeadline(task)}
              </Text>
              <Text style={styles.heroTitle}>{task.title}</Text>
              <Text style={styles.heroBody}>{task.body}</Text>
              <View style={styles.heroChips}>
                <View style={[styles.chip, { borderColor: tone.edge }]}>
                  <Text style={[styles.chipText, { color: tone.fg }]}>
                    {impactChipLabel(task)}
                  </Text>
                </View>
                <View style={[styles.chip, { borderColor: tone.edge }]}>
                  <Text style={[styles.chipText, { color: tone.fg }]}>
                    {confidenceLabel(task.confidence)}
                  </Text>
                </View>
              </View>
            </Animated.View>

            {constituents.length > 0 ? (
              <Animated.View
                entering={FadeIn.duration(320).delay(80)}
                style={styles.constituentsBlock}
              >
                <Text style={styles.sectionEyebrow}>Compuesta por</Text>
                {constituents.map((c) => {
                  const cTone = TYPE_TONES[bubbleType(c)]
                  return (
                    <View
                      key={c.id}
                      style={[styles.constituentRow, { borderColor: cTone.edge }]}
                    >
                      <View style={[styles.constituentIcon, { backgroundColor: cTone.bg }]}>
                        <MaterialIcons
                          name={iconForSignal(c.id)}
                          size={18}
                          color={cTone.fg}
                        />
                      </View>
                      <View style={styles.constituentText}>
                        <Text style={styles.constituentTitle}>{c.title}</Text>
                        <Text style={styles.constituentBody} numberOfLines={2}>
                          {c.body}
                        </Text>
                      </View>
                    </View>
                  )
                })}
              </Animated.View>
            ) : (
              <Animated.View
                entering={FadeIn.duration(320).delay(80)}
                style={styles.explanationBlock}
              >
                <Text style={styles.sectionEyebrow}>Por qué importa</Text>
                <Text style={styles.explanationBody}>
                  {task.dummyExplanation ??
                    'Esta sugerencia se basa en patrones detectados en tus gastos del ciclo. La acción del CTA es la palanca más directa para mover el número.'}
                </Text>
              </Animated.View>
            )}

            {task.action ? (
              <Animated.View
                entering={FadeIn.duration(360).delay(140)}
                style={styles.ctaBlock}
              >
                <Pressable
                  onPress={onPrimaryAction}
                  accessibilityRole="button"
                  accessibilityLabel={resolveCtaLabel(task.cta, task.action)}
                  style={({ pressed }) => [
                    styles.primaryCta,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={styles.primaryCtaLabel}>
                    {resolveCtaLabel(task.cta, task.action)}
                  </Text>
                  <MaterialIcons
                    name={getActionMeta(task.action).icon}
                    size={18}
                    color="#0F2A1E"
                  />
                </Pressable>
              </Animated.View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E6F0E2',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 16,
  },
  heroCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 10,
  },
  heroIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 21,
    fontWeight: '700',
    color: '#0F1F18',
    lineHeight: 26,
  },
  heroBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1F3329',
  },
  heroChips: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  constituentsBlock: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 18,
    padding: 16,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(199, 238, 156, 0.18)',
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#A9C7B0',
    marginBottom: 2,
  },
  constituentRow: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#FAFCF7',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
  },
  constituentIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  constituentText: { flex: 1, gap: 2 },
  constituentTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2A24',
  },
  constituentBody: {
    fontSize: 13,
    lineHeight: 18,
    color: '#566761',
  },
  explanationBlock: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 18,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(199, 238, 156, 0.18)',
  },
  explanationBody: {
    fontSize: 14,
    lineHeight: 22,
    color: '#D8E5DC',
    marginTop: 6,
  },
  ctaBlock: { marginTop: 8 },
  primaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#C7EE9C',
    borderRadius: 14,
    paddingVertical: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 6 },
    }),
  },
  primaryCtaLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F2A1E',
    letterSpacing: 0.2,
  },
  emptyCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(199, 238, 156, 0.18)',
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#E6F0E2',
    marginTop: 6,
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 20,
    color: '#A9C7B0',
    textAlign: 'center',
  },
  emptyCta: {
    backgroundColor: '#C7EE9C',
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 10,
    marginTop: 6,
  },
  emptyCtaLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F2A1E',
  },
})
