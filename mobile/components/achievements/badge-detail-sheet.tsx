import { useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'
import { ModalCard } from '@/components/ui/modal-card'
import {
  achievementBody,
  achievementTitle,
  formatEarnedDate,
  tierShort,
  tierTone,
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
import type { AchievementViewItem } from '@/features/achievements/use-achievements'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

interface BadgeDetailSheetProps {
  /** La medalla tocada. `null` = sheet cerrado. */
  badge: AchievementViewItem | null
  onClose: () => void
}

/**
 * Detalle de una medalla — icono grande, título, descripción y estado
 * (fecha de desbloqueo o "cómo se desbloquea"). Contenido centrado (iOS feel).
 */
export function BadgeDetailSheet({ badge, onClose }: BadgeDetailSheetProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const visible = badge != null
  // Cachea la medalla (ref en render) para que el body sobreviva la animación
  // de salida del ModalCard, cuando `badge` ya volvió a null.
  const cachedRef = useRef<AchievementViewItem | null>(badge)
  if (badge) cachedRef.current = badge
  const b = badge ?? cachedRef.current

  if (!b) {
    return <ModalCard visible={false} title="" subtitle="" onClose={onClose} />
  }

  const tone = tierTone(b.tier, theme.isDark)
  const earned = b.earned

  return (
    <ModalCard visible={visible} title="" subtitle="" onClose={onClose}>
      <View style={styles.center}>
        <View
          style={[
            styles.iconWrap,
            earned
              ? { backgroundColor: tone.bg, borderColor: tone.border }
              : {
                  backgroundColor: theme.isDark
                    ? theme.colors.surfaceMuted
                    : theme.colors.creamCard,
                  borderColor: theme.colors.line,
                },
          ]}
        >
          {hasFilledAchievementIcon(b.code) ? (
            <View style={styles.iconDisc}>
              <FilledAchievementIcon code={b.code} size={72} earned={earned} />
            </View>
          ) : hasAchievementIcon(b.code) ? (
            <View
              style={[
                styles.iconDisc,
                {
                  backgroundColor: earned
                    ? '#FFFBF2'
                    : theme.isDark
                      ? 'rgba(255,255,255,0.05)'
                      : 'rgba(28,58,35,0.05)',
                },
              ]}
            >
              <AchievementIcon
                code={b.code}
                size={48}
                stroke={earned ? ICON_FOREST : theme.colors.textMuted}
                accent={earned ? ICON_CORAL : theme.colors.textMuted}
                accentSoft={earned ? ICON_CORAL_SOFT : theme.colors.textMuted}
              />
            </View>
          ) : (
            <Text style={[styles.icon, !earned && styles.iconLocked]}>{b.icon}</Text>
          )}
          {!earned ? (
            <View
              style={[
                styles.lockBadge,
                {
                  backgroundColor: theme.isDark
                    ? theme.colors.surfaceStrong
                    : theme.colors.borderStrong,
                },
              ]}
            >
              <MaterialIcons name="lock" size={13} color="#FFFFFF" />
            </View>
          ) : null}
        </View>

        {earned ? (
          <View style={[styles.tierPill, { backgroundColor: tone.bg, borderColor: tone.border }]}>
            <Text style={[styles.tierPillText, { color: tone.fg }]}>
              {tierShort(b.tier)}
            </Text>
          </View>
        ) : (
          <Text style={[styles.lockedEyebrow, { color: theme.colors.textMuted }]}>
            {t('achievements:badgeDetail.locked')}
          </Text>
        )}

        <Text style={[styles.title, { color: theme.colors.text }]}>
          {achievementTitle(b.code, b.title)}
        </Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          {achievementBody(b.code, b.body)}
        </Text>

        {earned ? (
          <Text style={[styles.footnote, { color: theme.colors.textSoft }]}>
            {t('achievements:badgeDetail.unlockedOn', { date: formatEarnedDate(b.earned_at) })}
          </Text>
        ) : (
          <Text style={[styles.footnote, { color: theme.colors.textSoft }]}>
            {t('achievements:badgeDetail.lockedHint')}
          </Text>
        )}
      </View>
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    gap: 12,
    paddingTop: 4,
    paddingBottom: 4,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: radii['2xl'],
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 48,
  },
  iconLocked: {
    opacity: 0.4,
  },
  iconDisc: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    // El ícono relleno trae su disco forest cuadrado → clip a círculo.
    overflow: 'hidden',
  },
  lockBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  tierPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  lockedEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  footnote: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
  },
})
