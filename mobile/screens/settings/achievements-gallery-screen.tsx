import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialIcons } from '@expo/vector-icons'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { useQueryClient } from '@tanstack/react-query'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { RiseView } from '@/components/home/animated/rise-view'
import { Screen } from '@/components/ui/screen'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { DrawRing } from '@/components/ui/draw-ring'
import { CardParticles } from '@/components/ui/card-particles'
import { ErrorState } from '@/components/ui/error-state'
import { BadgeDetailSheet } from '@/components/achievements/badge-detail-sheet'
import { DARK_TAB_CANVAS, authTokens, radii } from '@/theme/palette'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic } from '@/lib/haptics'
import { useAuthSession } from '@/features/auth/use-auth-session'
import {
  useAchievements,
  type AchievementViewItem,
} from '@/features/achievements/use-achievements'
import {
  tierIsPremium,
  tierTone,
} from '@/features/achievements/achievement-tiers'
import {
  AchievementIcon,
  hasAchievementIcon,
  ICON_CORAL,
  ICON_CORAL_SOFT,
  ICON_FOREST,
} from '@/components/achievements/achievement-icon'
import { useAppTheme } from '@/theme/theme-provider'

const GRID_GAP = 10

/**
 * Galería de logros — trophy-case en grilla.
 *
 * Refactor 2026-06-19: antes gateaba TODA la pantalla en `isLoading || !data`
 * → pantalla en blanco sin skeleton mientras cargaba (el reporte "no carga").
 * Ahora: hero con anillo de progreso + grilla de medallas (earned a color con
 * ring de tier, locked como silueta con candado) + sheet de detalle al tocar.
 * Mientras carga muestra un SKELETON (nunca blanco); error → retry. Animaciones
 * livianas (una entrada por bloque, no 15 staggered) para no saturar el UI
 * thread en devices lentos.
 */
export function AchievementsGalleryScreen() {
  const { theme } = useAppTheme()
  const queryClient = useQueryClient()
  const { data: session } = useAuthSession()
  const userId = session?.user?.id
  const { data, error } = useAchievements(userId)
  const [selected, setSelected] = useState<AchievementViewItem | null>(null)

  // Orden = sort_order (el "roadmap"): los earned salen iluminados, los locked
  // como silueta, en una sola grilla — se lee como un mapa de progreso.
  const ordered = useMemo(() => {
    if (!data) return []
    return [...data.items].sort((a, b) => a.sort_order - b.sort_order)
  }, [data])

  const handleRetry = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['achievements'] })
  }, [queryClient])

  const handlePressBadge = useCallback((badge: AchievementViewItem) => {
    void triggerHaptic('selection')
    setSelected(badge)
  }, [])

  return (
    <Screen
      backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
      title="Logros"
      subtitle="Tu colección de hitos — se desbloquean solos a medida que usás Manifiesto."
      canGoBack
      bodyStyle={styles.body}
      backgroundSlot={<AmbientBlobs tone={theme.isDark ? 'calm' : 'aurora'} />}
    >
      {error && !data ? (
        <ErrorState
          title="No pudimos cargar tus logros"
          description="Probá de nuevo en un momento."
          onAction={handleRetry}
        />
      ) : !data ? (
        <AchievementsSkeleton />
      ) : (
        <>
          <RiseView>
            <ProgressRingHero
              earnedCount={data.earnedCount}
              totalCount={data.totalCount}
            />
          </RiseView>
          <RiseView delay={90}>
            <BadgeGrid items={ordered} onPress={handlePressBadge} />
          </RiseView>
        </>
      )}

      <BadgeDetailSheet badge={selected} onClose={() => setSelected(null)} />
    </Screen>
  )
}

