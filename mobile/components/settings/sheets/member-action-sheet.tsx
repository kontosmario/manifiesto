import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { ModalCard } from '@/components/ui/modal-card'
import { NeoButton } from '@/components/ui/neo-button'
import { AvatarAnimal } from '@/components/ui/avatar-animal'
import { Avatar } from '@/components/ui/avatar'
import {
  formatMemberSince,
  formatRelative,
  roleLabel,
} from '@/features/family/member-display'
import type { FamilyMemberStats } from '@/features/family/use-family-admin'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { neoInk } from '@/theme/neo-ink'
import { withAlpha } from '@/theme/color-utils'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { formatMoney } from '@/utils/money'
import { getErrorMessage } from '@/utils/error-message'
import { nunitoFamily } from '@/theme/typography'

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
  const neo = neoTokens(theme.isDark ? 'dark' : 'light')
  const ink = neoInk(theme.isDark ? 'dark' : 'light')
  const { t } = useTranslation()
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
      setError(getErrorMessage(e, t('settings:member.retryError')))
      setSubmitting(false)
    }
  }

  if (!m) {
    return <ModalCard skin="neo" visible={false} title="" subtitle="" onClose={onClose} />
  }

  const name = m.displayName
  // Bloques de datos y de acciones dentro de la hoja: pozo, no relieve.
  const surface = neo.well
  // Android < API 29 descarta el boxShadow INSET en silencio: sin él el pozo
  // queda del material de la hoja (~1.05:1 en claro) y el bloque desaparece.
  const flatFallback = SUPPORTS_INSET_SHADOW
    ? null
    : { borderWidth: 1, borderColor: neo.sheetDivider }

  return (
    <ModalCard skin="neo" visible={visible} title="" subtitle="" onClose={onClose}>
      {confirm ? (
        <View style={styles.confirmCenter}>
          <View
            style={[
              styles.confirmIcon,
              {
                backgroundColor: confirm.danger
                  ? withAlpha(neo.warm, 0.16)
                  : neo.selectedTint,
              },
            ]}
          >
            <MaterialIcons
              name={confirm.icon}
              size={26}
              color={confirm.danger ? ink.danger : neo.greenDeep}
            />
          </View>
          <Text style={[styles.confirmTitle, { color: neo.text }]}>
            {confirm.title}
          </Text>
          <Text style={[styles.confirmBody, { color: neo.textMuted }]}>
            {confirm.body}
          </Text>
          {error ? (
            <Text style={[styles.confirmError, { color: ink.danger }]}>
              {error}
            </Text>
          ) : null}
          <View style={styles.buttonRow}>
            <View style={styles.buttonCell}>
              <NeoButton
                block
                haptic="none"
                label={t('common:actions.cancel')}
                variant="ghost"
                disabled={submitting}
                onPress={() => {
                  setConfirm(null)
                  setError(null)
                }}
              />
            </View>
            <View style={styles.buttonCell}>
              <NeoButton
                block
                haptic={confirm.danger ? 'warning' : 'light'}
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
              <Avatar name={name} color={ink.accent} size={64} />
            )}
            <View style={styles.nameRow}>
              <Text
                style={[styles.name, { color: neo.text }]}
                numberOfLines={1}
              >
                {name}
                {isMe ? ` ${t('settings:member.youSuffix')}` : ''}
              </Text>
              <RoleBadge role={m.role} />
            </View>
            <Text
              style={[styles.since, { color: neo.textMuted }]}
              numberOfLines={1}
            >
              {formatMemberSince(m.memberSince)}
            </Text>
          </View>

          {/* Métricas — celdas centradas */}
          <View
            style={[
              styles.statsCard,
              { backgroundColor: surface, boxShadow: neo.shadows.insetSm },
              flatFallback,
            ]}
          >
            <View style={styles.statsRow}>
              <StatCell
                label={t('settings:member.statExpenses')}
                primary={`${m.expensesCount}`}
                secondary={formatMoney(m.expensesTotal)}
              />
              <StatCell
                label={t('settings:member.statShare')}
                primary={`${Math.round(m.spendSharePct)}%`}
                secondary={m.lastExpenseAt ? formatRelative(m.lastExpenseAt) : '—'}
              />
            </View>
            <View style={[styles.statsDivider, { backgroundColor: neo.sheetDivider }]} />
            <View style={styles.statsRow}>
              <StatCell
                label={t('settings:member.statGarden')}
                primary={m.currentStreak > 0 ? `${m.currentStreak} 🌱` : '—'}
                secondary={t('settings:member.statBest', { count: m.longestStreak })}
              />
              <StatCell
                label={t('settings:member.statFixed')}
                primary={`${m.fixedPaidCount}`}
                secondary={t('settings:member.statThisMonth')}
              />
            </View>
          </View>

          {/* Acciones — filas centradas (iOS action-sheet feel) */}
          {isMe ? (
            <Text style={[styles.ownerNote, { color: neo.textMuted }]}>
              {t('settings:member.ownerNote')}
            </Text>
          ) : (
            <View
              style={[
                styles.actionsCard,
                { backgroundColor: surface, boxShadow: neo.shadows.insetSm },
                flatFallback,
              ]}
            >
              {m.role === 'blocked' ? (
                <>
                  <ActionRow
                    icon="lock-open"
                    label={t('settings:member.unblock')}
                    onPress={() =>
                      setConfirm({
                        action: 'unblock',
                        icon: 'lock-open',
                        title: t('settings:member.unblockTitle'),
                        body: t('settings:member.unblockBody', { name }),
                        cta: t('settings:member.unblock'),
                        danger: false,
                      })
                    }
                  />
                  <ActionRow
                    icon="person-remove"
                    label={t('settings:member.removeLabel')}
                    destructive
                    isLast
                    onPress={() =>
                      setConfirm({
                        action: 'remove',
                        icon: 'person-remove',
                        title: t('settings:member.removeTitle'),
                        body: t('settings:member.removeBody', { name }),
                        cta: t('common:actions.delete'),
                        danger: true,
                      })
                    }
                  />
                </>
              ) : (
                <>
                  <ActionRow
                    icon="block"
                    label={t('settings:member.blockLabel')}
                    onPress={() =>
                      setConfirm({
                        action: 'block',
                        icon: 'block',
                        title: t('settings:member.blockTitle'),
                        body: t('settings:member.blockBody', { name }),
                        cta: t('settings:member.block'),
                        danger: false,
                      })
                    }
                  />
                  <ActionRow
                    icon="person-remove"
                    label={t('settings:member.removeLabel')}
                    destructive
                    isLast
                    onPress={() =>
                      setConfirm({
                        action: 'remove',
                        icon: 'person-remove',
                        title: t('settings:member.removeTitle'),
                        body: t('settings:member.removeBody', { name }),
                        cta: t('common:actions.delete'),
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
  const neo = neoTokens(theme.isDark ? 'dark' : 'light')
  const ink = neoInk(theme.isDark ? 'dark' : 'light')
  const color = destructive ? ink.danger : neo.text
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
          // 1.5px es el ÚNICO hairline del vocabulario neo (el mismo que separa
          // las filas de `SettingsGroup`). A `hairlineWidth` el trazo queda en
          // 0.33pt contra un `sheetDivider` de bajo contraste: no se ve.
          !isLast && {
            borderBottomColor: neo.sheetDivider,
            borderBottomWidth: 1.5,
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
  const neo = neoTokens(theme.isDark ? 'dark' : 'light')
  const ink = neoInk(theme.isDark ? 'dark' : 'light')
  if (role === 'member') return null
  const bg =
    role === 'owner' ? neo.selectedTint : withAlpha(neo.warm, 0.16)
  const fg = role === 'owner' ? ink.accent : ink.danger
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
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
  const neo = neoTokens(theme.isDark ? 'dark' : 'light')
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statLabel, { color: neo.textMuted }]}>{label}</Text>
      <Text style={[styles.statPrimary, { color: neo.text }]} numberOfLines={1}>
        {primary}
      </Text>
      <Text
        style={[styles.statSecondary, { color: neo.textMuted }]}
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
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.3,
    textAlign: 'center',
    maxWidth: '74%',
  },
  since: {
    fontSize: 12,
    fontFamily: nunitoFamily('600'),
    textAlign: 'center',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: neoRadii.pill,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  // Métricas
  statsCard: {
    borderRadius: neoRadii.tile,
    paddingVertical: 16,
    paddingHorizontal: 12,
    gap: 14,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statsDivider: {
    height: 1.5,
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
    fontFamily: nunitoFamily('700'),
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  statPrimary: {
    fontSize: 17,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  statSecondary: {
    fontSize: 11,
    fontFamily: nunitoFamily('600'),
    textAlign: 'center',
  },
  // Acciones centradas
  actionsCard: {
    borderRadius: neoRadii.tile,
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
    fontFamily: nunitoFamily('600'),
  },
  ownerNote: {
    fontSize: 13,
    fontFamily: nunitoFamily('400'),
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
    borderRadius: neoRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  confirmBody: {
    fontSize: 14,
    fontFamily: nunitoFamily('400'),
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 6,
  },
  confirmError: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
    alignSelf: 'stretch',
  },
  // Celda flex:1 para que ambos botones queden 50/50 (parejos). El botón va
  // `block` → estira al ancho de la celda; el label ya va centrado.
  buttonCell: {
    flex: 1,
  },
})
