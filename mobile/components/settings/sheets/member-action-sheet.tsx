import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { AppButton } from '@/components/ui/button'
import { ModalCard } from '@/components/ui/modal-card'
import { AvatarAnimal } from '@/components/ui/avatar-animal'
import { Avatar } from '@/components/ui/avatar'
import {
  formatMemberSince,
  formatRelative,
  roleLabel,
} from '@/features/family/member-display'
import type { FamilyMemberStats } from '@/features/family/use-family-admin'
import { triggerHaptic } from '@/lib/haptics'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { formatMoney } from '@/utils/money'
import { getErrorMessage } from '@/utils/error-message'

type IconName = keyof typeof MaterialIcons.glyphMap
type MemberAction = 'block' | 'unblock' | 'remove'

interface ConfirmSpec {
  action: MemberAction
  icon: IconName
  title: string
  body: string
  cta: string
  danger: boolean
}

interface MemberActionSheetProps {
  /** El integrante seleccionado. `null` = sheet cerrado. */
  member: FamilyMemberStats | null
  /** El id del usuario actual (dueño). `isMe` se deriva del integrante
   *  CACHEADO, no de `member` (que se vuelve null al cerrar) — sino durante la
   *  animación de salida el dueño "saltaría" a mostrar las acciones. */
  currentUserId: string
  onClose: () => void
  onBlock: (member: FamilyMemberStats) => Promise<unknown>
  onUnblock: (member: FamilyMemberStats) => Promise<unknown>
  onRemove: (member: FamilyMemberStats) => Promise<unknown>
}

/**
 * Sheet de detalle + acciones de un integrante de la familia. Reemplaza el
 * `ActionSheetIOS`/`Alert` nativo por el `ModalCard` del sistema, con el
 * contenido CENTRADO (identidad tipo contact-card de iOS, métricas y acciones
 * centradas, confirmación tipo alert de iOS).
 *
 * Dos estados en el MISMO sheet: detalle y confirmación inline. Confirmar
 * dentro del mismo sheet (en vez de abrir un segundo modal) evita el gotcha de
 * modal-chain de iOS.
 */
