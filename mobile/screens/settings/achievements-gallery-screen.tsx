import { useEffect, useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialIcons } from '@expo/vector-icons'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { RiseView } from '@/components/home/animated/rise-view'
import { Screen } from '@/components/ui/screen'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { DARK_TAB_CANVAS } from '@/theme/palette'
import { ErrorState } from '@/components/ui/error-state'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic } from '@/lib/haptics'
import { useAuthSession } from '@/features/auth/use-auth-session'
import {
  useAchievements,
  type AchievementTier,
  type AchievementViewItem,
} from '@/features/achievements/use-achievements'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Achievements gallery — polished pass.
 *
 * Design language references (BRANDING.md + canonical home cards):
 *   - Hero progress block borrowed from `HomeHeroCard`: gradient
 *     shell, large CountUp number, 11-dot progress strip, breathing
 *     surface. Same elevation / radius tokens (24 / 20).
 *   - Earned + Locked rendered as **two separate sections** with
 *     eyebrow headers so the page reads as "achievements split by
 *     state" rather than a uniform grid (impeccable's "no identical
 *     card grids" rule).
 *   - Per-card press feedback: spring-scale 0.97 on press (Emil's
 *     "buttons must feel responsive"). Cards are accessibility
 *     buttons even though tap currently is a no-op — future
 *     expansion to a detail sheet preserves the affordance.
 *   - Tier-tinted icon rings + thin border on earned cards. No
 *     side-stripe borders (impeccable ban), full bordered shape.
 *   - Per-item stagger of `motionStagger.listItem` (40ms) on entry —
 *     a wave, not a pop.
 *   - Animated dots strip in the hero gives a glance-level "where
 *     am I" without a numerical bar — pattern over progress.
 */
