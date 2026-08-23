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
  View,
} from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import Animated, { FadeIn } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { triggerHaptic } from '@/lib/haptics'
import { motionDurations, motionStagger } from '@/lib/motion/tokens'
import { useControlV2Data } from '@/features/insights/use-control-v2-data'
import { useControlActionDispatcher } from '@/features/insights/use-control-action-dispatcher'
import { BrotMascot } from '@/components/brot/brot-mascot'
import { NeoButton } from '@/components/ui/neo-button'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { iconForSignal } from '@/components/control-v2/asesor-signal-meta'
import { getActionMeta, resolveCtaLabel } from '@/components/control-v2/asesor-action-meta'
import {
  bubbleHeadline,
  bubbleIntro,
  bubbleType,
  confidenceLabel,
  impactChipLabel,
} from '@/components/control-v2/asesor-bubble-meta'
import {
  starColors,
  starOpacityScale,
  typeInk,
  typeTileBackground,
} from '@/components/control-v2/asesor-neo-meta'
import { AsesorStarField } from '@/components/control-v2/asesor-star-field'
import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'
import { cssGradient, neoRadii, neoTokens } from '@/theme/neo-tokens'
import { useThemeTokens } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

interface CoachModeScreenProps {
  familyId: string
  userId: string
  signalId: string
  /** Free-form discriminator (e.g. `'crisis'`, `'leaks'`). Used today
   *  only for the title prefix, kept for future per-topic content. */
  topic?: string
}

const TOPIC_TITLE_KEYS: Record<string, string> = {
  crisis: 'control:coach.topicCrisis',
  leaks: 'control:coach.topicLeaks',
}

/**
 * La pantalla hereda el tema del sistema: se compone con el material de
 * `neoTokens(mode)` y se ve en claro "Salvia" y en oscuro "Noche de
 * bosque". El vocabulario es el mismo que el del Asistente —misma
 * familia de señales, misma lectura— con el narrador de `screens/3f.html`
 * arriba: Brot en pose `coach` a 104 y su globo `22 22 22 6` con la
 * receta de card.
 */
