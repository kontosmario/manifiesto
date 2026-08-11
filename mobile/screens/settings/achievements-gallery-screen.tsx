import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { useQueryClient } from '@tanstack/react-query'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { decorativeDurations } from '@/lib/motion/tokens'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { RiseView } from '@/components/home/animated/rise-view'
import { NeoStateBlock } from '@/components/ui/neo-state-block'
import { Screen } from '@/components/ui/screen'
import { DrawRing } from '@/components/ui/draw-ring'
import {
  SettingsHeroCard,
  settingsHeroInk,
} from '@/components/settings/settings-hero-card'
import { BadgeDetailSheet } from '@/components/achievements/badge-detail-sheet'
import { tierTone } from '@/components/achievements/tier-tone'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic } from '@/lib/haptics'
import { useAuthSession } from '@/features/auth/use-auth-session'
import {
  useAchievements,
  type AchievementViewItem,
} from '@/features/achievements/use-achievements'
import {
  achievementTitle,
  tierIsPremium,
} from '@/features/achievements/achievement-tiers'
import {
  AchievementIcon,
  hasAchievementIcon,
  ICON_CORAL,
  ICON_CORAL_SOFT,
  ICON_FOREST,
} from '@/components/achievements/achievement-icon'
import {
  FilledAchievementIcon,
  hasFilledAchievementIcon,
} from '@/components/achievements/achievement-icon-filled'
import { useAppTheme } from '@/theme/theme-provider'
import { neoMaterial, neoRadii, neoTokens } from '@/theme/neo-tokens'
import { withAlpha } from '@/theme/color-utils'
import { nunitoFamily } from '@/theme/typography'

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
  const neo = neoTokens(theme.mode)
  const { t } = useTranslation()
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
      backgroundColor={neo.bg}
      titleColor={neo.text}
      title={t('achievements:gallery.title')}
      subtitle={t('achievements:gallery.subtitle')}
      canGoBack
      bodyStyle={styles.body}
    >
      {error && !data ? (
        <NeoStateBlock
          actionLabel={t('states:errorState.action')}
          description={t('achievements:gallery.errorDescription')}
          icon="error-outline"
          title={t('achievements:gallery.errorTitle')}
          tone="error"
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
  const { t } = useTranslation()
  const progress = totalCount > 0 ? earnedCount / totalCount : 0
  const pct = Math.round(progress * 100)
  const RING = 128

  const subtitle =
    earnedCount === 0
      ? t('achievements:gallery.hero.subEmpty')
      : pct >= 100
        ? t('achievements:gallery.hero.subComplete')
        : pct >= 50
          ? t('achievements:gallery.hero.subHalf')
          : t('achievements:gallery.hero.subStart')

  return (
    <SettingsHeroCard>
      <View style={styles.heroRow}>
        <View style={{ width: RING, height: RING }}>
          <DrawRing
            size={RING}
            strokeWidth={11}
            color={settingsHeroInk.accent}
            trackColor={withAlpha(settingsHeroInk.title, 0.24)}
            progress={progress}
          />
          <View style={styles.ringCenter}>
            <CountUpText
              value={earnedCount}
              format={(n) => `${Math.round(n)}`}
              style={[styles.ringCount, { color: settingsHeroInk.title }]}
            />
            <Text style={[styles.ringTotal, { color: settingsHeroInk.soft }]}>
              {t('achievements:gallery.hero.of', { count: totalCount })}
            </Text>
          </View>
        </View>
        <View style={styles.heroText}>
          <Text style={[styles.heroEyebrow, { color: settingsHeroInk.accent }]}>
            {t('achievements:gallery.hero.eyebrow')}
          </Text>
          <Text style={[styles.heroPct, { color: settingsHeroInk.title }]}>
            {pct}%
          </Text>
          <Text style={[styles.heroSub, { color: settingsHeroInk.soft }]}>
            {subtitle}
          </Text>
        </View>
      </View>
    </SettingsHeroCard>
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
  const neo = neoTokens(theme.mode)
  const { t } = useTranslation()
  const { width } = useWindowDimensions()
  // 3 columnas. 40 = padding horizontal del Screen (2×20).
  const tileSize = (width - 40 - GRID_GAP * 2) / 3
  // El "próximo" = primer locked por sort_order → lo resaltamos para motivar.
  const nextCode = useMemo(() => items.find((i) => !i.earned)?.code, [items])

  if (items.length === 0) {
    return (
      <Text style={[styles.emptyText, { color: neo.textMuted }]}>
        {t('achievements:gallery.empty')}
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
  const neo = neoTokens(theme.mode)
  const press = usePressScale({ pressedScale: 0.95 })
  const tone = tierTone(item.tier, theme.mode)
  const earned = item.earned
  const premium = earned && tierIsPremium(item.tier)
  const title = achievementTitle(item.code, item.title)

  // Un logro BLOQUEADO se dibuja hundido (pozo), no en relieve: el relieve es
  // lo que distingue a los ya conseguidos. El "próximo" suma un anillo verde
  // como capa extra del mismo boxShadow — el vocabulario no usa bordes.
  const material = earned
    ? {
        backgroundColor: tone.fill,
        boxShadow: premium
          ? `${neo.shadows.raisedSm}, ${tone.glow}`
          : neo.shadows.raisedSm,
      }
    : {
        ...neoMaterial(theme.mode, 'insetSm'),
        boxShadow: isNext
          ? `${neo.shadows.insetSm}, 0 0 0 2px ${neo.green}`
          : neo.shadows.insetSm,
      }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View
        style={[
          styles.tile,
          { width: size, height: size * 1.16 },
          material,
          {
            // El pozo del bloqueado y su anillo son `boxShadow`: en
            // Android < 28/29 se descartan en silencio (ver
            // `inset-shadow-support`) y el tile quedaría invisible.
            borderWidth: earned || SUPPORTS_INSET_SHADOW ? 0 : isNext ? 2 : 1,
            borderColor: isNext ? neo.green : neo.sheetDivider,
          },
          press.animatedStyle,
        ]}
      >
        <View
          style={[
            styles.iconBubble,
            // Bloqueado NO lleva disco: la silueta cae directo sobre el
            // pozo del tile (el disco crema es lo que celebra al ganado).
            { backgroundColor: earned ? neo.heroText : 'transparent' },
          ]}
        >
          {hasFilledAchievementIcon(item.code) ? (
            <FilledAchievementIcon code={item.code} size={52} earned={earned} />
          ) : hasAchievementIcon(item.code) ? (
            <AchievementIcon
              code={item.code}
              size={30}
              stroke={earned ? ICON_FOREST : neo.textMuted}
              accent={earned ? ICON_CORAL : neo.textMuted}
              accentSoft={earned ? ICON_CORAL_SOFT : neo.textMuted}
            />
          ) : (
            <Text style={[styles.tileIcon, !earned && styles.tileIconLocked]}>{item.icon}</Text>
          )}
        </View>
        <Text
          style={[
            styles.tileTitle,
            { color: earned ? neo.text : neo.textMuted },
          ]}
          numberOfLines={2}
        >
          {title}
        </Text>
        {!earned ? (
          <View style={[styles.tileLock, { backgroundColor: neo.sheetHandle }]}>
            <MaterialIcons name="lock" size={10} color={neo.text} />
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  )
}

// ─── Skeleton de carga (nunca blanco) ──────────────────────────────────────
function AchievementsSkeleton() {
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.mode)
  const reduced = useReducedMotion()
  const { width } = useWindowDimensions()
  const tileSize = (width - 40 - GRID_GAP * 2) / 3
  const pulse = useSharedValue(0.6)

  useEffect(() => {
    if (reduced) return
    pulse.value = withRepeat(withTiming(1, { duration: decorativeDurations.meterFill }), -1, true)
  }, [reduced, pulse])

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: reduced ? 0.6 : pulse.value,
  }))
  // Los placeholders son pozos: en Android < 29 la sombra inset se
  // descarta en silencio (ver `inset-shadow-support`) y sin el hairline
  // quedarían en un rectángulo casi del color del fondo.
  const skeletonMaterial = neoMaterial(theme.mode, 'insetSm')
  const flatFallback = {
    borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1,
    borderColor: neo.sheetDivider,
  }

  return (
    <View style={styles.skeletonStack}>
      <Animated.View
        style={[styles.heroSkeleton, skeletonMaterial, flatFallback, pulseStyle]}
      />
      <View style={styles.grid}>
        {Array.from({ length: 9 }).map((_, i) => (
          <Animated.View
            key={i}
            style={[
              styles.tile,
              { width: tileSize, height: tileSize * 1.16 },
              skeletonMaterial,
              flatFallback,
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
    fontFamily: nunitoFamily('800'),
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  ringTotal: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    marginTop: -2,
  },
  heroText: {
    flex: 1,
    gap: 4,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.6,
  },
  heroPct: {
    fontSize: 30,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.6,
  },
  heroSub: {
    fontSize: 12.5,
    fontWeight: '400',
    fontFamily: nunitoFamily('400'),
    lineHeight: 17,
  },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  tile: {
    borderRadius: neoRadii.tile,
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
    // Los íconos rellenos traen su disco forest cuadrado → clip a círculo.
    overflow: 'hidden',
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
    fontFamily: nunitoFamily('700'),
    textAlign: 'center',
    lineHeight: 14,
  },
  tileLock: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Skeleton
  skeletonStack: {
    gap: 24,
  },
  // 168 = padding 20×2 + el anillo de 128 del hero real: sin esto la grilla
  // salta de posición al pasar del skeleton al contenido.
  heroSkeleton: {
    height: 168,
    borderRadius: neoRadii.hero,
  },

  emptyText: {
    fontSize: 14,
    fontWeight: '400',
    fontFamily: nunitoFamily('400'),
    textAlign: 'center',
    paddingVertical: 40,
  },
})
