import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { AppButton } from '@/components/ui/button'
import { ModalCard } from '@/components/ui/modal-card'
import { SettingsGroup, SettingsRow } from '@/components/settings/settings-grouped-list'
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

type MemberAction = 'transfer' | 'block' | 'unblock' | 'remove'

interface ConfirmSpec {
  action: MemberAction
  title: string
  body: string
  cta: string
  danger: boolean
}

interface MemberActionSheetProps {
  /** El integrante seleccionado. `null` = sheet cerrado. */
  member: FamilyMemberStats | null
  /** True si la fila tocada es la del propio dueño (sin acciones). */
  isMe: boolean
  onClose: () => void
  onTransfer: (member: FamilyMemberStats) => Promise<unknown>
  onBlock: (member: FamilyMemberStats) => Promise<unknown>
  onUnblock: (member: FamilyMemberStats) => Promise<unknown>
  onRemove: (member: FamilyMemberStats) => Promise<unknown>
}

/**
 * Sheet de detalle + acciones de un integrante de la familia. Reemplaza el
 * `ActionSheetIOS`/`Alert` nativo por el `ModalCard` del sistema.
 *
 * Dos estados en el MISMO sheet: detalle (identidad + métricas + acciones) y
 * confirmación inline. Confirmar dentro del mismo sheet (en vez de abrir un
 * segundo modal) evita el gotcha de modal-chain de iOS.
 */
export function MemberActionSheet({
  member,
  isMe,
  onClose,
  onTransfer,
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

  function runFor(action: MemberAction, target: FamilyMemberStats): Promise<unknown> {
    if (action === 'transfer') return onTransfer(target)
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
      setError(getErrorMessage(e, 'Intentalo de nuevo en un momento.'))
      setSubmitting(false)
    }
  }

  if (!m) {
    return <ModalCard visible={false} title="" subtitle="" onClose={onClose} />
  }

  const name = m.displayName

  return (
    <ModalCard
      visible={visible}
      title={confirm ? confirm.title : ''}
      subtitle=""
      onClose={onClose}
    >
      {confirm ? (
        <View style={styles.stack}>
          <Text style={[styles.confirmBody, { color: theme.colors.textMuted }]}>
            {confirm.body}
          </Text>
          {error ? (
            <Text style={[styles.errorText, { color: theme.colors.danger }]}>
              {error}
            </Text>
          ) : null}
          <View style={styles.buttonRow}>
            <AppButton
              label="Cancelar"
              variant="ghost"
              disabled={submitting}
              onPress={() => {
                setConfirm(null)
                setError(null)
              }}
            />
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
      ) : (
        <View style={styles.stack}>
          {/* Identidad */}
          <View style={styles.identity}>
            {m.avatarAnimal ? (
              <AvatarAnimal slug={m.avatarAnimal} size={48} />
            ) : (
              <Avatar name={name} color={theme.colors.primary} size={48} />
            )}
            <View style={styles.identityCopy}>
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
          </View>

          {/* Métricas */}
          <View
            style={[
              styles.statsCard,
              {
                backgroundColor: theme.isDark
                  ? theme.colors.surfaceMuted
                  : theme.colors.creamCard,
                borderColor: theme.colors.line,
              },
            ]}
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
            <View style={styles.statsRow}>
              <StatCell
                label="Racha"
                primary={m.currentStreak > 0 ? `${m.currentStreak} 🔥` : '—'}
                secondary={`Mejor: ${m.longestStreak}`}
              />
              <StatCell
                label="Pagos fijos"
                primary={`${m.fixedPaidCount}`}
                secondary="este mes"
              />
            </View>
          </View>

          {/* Acciones */}
          {isMe ? (
            <Text style={[styles.ownerNote, { color: theme.colors.textMuted }]}>
              Sos el dueño de la familia. Desde acá gestionás al resto de los
              integrantes.
            </Text>
          ) : m.role === 'blocked' ? (
            <SettingsGroup title="Acciones">
              <SettingsRow
                icon="lock-open"
                label="Desbloquear"
                onPress={() =>
                  setConfirm({
                    action: 'unblock',
                    title: 'Desbloquear integrante',
                    body: `${name} va a volver a poder cargar gastos.`,
                    cta: 'Desbloquear',
                    danger: false,
                  })
                }
              />
              <SettingsRow
                icon="person-remove"
                label="Eliminar de la familia"
                destructive
                isLast
                onPress={() =>
                  setConfirm({
                    action: 'remove',
                    title: 'Eliminar de la familia',
                    body: `Vas a quitar a ${name} de la familia. Sus gastos anteriores quedan.`,
                    cta: 'Eliminar',
                    danger: true,
                  })
                }
              />
            </SettingsGroup>
          ) : (
            <SettingsGroup title="Acciones">
              <SettingsRow
                icon="swap-horiz"
                label="Transferir propiedad"
                onPress={() =>
                  setConfirm({
                    action: 'transfer',
                    title: 'Transferir propiedad',
                    body: `Vas a transferir la propiedad a ${name}. Vas a perder la capacidad de editar la familia.`,
                    cta: 'Transferir',
                    danger: true,
                  })
                }
              />
              <SettingsRow
                icon="block"
                label="Bloquear integrante"
                onPress={() =>
                  setConfirm({
                    action: 'block',
                    title: 'Bloquear integrante',
                    body: `${name} no va a poder cargar nuevos gastos. Sus datos quedan visibles.`,
                    cta: 'Bloquear',
                    danger: false,
                  })
                }
              />
              <SettingsRow
                icon="person-remove"
                label="Eliminar de la familia"
                destructive
                isLast
                onPress={() =>
                  setConfirm({
                    action: 'remove',
                    title: 'Eliminar de la familia',
                    body: `Vas a quitar a ${name} de la familia. Sus gastos anteriores quedan.`,
                    cta: 'Eliminar',
                    danger: true,
                  })
                }
              />
            </SettingsGroup>
          )}
        </View>
      )}
    </ModalCard>
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
  stack: { gap: 16 },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  identityCopy: {
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
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    maxWidth: '68%',
  },
  since: {
    fontSize: 12,
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
  statsCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCell: {
    flex: 1,
    gap: 2,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  statPrimary: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  statSecondary: {
    fontSize: 11,
  },
  ownerNote: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  confirmBody: {
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 2,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 2,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
})