export function MemberActionSheet({
  member,
  currentUserId,
  onClose,
  onBlock,
  onUnblock,
  onRemove,
}: MemberActionSheetProps) {
  const { theme } = useAppTheme()
  const visible = member != null
  // Cachea el último integrante (en un ref, actualizado en render) para que el
  // body sobreviva la animación de salida del ModalCard, cuando `member` ya
  // volvió a null.
  const cachedRef = useRef<FamilyMemberStats | null>(member)
  if (member) cachedRef.current = member
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset del estado de confirmación cada vez que se abre.
  useEffect(() => {
    if (!member) return
    setConfirm(null)
    setSubmitting(false)
    setError(null)
  }, [member])

  const m = member ?? cachedRef.current
  // Derivado del integrante CACHEADO (no de `member`) para que no cambie
  // durante la animación de salida.
  const isMe = m != null && m.userId === currentUserId

  function runFor(action: MemberAction, target: FamilyMemberStats): Promise<unknown> {
    if (action === 'block') return onBlock(target)
    if (action === 'unblock') return onUnblock(target)
    return onRemove(target)
  }

  async function handleConfirm() {
    if (!confirm || !m) return
    setSubmitting(true)
    setError(null)
    try {
      await runFor(confirm.action, m)
      void triggerHaptic('success')
      setSubmitting(false)
      onClose()
    } catch (e) {
      void triggerHaptic('error')
      setError(getErrorMessage(e, 'Inténtalo de nuevo en un momento.'))
      setSubmitting(false)
    }
  }

  if (!m) {
    return <ModalCard visible={false} title="" subtitle="" onClose={onClose} />
  }

  const name = m.displayName
  const surface = theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard

  return (
    <ModalCard visible={visible} title="" subtitle="" onClose={onClose}>
      {confirm ? (
        <View style={styles.confirmCenter}>
          <View
            style={[
              styles.confirmIcon,
              {
                backgroundColor: confirm.danger
                  ? theme.colors.peachSoft
                  : theme.colors.primarySurface,
              },
            ]}
          >
            <MaterialIcons
              name={confirm.icon}
              size={26}
              color={confirm.danger ? theme.colors.danger : theme.colors.primaryStrong}
            />
          </View>
          <Text style={[styles.confirmTitle, { color: theme.colors.text }]}>
            {confirm.title}
          </Text>
          <Text style={[styles.confirmBody, { color: theme.colors.textMuted }]}>
            {confirm.body}
          </Text>
          {error ? (
            <Text style={[styles.confirmError, { color: theme.colors.danger }]}>
              {error}
            </Text>
          ) : null}
          <View style={styles.buttonRow}>
            <View style={styles.buttonCell}>
              <AppButton
                label="Cancelar"
                variant="ghost"
                disabled={submitting}
                onPress={() => {
                  setConfirm(null)
                  setError(null)
                }}
              />
            </View>
            <View style={styles.buttonCell}>
              <AppButton
                label={confirm.cta}
                variant={confirm.danger ? 'danger' : 'primary'}
                loading={submitting}
                onPress={() => {
                  void handleConfirm()
                }}
              />
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.stack}>
          {/* Identidad — contact-card centrada (iOS feel) */}
          <View style={styles.identity}>
            {m.avatarAnimal ? (
              <AvatarAnimal slug={m.avatarAnimal} size={64} />
            ) : (
              <Avatar name={name} color={theme.colors.primary} size={64} />
            )}
            <View style={styles.nameRow}>
              <Text
                style={[styles.name, { color: theme.colors.text }]}
                numberOfLines={1}
              >
                {name}
                {isMe ? ' (tú)' : ''}
              </Text>
              <RoleBadge role={m.role} />
            </View>
            <Text
              style={[styles.since, { color: theme.colors.textMuted }]}
              numberOfLines={1}
            >
              {formatMemberSince(m.memberSince)}
            </Text>
          </View>

          {/* Métricas — celdas centradas */}
          <View
            style={[styles.statsCard, { backgroundColor: surface, borderColor: theme.colors.line }]}
          >
            <View style={styles.statsRow}>
              <StatCell
                label="Gastos del mes"
                primary={`${m.expensesCount}`}
                secondary={formatMoney(m.expensesTotal)}
              />
              <StatCell
                label="Participación"
                primary={`${Math.round(m.spendSharePct)}%`}
                secondary={m.lastExpenseAt ? formatRelative(m.lastExpenseAt) : '—'}
              />
            </View>
            <View style={[styles.statsDivider, { backgroundColor: theme.colors.line }]} />
            <View style={styles.statsRow}>
              <StatCell
                label="Jardín"
                primary={m.currentStreak > 0 ? `${m.currentStreak} 🌱` : '—'}
                secondary={`Mejor: ${m.longestStreak}`}
              />
              <StatCell
                label="Pagos fijos"
                primary={`${m.fixedPaidCount}`}
                secondary="este mes"
              />
            </View>
          </View>

          {/* Acciones — filas centradas (iOS action-sheet feel) */}
          {isMe ? (
            <Text style={[styles.ownerNote, { color: theme.colors.textMuted }]}>
              Eres el dueño de la familia. Desde aquí gestionas al resto de los
              integrantes.
            </Text>
          ) : (
            <View
              style={[styles.actionsCard, { backgroundColor: surface, borderColor: theme.colors.line }]}
            >
              {m.role === 'blocked' ? (
                <>
                  <ActionRow
                    icon="lock-open"
                    label="Desbloquear"
                    onPress={() =>
                      setConfirm({
                        action: 'unblock',
                        icon: 'lock-open',
                        title: 'Desbloquear integrante',
                        body: `${name} va a volver a poder cargar gastos.`,
                        cta: 'Desbloquear',
                        danger: false,
                      })
                    }
                  />
                  <ActionRow
                    icon="person-remove"
                    label="Eliminar de la familia"
                    destructive
                    isLast
                    onPress={() =>
                      setConfirm({
                        action: 'remove',
                        icon: 'person-remove',
                        title: 'Eliminar de la familia',
                        body: `Vas a quitar a ${name} de la familia. Sus gastos anteriores quedan.`,
                        cta: 'Eliminar',
                        danger: true,
                      })
                    }
                  />
                </>
              ) : (
                <>
                  <ActionRow
                    icon="block"
                    label="Bloquear integrante"
                    onPress={() =>
                      setConfirm({
                        action: 'block',
                        icon: 'block',
                        title: 'Bloquear integrante',
                        body: `${name} no va a poder cargar nuevos gastos. Sus datos quedan visibles.`,
                        cta: 'Bloquear',
                        danger: false,
                      })
                    }
                  />
                  <ActionRow
                    icon="person-remove"
                    label="Eliminar de la familia"
                    destructive
                    isLast
                    onPress={() =>
                      setConfirm({
                        action: 'remove',
                        icon: 'person-remove',
                        title: 'Eliminar de la familia',
                        body: `Vas a quitar a ${name} de la familia. Sus gastos anteriores quedan.`,
                        cta: 'Eliminar',
                        danger: true,
                      })
                    }
                  />
                </>
              )}
            </View>
          )}
        </View>
      )}
    </ModalCard>
  )
}

