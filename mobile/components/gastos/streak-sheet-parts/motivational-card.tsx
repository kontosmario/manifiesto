import { StyleSheet, Text, View } from 'react-native'
import { RiseView } from '@/components/home/animated/rise-view'
import { useAppTheme } from '@/theme/theme-provider'
import type { AtRiskIntensity, StreakData, StreakDerived } from '@/features/streaks/use-streak'
import { getAtRiskTone, getStatusTone } from './streak-sheet-tone'

/**
 * Cards mostradas debajo del WeekActivity según `derived.status`:
 *   • ShieldNotice — at_risk con escudos disponibles
 *   • ConsequenceCard — at_risk sin escudos (warning rojo de qué se pierde)
 *   • RecoveryCard — broken (copy de "puedes volver")
 *   • MotivationalCard — active (mensaje + récord personal)
 *   • PersonalStats — siempre (récord + total logged)
 *   • FreezeInfo — siempre (caption del sistema de escudos)
 *
 * Cada uno es self-contained — el orquestador decide cuál mostrar
 * según el status y delega a este file.
 */

interface ShieldNoticeProps {
  tokens: number
  intensity: AtRiskIntensity | null
}

export function ShieldNotice({ tokens, intensity }: ShieldNoticeProps) {
  const { theme } = useAppTheme()
  const tone = getAtRiskTone(intensity ?? 'urgent', theme.isDark)
  return (
    <RiseView delay={180}>
      <View
        style={[
          styles.card,
          { backgroundColor: tone.cardBg, borderColor: tone.cardBorder },
        ]}
      >
        <View style={styles.cardRow}>
          <View style={[styles.cardIcon, { backgroundColor: `${tone.fg}2A` }]}>
            <Text style={styles.cardIconEmoji}>🛡️</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: tone.fg }]}>
              Tienes {tokens}{' '}
              {tokens === 1 ? 'escudo disponible' : 'escudos disponibles'}
            </Text>
            <Text style={[styles.cardBody, { color: tone.soft }]}>
              Si no registras hoy, el escudo protege tu racha automáticamente a
              las 23:59.
            </Text>
          </View>
        </View>
      </View>
    </RiseView>
  )
}

interface ConsequenceCardProps {
  data: StreakData
  derived: StreakDerived
}

export function ConsequenceCard({ data, derived }: ConsequenceCardProps) {
  const { theme } = useAppTheme()
  const danger = theme.isDark
    ? { fg: '#E88A70', bg: 'rgba(224,85,85,0.12)', border: 'rgba(224,85,85,0.32)' }
    : { fg: '#C03A2A', bg: 'rgba(224,85,85,0.08)', border: 'rgba(224,85,85,0.24)' }
  const lost = Math.max(0, data.currentStreak - derived.regressionDay)
  const rows = [
    `Vuelves al día ${derived.regressionDay} (inicio de ${derived.levelLabel})`,
    `Pierdes ${lost} ${lost === 1 ? 'día' : 'días'} de progreso ganados`,
    `Necesitarías ${derived.daysToNextLevel + lost} días más para llegar a ${derived.nextLevelLabel}`,
  ]
  return (
    <RiseView delay={180}>
      <View
        style={[
          styles.card,
          { backgroundColor: danger.bg, borderColor: danger.border },
        ]}
      >
        <Text
          style={[styles.cardTitle, { color: danger.fg, marginBottom: 10 }]}
        >
          Si no registras hoy
        </Text>
        {rows.map((text, i) => (
          <View key={i} style={styles.consequenceRow}>
            <View style={[styles.consequenceDot, { backgroundColor: danger.fg }]} />
            <Text style={[styles.cardBody, { color: danger.fg }]}>
              {text}
            </Text>
          </View>
        ))}
      </View>
    </RiseView>
  )
}

interface RecoveryCardProps {
  derived: StreakDerived
}

