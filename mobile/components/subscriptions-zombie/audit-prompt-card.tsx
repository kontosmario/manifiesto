import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Avatar } from '@/components/ui/avatar'
import { useAppTheme } from '@/theme/theme-provider'
import { UsageLevelButtons } from './usage-level-buttons'
import type {
  UsageAuditRecord,
  UsageLevel,
} from '@/features/subscriptions-zombie/types'

const MEMBER_COLORS = ['#2E7D5B', '#E08E63', '#6B3A4F', '#C9A23A', '#4D6FB3', '#8A4D9A']

interface MemberLite {
  userId: string
  name: string
}

interface Props {
  fijoName: string
  fijoAmount: number
  audits: UsageAuditRecord[]
  members: MemberLite[]
  currentUserId: string
  now: Date
  onSelect: (level: UsageLevel) => void
}

function relativeTime(iso: string, now: Date, t: TFunction): string {
  const ms = now.getTime() - Date.parse(iso)
  const minutes = Math.floor(ms / 60000)
  if (minutes < 60) return t('insights:subscriptions.prompt.relAMoment')
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('insights:subscriptions.prompt.relHours', { count: hours })
  const days = Math.floor(hours / 24)
  return t('insights:subscriptions.prompt.relDays', { count: days })
}

const LEVEL_LABEL_KEY: Record<UsageLevel, string> = {
  mucho: 'insights:subscriptions.prompt.levelMucho',
  a_veces: 'insights:subscriptions.prompt.levelAVeces',
  casi_nunca: 'insights:subscriptions.prompt.levelCasiNunca',
}

export function AuditPromptCard({
  fijoName,
  fijoAmount,
  audits,
  members,
  currentUserId,
  now,
  onSelect,
}: Props) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const cardBg = theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard
  const others = audits.filter((a) => a.userId !== currentUserId)
  const youAlreadyAnswered = audits.some((a) => a.userId === currentUserId)

  return (
    <View
      style={[styles.card, { backgroundColor: cardBg }]}
      accessibilityRole="summary"
    >
      <Text style={[styles.title, { color: theme.colors.text }]}>{fijoName}</Text>
      <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
        {t('insights:subscriptions.prompt.perMonth', {
          amount: `$${fijoAmount.toLocaleString('es-AR')}`,
        })}
      </Text>

      {others.length > 0 && (
        <View style={styles.others}>
          {others.map((a) => {
            const idx = members.findIndex((m) => m.userId === a.userId)
            const member = idx >= 0 ? members[idx] : undefined
            const color = MEMBER_COLORS[(idx >= 0 ? idx : 0) % MEMBER_COLORS.length]
            return (
              <View key={a.id} style={styles.otherRow}>
                <Avatar name={member?.name ?? ''} color={color} size={24} />
                <Text style={[styles.otherText, { color: theme.colors.text }]}>
                  {member?.name ?? t('insights:subscriptions.prompt.someoneFallback')}{' '}
                  <Text style={styles.otherStrong}>{t(LEVEL_LABEL_KEY[a.level])}</Text> ·{' '}
                  {relativeTime(a.createdAt, now, t)}
                </Text>
              </View>
            )
          })}
        </View>
      )}

      {!youAlreadyAnswered ? (
        <>
          <Text style={[styles.question, { color: theme.colors.text }]}>
            {others.length > 0
              ? t('insights:subscriptions.prompt.questionAndYou')
              : t('insights:subscriptions.prompt.questionUsing')}
          </Text>
          <UsageLevelButtons onSelect={onSelect} />
        </>
      ) : (
        <Text style={[styles.answered, { color: theme.colors.textMuted }]}>
          {t('insights:subscriptions.prompt.answered')}
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 4,
  },
  title: { fontSize: 16, fontWeight: '700' },
  subtitle: { fontSize: 14, marginBottom: 8 },
  others: { gap: 6, marginBottom: 12 },
  otherRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  otherText: { fontSize: 13, flex: 1 },
  otherStrong: { fontWeight: '700' },
  question: { fontSize: 15, fontWeight: '600', marginTop: 8 },
  answered: {
    marginTop: 12,
    fontSize: 13,
    fontStyle: 'italic',
  },
})