// ─── Fila de acción centrada (icono + label) ──────────────────────────────
interface ActionRowProps {
  icon: IconName
  label: string
  destructive?: boolean
  isLast?: boolean
  onPress: () => void
}

function ActionRow({ icon, label, destructive = false, isLast = false, onPress }: ActionRowProps) {
  const { theme } = useAppTheme()
  const color = destructive ? theme.colors.danger : theme.colors.text
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        void triggerHaptic('selection')
        onPress()
      }}
      style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
    >
      <View
        style={[
          styles.actionRow,
          !isLast && {
            borderBottomColor: theme.colors.line,
            borderBottomWidth: StyleSheet.hairlineWidth,
          },
        ]}
      >
        <MaterialIcons name={icon} size={20} color={color} />
        <Text style={[styles.actionLabel, { color }]}>{label}</Text>
      </View>
    </Pressable>
  )
}

// ─── Badge de rol (owner / blocked; los miembros no llevan badge) ──────────
function RoleBadge({ role }: { role: FamilyMemberStats['role'] }) {
  const { theme } = useAppTheme()
  if (role === 'member') return null
  const bg =
    role === 'owner' ? theme.colors.primarySurface : theme.colors.peachSoft
  const fg = role === 'owner' ? theme.colors.primaryStrong : theme.colors.danger
  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: theme.colors.line }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{roleLabel(role)}</Text>
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
      <Text
        style={[styles.statSecondary, { color: theme.colors.textMuted }]}
        numberOfLines={1}
      >
        {secondary}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 18 },
  // Identidad centrada
  identity: {
    alignItems: 'center',
    gap: 8,
    paddingTop: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  name: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
    maxWidth: '74%',
  },
  since: {
    fontSize: 12,
    textAlign: 'center',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  // Métricas
  statsCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    gap: 14,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statsDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 4,
  },
  statCell: {
    flex: 1,
    gap: 3,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  statPrimary: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  statSecondary: {
    fontSize: 11,
    textAlign: 'center',
  },
  // Acciones centradas
  actionsCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  ownerNote: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  // Confirmación centrada (iOS alert feel)
  confirmCenter: {
    alignItems: 'center',
    gap: 10,
    paddingTop: 4,
  },
  confirmIcon: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  confirmBody: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 6,
  },
  confirmError: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
    alignSelf: 'stretch',
  },
  // Celda flex:1 para que ambos botones queden 50/50 (parejos). El AppButton
  // es fullWidth → estira al ancho de la celda; el label ya va centrado.
  buttonCell: {
    flex: 1,
  },
})
