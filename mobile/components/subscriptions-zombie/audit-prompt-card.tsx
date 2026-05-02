import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Avatar } from '@/components/ui/avatar'
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

function relativeTime(iso: string, now: Date): string {
  const ms = now.getTime() - Date.parse(iso)
  const minutes = Math.floor(ms / 60000)
  if (minutes < 60) return 'hace un rato'
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'hace 1 día' : `hace ${days} días`
}

const LEVEL_LABEL: Record<UsageLevel, string> = {
  mucho: 'la usa mucho',
  a_veces: 'a veces',
  casi_nunca: 'casi nunca',
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
  const others = audits.filter((a) => a.userId !== currentUserId)
  const youAlreadyAnswered = audits.some((a) => a.userId === currentUserId)

  return (
    <View style={styles.card} accessibilityRole="summary">
      <Text style={styles.title}>{fijoName}</Text>
      <Text style={styles.subtitle}>
        ${fijoAmount.toLocaleString('es-AR')} / mes
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
                <Text style={styles.otherText}>
                  {member?.name ?? 'Alguien'}{' '}
                  <Text style={styles.otherStrong}>{LEVEL_LABEL[a.level]}</Text> ·{' '}
                  {relativeTime(a.createdAt, now)}
                </Text>
              </View>
            )
          })}
        </View>
      )}

      {!youAlreadyAnswered ? (
        <>
          <Text style={styles.question}>
            {others.length > 0 ? '¿Y vos?' : '¿La estás usando vos?'}
          </Text>
          <UsageLevelButtons onSelect={onSelect} />
        </>
      ) : (
        <Text style={styles.answered}>Ya contestaste — esperando al resto.</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F7F3ED',
    borderRadius: 16,
    padding: 16,
    gap: 4,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#2A1F1A' },
  subtitle: { fontSize: 14, color: '#6B5E55', marginBottom: 8 },
  others: { gap: 6, marginBottom: 12 },
  otherRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  otherText: { fontSize: 13, color: '#3A2F26', flex: 1 },
  otherStrong: { fontWeight: '700' },
  question: { fontSize: 15, fontWeight: '600', color: '#2A1F1A', marginTop: 8 },
  answered: {
    marginTop: 12,
    fontSize: 13,
    color: '#6B5E55',
    fontStyle: 'italic',
  },
})