export function RecoveryCard({ derived }: RecoveryCardProps) {
  const { theme } = useAppTheme()
  return (
    <RiseView delay={180}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.creamCard,
            borderColor: theme.colors.line,
          },
        ]}
      >
        <Text
          style={[
            styles.cardTitle,
            { color: theme.colors.text, marginBottom: 6 },
          ]}
        >
          Puedes volver
        </Text>
        <Text style={[styles.cardBody, { color: theme.colors.textMuted }]}>
          {derived.copyMessage}
        </Text>
      </View>
    </RiseView>
  )
}

interface MotivationalCardProps {
  data: StreakData
  derived: StreakDerived
}

export function MotivationalCard({ data, derived }: MotivationalCardProps) {
  const { theme } = useAppTheme()
  const tone = getStatusTone('active', null, theme.isDark)
  return (
    <RiseView delay={180}>
      <View
        style={[
          styles.card,
          { backgroundColor: tone.cardBg, borderColor: tone.cardBorder },
        ]}
      >
        <Text style={[styles.cardBody, { color: tone.fg, lineHeight: 20 }]}>
          {derived.copyMessage}
        </Text>
        {data.currentStreak > data.longestStreak - 5 &&
        data.currentStreak < data.longestStreak ? (
          <Text style={[styles.cardBody, { color: tone.fg, marginTop: 8 }]}>
            A {data.longestStreak - data.currentStreak} días de tu récord personal de{' '}
            {data.longestStreak} días.
          </Text>
        ) : null}
        {data.currentStreak >= data.longestStreak && data.longestStreak > 0 ? (
          <Text
            style={[
              styles.cardBody,
              { color: tone.fg, fontWeight: '800', marginTop: 8 },
            ]}
          >
            🏆 Estás en tu récord personal. ¡Sigue!
          </Text>
        ) : null}
      </View>
    </RiseView>
  )
}

interface PersonalStatsProps {
  data: StreakData
}

export function PersonalStats({ data }: PersonalStatsProps) {
  const { theme } = useAppTheme()
  return (
    <RiseView delay={240}>
      <View style={styles.statsGrid}>
        <View
          style={[
            styles.statCard,
            {
              backgroundColor: theme.colors.creamCard,
              borderColor: theme.colors.line,
            },
          ]}
        >
          <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>
            Récord personal
          </Text>
          <Text style={[styles.statValue, { color: theme.colors.text }]}>
            {data.longestStreak} {data.longestStreak === 1 ? 'día' : 'días'}
          </Text>
        </View>
        <View
          style={[
            styles.statCard,
            {
              backgroundColor: theme.colors.creamCard,
              borderColor: theme.colors.line,
            },
          ]}
        >
          <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>
            Total registrado
          </Text>
          <Text style={[styles.statValue, { color: theme.colors.text }]}>
            {data.totalDaysLogged} {data.totalDaysLogged === 1 ? 'día' : 'días'}
          </Text>
        </View>
      </View>
    </RiseView>
  )
}

interface FreezeInfoProps {
  tokens: number
}

export function FreezeInfo({ tokens }: FreezeInfoProps) {
  const { theme } = useAppTheme()
  return (
    <Text style={[styles.freezeInfo, { color: theme.colors.textMuted }]}>
      Ganas un escudo cada 7 días seguidos de racha.{'\n'}
      Tienes {tokens} · Puedes acumular hasta 2.
    </Text>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  cardIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  cardIconEmoji: { fontSize: 16, lineHeight: 20 },
  cardTitle: { fontSize: 13, fontWeight: '800', marginBottom: 4 },
  cardBody: { fontSize: 12, lineHeight: 18 },
  consequenceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 5,
  },
  consequenceDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 6,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
  },
  statLabel: { fontSize: 10, marginBottom: 4, fontWeight: '600' },
  statValue: { fontSize: 18, fontWeight: '800' },
  freezeInfo: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 4,
  },
})