// ─── Hero: anillo de progreso + conteo ─────────────────────────────────────
function ProgressRingHero({
  earnedCount,
  totalCount,
}: {
  earnedCount: number
  totalCount: number
}) {
  const { theme } = useAppTheme()
  const progress = totalCount > 0 ? earnedCount / totalCount : 0
  const pct = Math.round(progress * 100)
  const RING = 128

  const subtitle =
    earnedCount === 0
      ? 'Empezá a usar Manifiesto y se van desbloqueando solos.'
      : pct >= 100
        ? '¡Los tenés todos! Sos leyenda.'
        : pct >= 50
          ? 'Vas por más de la mitad. Imparable.'
          : 'Buen comienzo. Seguí sumando.'

  return (
    <LinearGradient
      colors={[...theme.colors.heroGradient] as unknown as readonly [string, string, ...string[]]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={styles.hero}
    >
      <CardParticles count={10} accentColor={authTokens.peach} />
      <View style={styles.heroRow}>
        <View style={{ width: RING, height: RING }}>
          <DrawRing
            size={RING}
            strokeWidth={11}
            color={theme.colors.heroAccent}
            trackColor="rgba(242,234,211,0.14)"
            progress={progress}
          />
          <View style={styles.ringCenter}>
            <CountUpText
              value={earnedCount}
              format={(n) => `${Math.round(n)}`}
              style={[styles.ringCount, { color: theme.colors.heroText }]}
            />
            <Text style={[styles.ringTotal, { color: theme.colors.heroMuted }]}>
              de {totalCount}
            </Text>
          </View>
        </View>
        <View style={styles.heroText}>
          <Text style={[styles.heroEyebrow, { color: theme.colors.heroAccent }]}>
            TU COLECCIÓN
          </Text>
          <Text style={[styles.heroPct, { color: theme.colors.heroText }]}>
            {pct}%
          </Text>
          <Text style={[styles.heroSub, { color: theme.colors.heroMuted }]}>
            {subtitle}
          </Text>
        </View>
      </View>
    </LinearGradient>
  )
}

// ─── Grilla de medallas ────────────────────────────────────────────────────
function BadgeGrid({
  items,
  onPress,
}: {
  items: AchievementViewItem[]
  onPress: (badge: AchievementViewItem) => void
}) {
  const { theme } = useAppTheme()
  const { width } = useWindowDimensions()
  // 3 columnas. 40 = padding horizontal del Screen (2×20).
  const tileSize = (width - 40 - GRID_GAP * 2) / 3
  // El "próximo" = primer locked por sort_order → lo resaltamos para motivar.
  const nextCode = useMemo(() => items.find((i) => !i.earned)?.code, [items])

  if (items.length === 0) {
    return (
      <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
        Pronto vas a poder desbloquear logros.
      </Text>
    )
  }

  return (
    <View style={styles.grid}>
      {items.map((item) => (
        <BadgeTile
          key={item.code}
          item={item}
          size={tileSize}
          isNext={item.code === nextCode}
          onPress={() => onPress(item)}
        />
      ))}
    </View>
  )
}

function BadgeTile({
  item,
  size,
  isNext,
  onPress,
}: {
  item: AchievementViewItem
  size: number
  isNext: boolean
  onPress: () => void
}) {
  const { theme } = useAppTheme()
  const press = usePressScale({ pressedScale: 0.95 })
  const tone = tierTone(item.tier, theme.isDark)
  const earned = item.earned
  const premium = earned && tierIsPremium(item.tier)

  const lockedBg = theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View
        style={[
          styles.tile,
          { width: size, height: size * 1.16 },
          earned
            ? { backgroundColor: tone.bg, borderColor: tone.border }
            : {
                backgroundColor: lockedBg,
                borderColor: isNext ? theme.colors.heroAccent : theme.colors.line,
              },
          premium
            ? {
                shadowColor: tone.fg,
                shadowOpacity: 0.45,
                shadowRadius: 9,
                shadowOffset: { width: 0, height: 0 },
                elevation: 5,
              }
            : null,
          press.animatedStyle,
        ]}
      >
        <View
          style={[
            styles.iconBubble,
            {
              backgroundColor: earned
                ? theme.isDark
                  ? 'rgba(255,251,242,0.92)'
                  : '#FFFBF2'
                : theme.isDark
                  ? 'rgba(255,255,255,0.04)'
                  : 'rgba(28,58,35,0.045)',
            },
          ]}
        >
          {hasAchievementIcon(item.code) ? (
            <AchievementIcon
              code={item.code}
              size={30}
              stroke={earned ? ICON_FOREST : theme.colors.textMuted}
              accent={earned ? ICON_CORAL : theme.colors.textMuted}
              accentSoft={earned ? ICON_CORAL_SOFT : theme.colors.textMuted}
            />
          ) : (
            <Text style={[styles.tileIcon, !earned && styles.tileIconLocked]}>{item.icon}</Text>
          )}
        </View>
        <Text
          style={[
            styles.tileTitle,
            { color: earned ? theme.colors.text : theme.colors.textMuted },
          ]}
          numberOfLines={2}
        >
          {item.title}
        </Text>
        {!earned ? (
          <View
            style={[
              styles.tileLock,
              {
                backgroundColor: theme.isDark
                  ? theme.colors.surfaceStrong
                  : theme.colors.borderStrong,
              },
            ]}
          >
            <MaterialIcons name="lock" size={10} color={theme.colors.textMuted} />
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  )
}

// ─── Skeleton de carga (nunca blanco) ──────────────────────────────────────
function AchievementsSkeleton() {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const { width } = useWindowDimensions()
  const tileSize = (width - 40 - GRID_GAP * 2) / 3
  const pulse = useSharedValue(0.6)

  useEffect(() => {
    if (reduced) return
    pulse.value = withRepeat(withTiming(1, { duration: 850 }), -1, true)
  }, [reduced, pulse])

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: reduced ? 0.6 : pulse.value,
  }))
  const sk = theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard

  return (
    <View style={styles.skeletonStack}>
      <Animated.View
        style={[
          styles.heroSkeleton,
          { backgroundColor: sk, borderColor: theme.colors.line },
          pulseStyle,
        ]}
      />
      <View style={styles.grid}>
        {Array.from({ length: 9 }).map((_, i) => (
          <Animated.View
            key={i}
            style={[
              styles.tile,
              {
                width: tileSize,
                height: tileSize * 1.16,
                backgroundColor: sk,
                borderColor: theme.colors.line,
              },
              pulseStyle,
            ]}
          />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // El wrapper del body del <Screen> no trae gap propio → sin esto el hero y la
  // grilla quedan pegados. 24 = tier de separación de sección.
  body: { gap: 24 },

  // Hero
  hero: {
    borderRadius: 24,
    padding: 20,
    overflow: 'hidden',
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  ringCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCount: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  ringTotal: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: -2,
  },
  heroText: {
    flex: 1,
    gap: 4,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  heroPct: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  heroSub: {
    fontSize: 12.5,
    lineHeight: 17,
  },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  tile: {
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 6,
    paddingVertical: 10,
  },
  iconBubble: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileIcon: {
    fontSize: 27,
  },
  tileIconLocked: {
    opacity: 0.35,
  },
  tileTitle: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 14,
  },
  tileLock: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 18,
    height: 18,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Skeleton
  skeletonStack: {
    gap: 24,
  },
  heroSkeleton: {
    height: 128,
    borderRadius: 24,
    borderWidth: 1,
  },

  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 40,
  },
})