export function CoachModeScreen({
  familyId,
  userId,
  signalId,
  topic,
}: CoachModeScreenProps) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { t } = useTranslation()
  const themeTokens = useThemeTokens()
  const neo = neoTokens(themeTokens.mode)
  const isDark = themeTokens.mode === 'dark'
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

  const headerTitle =
    topic && TOPIC_TITLE_KEYS[topic]
      ? t(TOPIC_TITLE_KEYS[topic])
      : t('control:coach.headerDefault')
  const type = task ? bubbleType(task) : 'insight'
  const accent = typeInk(type, themeTokens.mode)
  const actionMeta = task?.action ? getActionMeta(task.action) : null
  const ctaLabel = task ? resolveCtaLabel(task.cta, task.action) : ''

  // Android < API 28 descarta el boxShadow outset (y < 29 el inset) EN
  // SILENCIO: sin el relieve, las cards y los pozos se quedarían sin
  // ningún límite contra la hoja, así que ahí cae un hairline del
  // separador. Ver `inset-shadow-support`.
  const edgeFallback = {
    borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1,
    borderColor: neo.sheetDivider,
  }

  return (
    // Carcasa de hoja: sólido `neo.sheet`. En iOS sin esquinas propias
    // (el pageSheet del sistema ya redondea y un radio propio dejaría ver
    // el vacío del presentador). En Android (formSheet, 2026-08-21) el
    // redondeo superior lo recorta ESTE root — el contenedor de la ruta
    // va transparente (ver app-stack-shell) porque react-native-screens
    // no moldea un fondo de contenido propio. Radio = neoRadii.sheet.
    <View
      style={[
        styles.root,
        { backgroundColor: neo.sheet },
        Platform.OS === 'android'
          ? {
              borderTopLeftRadius: neoRadii.sheet,
              borderTopRightRadius: neoRadii.sheet,
              overflow: 'hidden' as const,
            }
          : null,
      ]}
    >
      <AsesorStarField
        count={18}
        colors={starColors(neo, isDark)}
        opacityScale={starOpacityScale(isDark)}
      />

      <View
        style={[
          styles.grabHandleArea,
          // 2026-08-21: la ruta es hoja en AMBAS plataformas (iOS modal /
          // Android formSheet) — el inset superior sobra también en Android.
          { paddingTop: 8 },
        ]}
        pointerEvents="none"
      >
        <View style={[styles.grabHandle, { backgroundColor: neo.sheetHandle }]} />
      </View>

      <View style={styles.topBar}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('control:coach.closeA11y')}
          hitSlop={10}
          style={({ pressed }) => [
            styles.closeButton,
            {
              backgroundColor: neo.surface,
              boxShadow: neo.shadows.raisedSm,
              opacity: pressed ? 0.85 : 1,
            },
            edgeFallback,
          ]}
        >
          <MaterialIcons name="close" size={19} color={neo.textMuted} />
        </Pressable>
        <Text style={[styles.topBarTitle, { color: neo.textMuted }]} numberOfLines={1}>
          {headerTitle.toUpperCase()}
        </Text>
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
          <Animated.View
            entering={FadeIn.duration(motionDurations.standard)}
            style={[
              styles.emptyCard,
              cssGradient(neo.raisedGradientCss, neo.surface),
              { boxShadow: neo.shadows.raisedLg },
              edgeFallback,
            ]}
          >
            <BrotMascot pose="worried" size={96} shadow={false} />
            <Text style={[styles.emptyTitle, { color: neo.text }]}>
              {t('control:coach.emptyTitle')}
            </Text>
            <Text style={[styles.emptyBody, { color: neo.text }]}>
              {t('control:coach.emptyBody')}
            </Text>
            <NeoButton
              label={t('control:coach.emptyCta')}
              onPress={onClose}
              size="compact"
              // `onClose` ya dispara el suyo — sin esto suena doble.
              haptic="none"
              style={styles.emptyCta}
            />
          </Animated.View>
        ) : (
          <>
            {/* Narrador: Brot cuenta la señal antes de la ficha. */}
            <Animated.View
              entering={FadeIn.duration(motionDurations.standard)}
              style={styles.narratorRow}
            >
              <BrotMascot pose="coach" size={104} shadow={false} />
              <View
                style={[
                  styles.bubble,
                  cssGradient(neo.raisedGradientCss, neo.surface),
                  { boxShadow: neo.shadows.raisedLg },
                  edgeFallback,
                ]}
              >
                <View
                  style={[
                    styles.bubbleChip,
                    { backgroundColor: neo.well, boxShadow: neo.shadows.insetMd },
                    edgeFallback,
                  ]}
                >
                  <MaterialIcons name="insights" size={12} color={accent} />
                  <Text
                    style={[styles.bubbleChipText, { color: accent }]}
                    numberOfLines={1}
                  >
                    {confidenceLabel(task.confidence)}
                  </Text>
                </View>
                <Text style={[styles.bubbleLine, { color: neo.text }]}>
                  {bubbleIntro(task)}
                </Text>
              </View>
            </Animated.View>

            <Animated.View
              entering={FadeIn.duration(motionDurations.deliberate).delay(
                motionStagger.section,
              )}
              style={[
                styles.heroCard,
                cssGradient(neo.raisedGradientCss, neo.surface),
                { boxShadow: neo.shadows.raisedXl },
                edgeFallback,
              ]}
            >
              <View style={styles.heroHead}>
                <View
                  style={[
                    styles.heroTile,
                    {
                      backgroundColor: typeTileBackground(type, isDark),
                      boxShadow: neo.shadows.raisedSm,
                    },
                  ]}
                >
                  <MaterialIcons
                    name={iconForSignal(task.id)}
                    size={24}
                    color={neo.text}
                  />
                </View>
                <Text
                  style={[styles.heroEyebrow, { color: neo.textMuted }]}
                  numberOfLines={2}
                >
                  {bubbleHeadline(task).toUpperCase()}
                </Text>
              </View>
              <Text style={[styles.heroTitle, { color: neo.text }]}>
                {task.title}
              </Text>
              <Text style={[styles.heroBody, { color: neo.text }]}>
                {task.body}
              </Text>
              <View style={styles.heroChips}>
                <View
                  style={[
                    styles.impactChip,
                    { backgroundColor: neo.well, boxShadow: neo.shadows.insetSm },
                    edgeFallback,
                  ]}
                >
                  <Text style={[styles.impactChipText, { color: accent }]}>
                    {impactChipLabel(task)}
                  </Text>
                </View>
              </View>
            </Animated.View>

            {constituents.length > 0 ? (
              <Animated.View
                entering={FadeIn.duration(motionDurations.deliberate).delay(
                  motionStagger.section * 2,
                )}
                style={styles.section}
              >
                <Text style={[styles.sectionEyebrow, { color: neo.textMuted }]}>
                  {t('control:coach.compuestaPor').toUpperCase()}
                </Text>
                {constituents.map((c) => (
                  <View
                    key={c.id}
                    style={[
                      styles.constituentTile,
                      {
                        backgroundColor: neo.surface,
                        boxShadow: neo.shadows.raisedSm,
                      },
                      edgeFallback,
                    ]}
                  >
                    <View
                      style={[
                        styles.constituentTileIcon,
                        {
                          backgroundColor: typeTileBackground(
                            bubbleType(c),
                            isDark,
                          ),
                        },
                      ]}
                    >
                      <MaterialIcons
                        name={iconForSignal(c.id)}
                        size={17}
                        color={neo.text}
                      />
                    </View>
                    <View style={styles.constituentText}>
                      <Text
                        style={[styles.constituentTitle, { color: neo.text }]}
                        numberOfLines={2}
                      >
                        {c.title}
                      </Text>
                      <Text
                        style={[styles.constituentBody, { color: neo.textMuted }]}
                        numberOfLines={2}
                      >
                        {c.body}
                      </Text>
                    </View>
                  </View>
                ))}
              </Animated.View>
            ) : (
              <Animated.View
                entering={FadeIn.duration(motionDurations.deliberate).delay(
                  motionStagger.section * 2,
                )}
                style={styles.section}
              >
                <Text style={[styles.sectionEyebrow, { color: neo.textMuted }]}>
                  {t('control:coach.porQueImporta').toUpperCase()}
                </Text>
                <View
                  style={[
                    styles.explanationWell,
                    { backgroundColor: neo.well, boxShadow: neo.shadows.insetLg },
                    edgeFallback,
                  ]}
                >
                  <Text style={[styles.explanationBody, { color: neo.text }]}>
                    {task.dummyExplanation ?? t('control:coach.explanationFallback')}
                  </Text>
                </View>
              </Animated.View>
            )}

            {task.action && actionMeta ? (
              <Animated.View
                entering={FadeIn.duration(motionDurations.deliberate).delay(
                  motionStagger.section * 3,
                )}
                style={styles.ctaBlock}
              >
                <NeoButton
                  label={ctaLabel}
                  onPress={onPrimaryAction}
                  haptic={actionMeta.haptic}
                  fullWidth
                  icon={
                    <MaterialIcons
                      name={actionMeta.icon}
                      size={18}
                      color={neo.ctaText}
                    />
                  }
                />
              </Animated.View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Grab handle (telegraphs swipe-down dismiss on iOS modals).
  grabHandleArea: {
    alignItems: 'center',
    paddingBottom: 6,
  },
  grabHandle: {
    width: 40,
    height: 4,
    borderRadius: neoRadii.pill,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: neoRadii.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    flexShrink: 1,
    fontSize: 11.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 11.5 * 0.14,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    gap: 18,
  },
  // ── Narrador (Brot coach + globo) ──────────────────────────────────
  narratorRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  bubble: {
    flex: 1,
    borderTopLeftRadius: neoRadii.pill,
    borderTopRightRadius: neoRadii.pill,
    borderBottomRightRadius: neoRadii.pill,
    // La punta del globo apunta a Brot: la esquina que lo mira no se
    // redondea (receta literal de `3f.html`).
    borderBottomLeftRadius: 6,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 9,
  },
  bubbleChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 13,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  bubbleChipText: {
    fontSize: 11,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.1,
  },
  bubbleLine: {
    fontSize: 14.5,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    lineHeight: 20.3,
    letterSpacing: -0.2,
  },
  // ── Ficha de la señal ──────────────────────────────────────────────
  heroCard: {
    borderRadius: neoRadii.card,
    paddingVertical: 20,
    paddingHorizontal: 20,
    gap: 10,
  },
  heroHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroTile: {
    width: 52,
    height: 52,
    borderRadius: neoRadii.tile,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  heroEyebrow: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 11.5 * 0.14,
    lineHeight: 16,
  },
  // lineHeight con headroom sobre el fontSize: en Nunito 900 un
  // lineHeight ≈ fontSize clippea el ascender en RN.
  heroTitle: {
    fontSize: 21,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.6,
    lineHeight: 27,
    marginTop: 4,
  },
  heroBody: {
    fontSize: 14.5,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    lineHeight: 21,
  },
  heroChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  impactChip: {
    borderRadius: neoRadii.chip,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  impactChipText: {
    fontSize: 11,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: 11 * 0.08,
    textTransform: 'uppercase',
  },
  // ── Secciones ──────────────────────────────────────────────────────
  section: {
    gap: 10,
  },
  sectionEyebrow: {
    fontSize: 11.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 11.5 * 0.16,
    paddingLeft: 2,
  },
  constituentTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: neoRadii.tile,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  constituentTileIcon: {
    width: 34,
    height: 34,
    borderRadius: neoRadii.chip,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  constituentText: { flex: 1, gap: 3 },
  constituentTitle: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.2,
    lineHeight: 19,
  },
  constituentBody: {
    fontSize: 12.5,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    lineHeight: 17.5,
  },
  explanationWell: {
    borderRadius: neoRadii.input,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  explanationBody: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    lineHeight: 21,
  },
  ctaBlock: { marginTop: 2 },
  // ── Señal ausente ──────────────────────────────────────────────────
  emptyCard: {
    borderRadius: neoRadii.card,
    paddingVertical: 26,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.3,
    lineHeight: 23,
    textAlign: 'center',
    marginTop: 6,
  },
  emptyBody: {
    fontSize: 13.5,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    lineHeight: 19.5,
    textAlign: 'center',
  },
  emptyCta: {
    marginTop: 8,
  },
})
