import { useCallback, useMemo } from 'react'
import {
  ActionSheetIOS,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { RiseView } from '@/components/home/animated/rise-view'
import { AvatarAnimal } from '@/components/ui/avatar-animal'
import { Avatar } from '@/components/ui/avatar'
import { ErrorState } from '@/components/ui/error-state'
import { Screen } from '@/components/ui/screen'
import {
  useBlockMember,
  useFamilyMemberStats,
  useRemoveMember,
  useTransferOwnership,
  useUnblockMember,
  type FamilyMemberStats,
} from '@/features/family/use-family-admin'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { getErrorMessage } from '@/utils/error-message'

interface FamilyAdminScreenProps {
  userId: string
  // Legacy familyCode prop removed — household identity now travels
  // via familyId; invites are generated per-share via Settings.
}

const MONEY_FORMATTER = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

function formatMoney(value: number): string {
  try {
    return MONEY_FORMATTER.format(value)
  } catch {
    return `$${Math.round(value)}`
  }
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'Sin actividad'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'Sin actividad'
  const diffMs = Date.now() - then
  const day = 24 * 60 * 60 * 1000
  const days = Math.floor(diffMs / day)
  if (days <= 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  if (days < 30) return `Hace ${days} días`
  const months = Math.floor(days / 30)
  if (months < 12) return months === 1 ? 'Hace 1 mes' : `Hace ${months} meses`
  const years = Math.floor(days / 365)
  return years === 1 ? 'Hace 1 año' : `Hace ${years} años`
}

function formatMemberSince(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return 'Miembro'
  try {
    const formatted = parsed.toLocaleDateString('es-AR', {
      month: 'long',
      year: 'numeric',
    })
    return `Miembro desde ${formatted}`
  } catch {
    return 'Miembro'
  }
}

function roleLabel(role: FamilyMemberStats['role']): string {
  if (role === 'owner') return 'Dueño'
  if (role === 'blocked') return 'Bloqueado'
  return 'Miembro'
}

export function FamilyAdminScreen({ userId }: FamilyAdminScreenProps) {
  const { theme } = useAppTheme()
  const router = useRouter()
  const statsQuery = useFamilyMemberStats()
  const transferMutation = useTransferOwnership()
  const blockMutation = useBlockMember()
  const unblockMutation = useUnblockMember()
  const removeMutation = useRemoveMember()

  const members = statsQuery.data ?? []

  const totalMembers = members.length

  const handleBack = useCallback(() => {
    void triggerHaptic('selection')
    if (router.canGoBack()) router.back()
    else router.replace('/(app)/settings')
  }, [router])

  const runMutation = useCallback(
    async (
      mutate: (args: { targetUserId: string }) => Promise<unknown>,
      targetUserId: string,
      successMessage: string,
    ) => {
      try {
        await mutate({ targetUserId })
        void triggerHaptic('success')
        Alert.alert('Listo', successMessage)
      } catch (error) {
        void triggerHaptic('error')
        Alert.alert(
          'No pudimos hacerlo',
          getErrorMessage(error, 'Intentalo de nuevo en un momento.'),
        )
      }
    },
    [],
  )

  const confirmTransfer = useCallback(
    (member: FamilyMemberStats) => {
      Alert.alert(
        'Transferir propiedad',
        `Vas a transferir la propiedad a ${member.displayName}. Perdés la capacidad de editar la familia. ¿Continuar?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Transferir',
            style: 'destructive',
            onPress: () => {
              void runMutation(
                transferMutation.mutateAsync,
                member.userId,
                `Ahora ${member.displayName} es el dueño.`,
              )
            },
          },
        ],
      )
    },
    [runMutation, transferMutation.mutateAsync],
  )

  const confirmBlock = useCallback(
    (member: FamilyMemberStats) => {
      Alert.alert(
        'Bloquear miembro',
        `${member.displayName} no podrá cargar nuevos gastos. Sus datos quedan visibles. ¿Continuar?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Bloquear',
            style: 'destructive',
            onPress: () => {
              void runMutation(
                blockMutation.mutateAsync,
                member.userId,
                `${member.displayName} quedó bloqueado.`,
              )
            },
          },
        ],
      )
    },
    [runMutation, blockMutation.mutateAsync],
  )

  const confirmUnblock = useCallback(
    (member: FamilyMemberStats) => {
      Alert.alert(
        'Desbloquear miembro',
        `${member.displayName} volverá a poder cargar gastos. ¿Continuar?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Desbloquear',
            onPress: () => {
              void runMutation(
                unblockMutation.mutateAsync,
                member.userId,
                `${member.displayName} ya puede volver a cargar gastos.`,
              )
            },
          },
        ],
      )
    },
    [runMutation, unblockMutation.mutateAsync],
  )

  const confirmRemove = useCallback(
    (member: FamilyMemberStats) => {
      Alert.alert(
        'Eliminar de la familia',
        `Vas a quitar a ${member.displayName} de la familia. Sus gastos anteriores quedan. ¿Continuar?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Eliminar',
            style: 'destructive',
            onPress: () => {
              void runMutation(
                removeMutation.mutateAsync,
                member.userId,
                `${member.displayName} fue eliminado de la familia.`,
              )
            },
          },
        ],
      )
    },
    [runMutation, removeMutation.mutateAsync],
  )

  const openActions = useCallback(
    (member: FamilyMemberStats) => {
      if (member.userId === userId) {
        // Owner (me) — no actions.
        return
      }
      void triggerHaptic('selection')

      if (member.role === 'member') {
        const options = ['Transferir propiedad', 'Bloquear', 'Eliminar de la familia', 'Cancelar']
        if (Platform.OS === 'ios') {
          ActionSheetIOS.showActionSheetWithOptions(
            {
              title: member.displayName,
              options,
              cancelButtonIndex: 3,
              destructiveButtonIndex: 2,
            },
            (index) => {
              if (index === 0) confirmTransfer(member)
              else if (index === 1) confirmBlock(member)
              else if (index === 2) confirmRemove(member)
            },
          )
        } else {
          Alert.alert(member.displayName, 'Elegí una acción', [
            { text: 'Transferir propiedad', onPress: () => confirmTransfer(member) },
            {
              text: 'Bloquear',
              style: 'destructive',
              onPress: () => confirmBlock(member),
            },
            {
              text: 'Eliminar de la familia',
              style: 'destructive',
              onPress: () => confirmRemove(member),
            },
            { text: 'Cancelar', style: 'cancel' },
          ])
        }
        return
      }

      if (member.role === 'blocked') {
        const options = ['Desbloquear', 'Eliminar de la familia', 'Cancelar']
        if (Platform.OS === 'ios') {
          ActionSheetIOS.showActionSheetWithOptions(
            {
              title: member.displayName,
              options,
              cancelButtonIndex: 2,
              destructiveButtonIndex: 1,
            },
            (index) => {
              if (index === 0) confirmUnblock(member)
              else if (index === 1) confirmRemove(member)
            },
          )
        } else {
          Alert.alert(member.displayName, 'Elegí una acción', [
            { text: 'Desbloquear', onPress: () => confirmUnblock(member) },
            {
              text: 'Eliminar de la familia',
              style: 'destructive',
              onPress: () => confirmRemove(member),
            },
            { text: 'Cancelar', style: 'cancel' },
          ])
        }
      }
    },
    [confirmBlock, confirmRemove, confirmTransfer, confirmUnblock, userId],
  )

  const renderItem: ListRenderItem<FamilyMemberStats> = useCallback(
    ({ item, index }) => {
      const isMe = item.userId === userId
      const disabled = isMe && item.role === 'owner'
      return (
        <RiseView delay={80 * Math.min(index, 6)}>
          <MemberCard
            member={item}
            isMe={isMe}
            onPressActions={disabled ? undefined : () => openActions(item)}
          />
        </RiseView>
      )
    },
    [openActions, userId],
  )

  const listHeader = useMemo(
    () => (
      <View style={styles.headerBlock}>
        <RiseView>
          <View style={styles.topRow}>
            <Pressable
              onPress={handleBack}
              accessibilityRole="button"
              accessibilityLabel="Volver"
              hitSlop={10}
              style={({ pressed }) => [
                styles.backPill,
                {
                  backgroundColor: theme.colors.creamCard,
                  borderColor: theme.colors.line,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
            >
              <MaterialIcons name="arrow-back-ios-new" size={18} color={theme.colors.text} />
            </Pressable>
          </View>
        </RiseView>

        <RiseView delay={60}>
          <View
            style={[
              styles.hero,
              {
                backgroundColor: theme.colors.creamCard,
                borderColor: theme.colors.line,
              },
            ]}
          >
            <Text style={[styles.heroEyebrow, { color: theme.colors.textMuted }]}>
              FAMILIA
            </Text>
            <Text style={[styles.heroTitle, { color: theme.colors.text }]}>
              Gestión de familia
            </Text>
            <Text style={[styles.heroSubtitle, { color: theme.colors.textMuted }]}>
              Solo vos, como dueño, ves esta pantalla. Gestioná roles, bloqueos y
              transferencias.
            </Text>
            <View style={styles.heroPills}>
              <View
                style={[
                  styles.heroPill,
                  {
                    backgroundColor: theme.colors.creamSoft,
                    borderColor: theme.colors.line,
                  },
                ]}
              >
                <MaterialIcons name="group" size={14} color={theme.colors.text} />
                <Text style={[styles.heroPillText, { color: theme.colors.text }]}>
                  {totalMembers} {totalMembers === 1 ? 'miembro' : 'miembros'}
                </Text>
              </View>
            </View>
          </View>
        </RiseView>
      </View>
    ),
    [handleBack, theme, totalMembers],
  )

  if (statsQuery.isError && !statsQuery.data) {
    return (
      <Screen scrollable={false} contentContainerStyle={styles.screenContent}>
        <View style={styles.stack}>
          <AmbientBlobs />
          <RiseView>
            <View style={styles.topRow}>
              <Pressable
                onPress={handleBack}
                accessibilityRole="button"
                accessibilityLabel="Volver"
                hitSlop={10}
                style={({ pressed }) => [
                  styles.backPill,
                  {
                    backgroundColor: theme.colors.creamCard,
                    borderColor: theme.colors.line,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  },
                ]}
              >
                <MaterialIcons
                  name="arrow-back-ios-new"
                  size={18}
                  color={theme.colors.text}
                />
              </Pressable>
            </View>
          </RiseView>
          <ErrorState
            title="No pudimos cargar la familia"
            description={getErrorMessage(
              statsQuery.error,
              'Probá otra vez en un momento.',
            )}
            onAction={() => {
              void statsQuery.refetch()
            }}
          />
        </View>
      </Screen>
    )
  }

  return (
    <Screen scrollable={false} contentContainerStyle={styles.screenContent}>
      <View style={styles.stack}>
        <AmbientBlobs />
        <FlatList
          data={members}
          keyExtractor={(item) => item.userId}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={Separator}
          showsVerticalScrollIndicator={false}
          refreshing={statsQuery.isRefetching}
          onRefresh={() => {
            void statsQuery.refetch()
          }}
          ListEmptyComponent={
            statsQuery.isLoading ? null : (
              <Text
                style={[
                  styles.empty,
                  { color: theme.colors.textMuted },
                ]}
              >
                Todavía no hay miembros en esta familia.
              </Text>
            )
          }
        />
      </View>
    </Screen>
  )
}

function Separator() {
  return <View style={{ height: 12 }} />
}

interface MemberCardProps {
  member: FamilyMemberStats
  isMe: boolean
  onPressActions?: () => void
}

function MemberCard({ member, isMe, onPressActions }: MemberCardProps) {
  const { theme } = useAppTheme()
  const isBlocked = member.role === 'blocked'
  const roleBadgeBg =
    member.role === 'owner'
      ? theme.colors.primarySurface
      : member.role === 'blocked'
        ? theme.colors.peachSoft
        : theme.colors.creamSoft
  const roleBadgeColor =
    member.role === 'owner'
      ? theme.colors.primaryStrong
      : member.role === 'blocked'
        ? theme.colors.danger
        : theme.colors.textMuted

  const streakText = member.currentStreak > 0 ? `${member.currentStreak} 🔥` : '—'

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.creamCard,
          borderColor: isBlocked ? theme.colors.peachSoft : theme.colors.line,
          opacity: isBlocked ? 0.6 : 1,
        },
      ]}
    >
      <View style={styles.cardHead}>
        {member.avatarAnimal ? (
          <AvatarAnimal slug={member.avatarAnimal} size={52} />
        ) : (
          <Avatar name={member.displayName} color={theme.colors.primary} size={52} />
        )}
        <View style={styles.cardIdentity}>
          <View style={styles.nameRow}>
            <Text
              style={[styles.name, { color: theme.colors.text }]}
              numberOfLines={1}
            >
              {member.displayName}
              {isMe ? ' (vos)' : ''}
            </Text>
            <View
              style={[
                styles.roleBadge,
                { backgroundColor: roleBadgeBg, borderColor: theme.colors.line },
              ]}
            >
              <Text style={[styles.roleBadgeText, { color: roleBadgeColor }]}>
                {roleLabel(member.role)}
              </Text>
            </View>
          </View>
          <Text
            style={[styles.memberSince, { color: theme.colors.textMuted }]}
            numberOfLines={1}
          >
            {formatMemberSince(member.memberSince)}
          </Text>
        </View>
        {onPressActions ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Acciones para ${member.displayName}`}
            hitSlop={10}
            onPress={onPressActions}
            style={({ pressed }) => [
              styles.moreButton,
              {
                backgroundColor: theme.colors.creamSoft,
                borderColor: theme.colors.line,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              },
            ]}
          >
            <MaterialIcons name="more-horiz" size={20} color={theme.colors.text} />
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.statsGrid, { borderTopColor: theme.colors.line }]}>
        <StatCell
          label="Gastos del mes"
          primary={`${member.expensesCount}`}
          secondary={formatMoney(member.expensesTotal)}
        />
        <StatCell
          label="Participación"
          primary={`${Math.round(member.spendSharePct)}%`}
          secondary={member.lastExpenseAt ? formatRelative(member.lastExpenseAt) : '—'}
        />
        <StatCell label="Racha" primary={streakText} secondary={`Mejor: ${member.longestStreak}`} />
        <StatCell label="Pagos fijos" primary={`${member.fixedPaidCount}`} secondary="este mes" />
      </View>
    </View>
  )
}

interface StatCellProps {
  label: string
  primary: string
  secondary: string
}

function StatCell({ label, primary, secondary }: StatCellProps) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[styles.statPrimary, { color: theme.colors.text }]} numberOfLines={1}>
        {primary}
      </Text>
      <Text style={[styles.statSecondary, { color: theme.colors.textMuted }]} numberOfLines={1}>
        {secondary}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screenContent: {
    paddingTop: 14,
  },
  stack: {
    flex: 1,
    gap: 12,
    position: 'relative',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  backPill: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBlock: {
    gap: 14,
    paddingBottom: 4,
  },
  hero: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    gap: 8,
  },
  heroEyebrow: {
    fontSize: 11,
    letterSpacing: 1.6,
    fontWeight: '700',
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  heroSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  heroPills: {
    marginTop: 6,
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  heroPillText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  listContent: {
    paddingBottom: 40,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardIdentity: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
    maxWidth: '70%',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  memberSince: {
    fontSize: 12,
  },
  moreButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    gap: 8,
  },
  statCell: {
    width: '48%',
    gap: 2,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  statPrimary: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  statSecondary: {
    fontSize: 11,
  },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
  },
})
