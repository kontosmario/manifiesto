import { useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'
import { ModalCard } from '@/components/ui/modal-card'
import { NeoSurface } from '@/components/ui/neo-surface'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import {
  achievementBody,
  achievementTitle,
  formatEarnedDate,
  tierShort,
} from '@/features/achievements/achievement-tiers'
import { tierTone } from '@/components/achievements/tier-tone'
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
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
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
  const neo = neoTokens(theme.mode)
  const { t } = useTranslation()
  const visible = badge != null
  // Cachea la medalla (ref en render) para que el body sobreviva la animación
  // de salida del ModalCard, cuando `badge` ya volvió a null.
  const cachedRef = useRef<AchievementViewItem | null>(badge)
  if (badge) cachedRef.current = badge
  const b = badge ?? cachedRef.current

  if (!b) {
    return <ModalCard skin="neo" visible={false} title="" subtitle="" onClose={onClose} />
  }

  const tone = tierTone(b.tier, theme.mode)
  const earned = b.earned

  return (
    <ModalCard skin="neo" visible={visible} title="" subtitle="" onClose={onClose}>
      <View style={styles.center}>
        <NeoSurface
          backgroundColor={earned ? tone.fill : neo.well}
          radius={neoRadii.card}
          style={[
            styles.iconWrap,
            {
              // El pozo del estado bloqueado se dibuja SÓLO con sombra
              // inset: en Android < 29 se descarta en silencio y el
              // medallón desaparecería contra la hoja.
              borderWidth: !earned && !SUPPORTS_INSET_SHADOW ? 1 : 0,
              borderColor: neo.sheetDivider,
            },
          ]}
          variant={earned ? 'raisedSm' : 'insetSm'}
        >
          {hasFilledAchievementIcon(b.code) ? (
            <View style={styles.iconDisc}>
              <FilledAchievementIcon code={b.code} size={72} earned={earned} />
            </View>
          ) : hasAchievementIcon(b.code) ? (
            <View
              style={[
                styles.iconDisc,
                // Bloqueado NO lleva disco: la silueta cae directo sobre el
                // pozo (el disco crema es lo que celebra al ganado).
                { backgroundColor: earned ? neo.heroText : 'transparent' },
              ]}
            >
              <AchievementIcon
                code={b.code}
                size={48}
                stroke={earned ? ICON_FOREST : neo.textMuted}
                accent={earned ? ICON_CORAL : neo.textMuted}
                accentSoft={earned ? ICON_CORAL_SOFT : neo.textMuted}
              />
            </View>
          ) : (
            <Text style={[styles.icon, !earned && styles.iconLocked]}>{b.icon}</Text>
          )}
          {!earned ? (
            <View style={[styles.lockBadge, { backgroundColor: neo.sheetHandle }]}>
              <MaterialIcons name="lock" size={13} color={neo.text} />
            </View>
          ) : null}
        </NeoSurface>

        {earned ? (
          <View style={[styles.tierPill, { backgroundColor: tone.fill }]}>
            <Text style={[styles.tierPillText, { color: tone.ink }]}>
              {tierShort(b.tier)}
            </Text>
          </View>
        ) : (
          <Text style={[styles.lockedEyebrow, { color: neo.textMuted }]}>
            {t('achievements:badgeDetail.locked')}
          </Text>
        )}

        <Text style={[styles.title, { color: neo.text }]}>
          {achievementTitle(b.code, b.title)}
        </Text>
        <Text style={[styles.body, { color: neo.textMuted }]}>
          {achievementBody(b.code, b.body)}
        </Text>

        {earned ? (
          <Text style={[styles.footnote, { color: neo.textMuted }]}>
            {t('achievements:badgeDetail.unlockedOn', { date: formatEarnedDate(b.earned_at) })}
          </Text>
        ) : (
          <Text style={[styles.footnote, { color: neo.textMuted }]}>
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
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: neoRadii.chip,
  },
  tierPillText: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1,
  },
  lockedEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.4,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    fontWeight: '400',
    fontFamily: nunitoFamily('400'),
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  footnote: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    textAlign: 'center',
    marginTop: 2,
  },
})