export function AchievementsGalleryScreen() {
  const { theme } = useAppTheme()
  const { data: session } = useAuthSession()
  const userId = session?.user?.id
  const { data, isLoading, error } = useAchievements(userId)

  // Pre-split the items so each section can stagger independently.
  // Earned ordered by unlock date desc (newest first reads as
  // "your latest wins"). Locked stays in catalog `sort_order` so it
  // reads as a curated roadmap.
  const { earnedItems, lockedItems } = useMemo(() => {
    if (!data) return { earnedItems: [], lockedItems: [] }
    const earned: AchievementViewItem[] = []
    const locked: AchievementViewItem[] = []
    for (const item of data.items) {
      if (item.earned) earned.push(item)
      else locked.push(item)
    }
    earned.sort((a, b) => (b.earned_at ?? '').localeCompare(a.earned_at ?? ''))
    locked.sort((a, b) => a.sort_order - b.sort_order)
    return { earnedItems: earned, lockedItems: locked }
  }, [data])

  if (error && !data) {
    return (
      <Screen
        backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
        title="Logros"
        canGoBack
      >
        <ErrorState
          title="No pudimos cargar tus logros"
          description="Probá de nuevo en un momento."
        />
      </Screen>
    )
  }

  return (
    <Screen
      backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
      title="Logros"
      subtitle="Hitos que vas desbloqueando a medida que usás Manifiesto."
      canGoBack
    >
      {isLoading || !data ? null : (
        <View style={styles.stack}>
          <AmbientBlobs tone={theme.isDark ? 'calm' : 'aurora'} />
          <RiseView>
            <ProgressHero
              earnedCount={data.earnedCount}
              totalCount={data.totalCount}
              items={data.items}
            />
          </RiseView>

          {earnedItems.length === 0 ? (
            // Cold-start nudge — apunta al primer logro alcanzable
            // (sort_order asc en `lockedItems` lo deja primero).
            // Sin esto la galería de un user nuevo se siente como
            // mirar un mostrador cerrado; con esto se siente como
            // "empezás acá".
            <RiseView delay={80}>
              <StarterNudge nextItem={lockedItems[0]} />
            </RiseView>
          ) : (
            <View style={styles.section}>
              <SectionHeader label="Desbloqueados" count={earnedItems.length} />
              <View style={styles.sectionStack}>
                {earnedItems.map((item, index) => (
                  <RiseView
                    key={item.code}
                    delay={Math.min(60 + index * 40, 360)}
                  >
                    <AchievementCard item={item} />
                  </RiseView>
                ))}
              </View>
            </View>
          )}

          {lockedItems.length > 0 ? (
            <View style={styles.section}>
              <SectionHeader
                label="Por desbloquear"
                count={lockedItems.length}
                tone="muted"
              />
              <View style={styles.sectionStack}>
                {lockedItems.map((item, index) => (
                  <RiseView
                    key={item.code}
                    delay={Math.min(120 + index * 40, 480)}
                  >
                    <AchievementCard item={item} />
                  </RiseView>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  )
}

// ─────────────────────────────────────────────────────────────────
// Progress hero — gradient shell + CountUp + 11 dots strip
// ─────────────────────────────────────────────────────────────────

interface ProgressHeroProps {
  earnedCount: number
  totalCount: number
  items: AchievementViewItem[]
}

function ProgressHero({ earnedCount, totalCount, items }: ProgressHeroProps) {
  const { theme } = useAppTheme()
  const pct = totalCount === 0 ? 0 : Math.round((earnedCount / totalCount) * 100)
  // Subtle reveal of the dots row AFTER the hero number lands so the
  // user reads the figure first, then the visual breakdown.
  // Driving the SharedValue from a useEffect (not render body) is
  // important — render side-effects break React's purity contract and
  // can fire the animation on every parent re-render.
  const dotsOpacity = useSharedValue(0)
  const dotsStyle = useAnimatedStyle(() => ({ opacity: dotsOpacity.value }))
  useEffect(() => {
    dotsOpacity.value = withTiming(1, {
      duration: 480,
      easing: Easing.bezier(0.16, 1, 0.30, 1),
    })
  }, [dotsOpacity])

  return (
    <LinearGradient
      colors={[
        theme.colors.creamCard,
        theme.colors.pageBg,
      ]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.heroShell,
        { borderColor: theme.colors.line },
      ]}
    >
      <View style={styles.heroLabelRow}>
        <Text style={[styles.heroEyebrow, { color: theme.colors.textMuted }]}>
          TU PROGRESO
        </Text>
        <View
          style={[
            styles.heroPercentPill,
            {
              backgroundColor: theme.colors.primarySurface,
              borderColor: theme.colors.primarySurface,
            },
          ]}
        >
          <Text style={[styles.heroPercentText, { color: theme.colors.primaryStrong }]}>
            {pct}%
          </Text>
        </View>
      </View>

      <View style={styles.heroNumberRow}>
        <CountUpText
          value={earnedCount}
          duration={900}
          format={(n) => Math.round(n).toString()}
          style={[styles.heroBigNumber, { color: theme.colors.text }]}
          accessibilityLabel={`${earnedCount} logros desbloqueados de ${totalCount}`}
        />
        <Text style={[styles.heroDivider, { color: theme.colors.textSoft }]}>/</Text>
        <Text style={[styles.heroTotal, { color: theme.colors.textMuted }]}>
          {totalCount}
        </Text>
        <Text style={[styles.heroTotalSuffix, { color: theme.colors.textMuted }]}>
          logros
        </Text>
      </View>

      <Animated.View style={[styles.dotsRow, dotsStyle]}>
        {items.map((item) => (
          <View
            key={item.code}
            style={[
              styles.dot,
              item.earned
                ? {
                    backgroundColor: tierTone(item.tier).fg,
                    borderColor: tierTone(item.tier).fg,
                  }
                : {
                    backgroundColor: 'transparent',
                    borderColor: theme.colors.line,
                  },
            ]}
          />
        ))}
      </Animated.View>

      <Text style={[styles.heroFootnote, { color: theme.colors.textSoft }]}>
        Cada logro se desbloquea automáticamente cuando hacés la acción
        correspondiente. No hay que reclamar nada.
      </Text>
    </LinearGradient>
  )
}

// ─────────────────────────────────────────────────────────────────
// Starter nudge — empty state when earnedCount === 0
// ─────────────────────────────────────────────────────────────────

interface StarterNudgeProps {
  /** Primer item del catálogo en sort_order — el más alcanzable. */
  nextItem: AchievementViewItem | undefined
}

function StarterNudge({ nextItem }: StarterNudgeProps) {
  const { theme } = useAppTheme()
  return (
    <View
      style={[
        starterStyles.card,
        {
          backgroundColor: theme.colors.creamCard,
          borderColor: theme.colors.line,
        },
      ]}
    >
      <View
        style={[
          starterStyles.iconWrap,
          { backgroundColor: theme.colors.primarySurface },
        ]}
      >
        <Text style={starterStyles.iconGlyph}>{nextItem?.icon ?? '🌱'}</Text>
      </View>
      <Text style={[starterStyles.eyebrow, { color: theme.colors.textMuted }]}>
        TU PRIMER LOGRO
      </Text>
      <Text style={[starterStyles.title, { color: theme.colors.text }]}>
        {nextItem?.title ?? 'Está a un gasto de distancia'}
      </Text>
      <Text style={[starterStyles.body, { color: theme.colors.textMuted }]}>
        {nextItem?.body ?? 'Cargá tu primer movimiento y empezamos.'}
      </Text>
    </View>
  )
}

const starterStyles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: 1,
    paddingTop: 22,
    paddingBottom: 20,
    paddingHorizontal: 22,
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  iconGlyph: {
    fontSize: 26,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  body: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    letterSpacing: 0,
    textAlign: 'center',
    maxWidth: 280,
  },
})

// ─────────────────────────────────────────────────────────────────
// Section header — eyebrow + count chip
// ─────────────────────────────────────────────────────────────────

function SectionHeader({
  label,
  count,
  tone = 'primary',
}: {
  label: string
  count: number
  tone?: 'primary' | 'muted'
}) {
  const { theme } = useAppTheme()
  const isMuted = tone === 'muted'
  return (
    <View style={styles.sectionHeader}>
      <Text
        style={[
          styles.sectionEyebrow,
          {
            color: isMuted ? theme.colors.textSoft : theme.colors.textMuted,
          },
        ]}
      >
        {label.toUpperCase()}
      </Text>
      <View
        style={[
          styles.sectionCount,
          {
            backgroundColor: isMuted
              ? 'rgba(115,129,116,0.10)'
              : theme.colors.primarySurface,
          },
        ]}
      >
        <Text
          style={[
            styles.sectionCountText,
            {
              color: isMuted ? theme.colors.textSoft : theme.colors.primaryStrong,
            },
          ]}
        >
          {count}
        </Text>
      </View>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────
// Achievement card — Pressable row with tier ring + state styling
// ─────────────────────────────────────────────────────────────────

interface AchievementCardProps {
  item: AchievementViewItem
}

function AchievementCard({ item }: AchievementCardProps) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  // Press feedback per Emil: scale to 0.97 with fast ease-out.
  // usePressScale already encapsulates the spring; we just spread its
  // animatedStyle onto the Pressable wrapper.
  const press = usePressScale({ pressedScale: 0.97 })

  const tone = tierTone(item.tier)
  const earned = item.earned
  // Sheen sweep only for earned gold/legendary — premium tiers deserve
  // a special entrance. A translucent highlight band slides across once
  // on mount (transform+opacity only, GPU-safe). Under reduced motion
  // the sheen stays invisible (opacity 0, no motion).
  const isPremium = earned && (item.tier === 'gold' || item.tier === 'legendary')
  const sheenX = useSharedValue(-120)
  const sheenOpacity = useSharedValue(0)

  useEffect(() => {
    if (!isPremium || reduced) return
    sheenX.value = -120
    sheenOpacity.value = 0
    // Delay slightly so the RiseView stagger entrance lands first.
    sheenOpacity.value = withDelay(
      180,
      withTiming(1, { duration: 60, easing: Easing.bezier(0.16, 1, 0.30, 1) }),
    )
    sheenX.value = withDelay(
      180,
      withTiming(340, {
        duration: 520,
        easing: Easing.bezier(0.16, 1, 0.30, 1),
      }),
    )
    // Fade the sheen out near the end so it doesn't linger.
    sheenOpacity.value = withDelay(
      500,
      withTiming(0, { duration: 160, easing: Easing.bezier(0.16, 1, 0.30, 1) }),
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPremium, reduced])

  const sheenStyle = useAnimatedStyle(() => ({
    opacity: sheenOpacity.value,
    transform: [{ translateX: sheenX.value }],
  }))

  return (
    <Animated.View style={press.animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          earned
            ? `${item.title}, desbloqueado el ${formatEarnedDate(item.earned_at)}`
            : `${item.title}, bloqueado. ${item.body}`
        }
        accessibilityHint={
          earned
            ? 'Tocá para ver el detalle del logro'
            : 'Logro pendiente — completá la acción correspondiente para desbloquearlo'
        }
        onPress={() => {
          // Future: open detail sheet with context (e.g. show the
          // streak count at unlock time). For now just a haptic so
          // the tap registers — confirms the affordance is real.
          void triggerHaptic('selection')
        }}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: theme.colors.creamCard,
            borderColor: earned ? tone.border : theme.colors.line,
            opacity: earned ? 1 : 0.62,
          },
          pressed && { opacity: earned ? 0.9 : 0.55 },
        ]}
      >
        {/*
          Icon bubble: cream surface with tier-tinted ring around it.
          Locked items render the brand glyph in grayscale with a
          lock superimposed in the bottom-right corner — keeps the
          "what is this" signal but signals "not yet".
        */}
        <View style={styles.cardIconWrap}>
          {earned ? (
            <View
              style={[
                styles.iconRing,
                {
                  backgroundColor: tone.bg,
                  borderColor: tone.border,
                },
              ]}
            >
              <Text style={styles.iconGlyph} maxFontSizeMultiplier={1.2}>
                {item.icon}
              </Text>
            </View>
          ) : (
            <View
              style={[
                styles.iconRingLocked,
                { borderColor: theme.colors.line },
              ]}
            >
              <Text style={styles.iconGlyphLocked} maxFontSizeMultiplier={1.2}>
                {item.icon}
              </Text>
              <View
                style={[
                  styles.lockBadge,
                  {
                    backgroundColor: theme.colors.surfaceMuted,
                    borderColor: theme.colors.line,
                  },
                ]}
              >
                <MaterialIcons name="lock" size={10} color={theme.colors.textSoft} />
              </View>
            </View>
          )}
        </View>

        {/* Body — title + descriptive text + earned date or tier label */}
        <View style={styles.cardBody}>
          <View style={styles.cardTitleRow}>
            <Text
              style={[styles.cardTitle, { color: theme.colors.text }]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            {earned ? (
              <View style={[styles.tierBadge, { backgroundColor: tone.bg }]}>
                <Text style={[styles.tierBadgeText, { color: tone.fg }]}>
                  {tierShort(item.tier)}
                </Text>
              </View>
            ) : null}
          </View>
          <Text
            style={[styles.cardCopy, { color: theme.colors.textMuted }]}
            numberOfLines={2}
          >
            {item.body}
          </Text>
          {earned && item.earned_at ? (
            <Text style={[styles.cardDate, { color: theme.colors.textSoft }]}>
              Desbloqueado · {formatEarnedDate(item.earned_at)}
            </Text>
          ) : null}
        </View>

        {/* Sheen sweep — gold/legendary only, single-shot on entrance.
            Positioned absolutely so it overlays the full card without
            affecting layout. ClipRect comes from card's overflow:hidden. */}
        {isPremium ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.sheenBand, sheenStyle]}
          />
        ) : null}
      </Pressable>
    </Animated.View>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tier color tones — single source of truth
// ─────────────────────────────────────────────────────────────────

function tierTone(tier: AchievementTier) {
  switch (tier) {
    case 'bronze':
      return {
        bg: 'rgba(242, 181, 138, 0.22)',
        fg: '#B84014',
        border: 'rgba(242, 181, 138, 0.55)',
      }
    case 'silver':
      return {
        bg: 'rgba(170, 178, 196, 0.22)',
        fg: '#5C6376',
        border: 'rgba(170, 178, 196, 0.55)',
      }
    case 'gold':
      return {
        bg: 'rgba(244, 210, 107, 0.26)',
        fg: '#9E7C12',
        border: 'rgba(244, 210, 107, 0.55)',
      }
    case 'legendary':
      return {
        bg: 'rgba(166, 239, 143, 0.26)',
        fg: '#1F590D',
        border: 'rgba(166, 239, 143, 0.65)',
      }
  }
}

function tierShort(tier: AchievementTier): string {
  switch (tier) {
    case 'bronze': return 'BRONCE'
    case 'silver': return 'PLATA'
    case 'gold': return 'ORO'
    case 'legendary': return 'LEYENDA'
  }
}

function formatEarnedDate(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

const styles = StyleSheet.create({
  stack: { gap: 28 },

  // Hero
  heroShell: {
    padding: 22,
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  heroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  heroPercentPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  heroPercentText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  heroNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  heroBigNumber: {
    fontSize: 56,
    fontWeight: '800',
    letterSpacing: -2,
    lineHeight: 60,
  },
  heroDivider: {
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: -1,
  },
  heroTotal: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  heroTotalSuffix: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginLeft: 6,
    textTransform: 'uppercase',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 18,
    marginBottom: 14,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  heroFootnote: {
    fontSize: 12,
    lineHeight: 16,
    fontStyle: 'italic',
  },

  // Section
  section: { gap: 12 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 2,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  sectionCount: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    minWidth: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCountText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
  },
  sectionStack: { gap: 10 },

  // Card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 84, // ≥44pt + body, comfortable touch target
    overflow: 'hidden', // clips the sheen sweep to the card boundary
  },
  cardIconWrap: {
    position: 'relative',
  },
  iconRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  iconRingLocked: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(115,129,116,0.06)',
    position: 'relative',
  },
  iconGlyph: {
    fontSize: 26,
  },
  iconGlyphLocked: {
    fontSize: 22,
    opacity: 0.4,
  },
  lockBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },

  cardBody: {
    flex: 1,
    gap: 4,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  tierBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  tierBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  cardCopy: {
    fontSize: 13,
    lineHeight: 17,
  },
  cardDate: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 4,
  },
  // Sheen sweep — gold/legendary earned cards only, clipped by card overflow:hidden.
  // A diagonal-ish translucent band that slides left→right once on entrance.
  sheenBand: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 60,
    backgroundColor: 'rgba(255,255,255,0.18)',
    // Skew gives a diagonal slash rather than a square beam.
    transform: [{ skewX: '-20deg' }],
  },
})
