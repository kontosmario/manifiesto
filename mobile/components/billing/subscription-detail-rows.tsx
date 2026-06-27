import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useAppTheme } from '@/theme/theme-provider'
import { MemberAvatars } from '@/components/billing/member-avatars'

/**
 * Card de detalle de la suscripción: 4 filas separadas por borde fino.
 * Cada fila = cuadradito con ícono (bg primarySurface) + label uppercase
 * chico + valor en negrita. La fila de miembros suma los avatares del
 * hogar a la derecha. Mockup: 06-mi-suscripcion-v2.html (.rows6 / .row6).
 */
export interface SubscriptionDetailRowsProps {
  /** Fecha de la próxima renovación ya formateada, ej. "14 jun 2027". */
  renewValue: string
  /** Iniciales de los miembros del hogar, para los avatares. */
  initials: string[]
  memberCount: number
  memberCap: number
  autoRenew: boolean
  /** Precio ya formateado, ej. "$39.99 / año". Omitido para un miembro cubierto
   *  por el hogar (no es quien paga) → la fila de precio no se muestra. */
  priceLabel?: string
}

export const SubscriptionDetailRows = memo(function SubscriptionDetailRows({
  renewValue,
  initials,
  memberCount,
  memberCap,
  autoRenew,
  priceLabel,
}: SubscriptionDetailRowsProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()

  return (
    <View
      style={[
        styles.card,
        {
          // Misma superficie que las cards de Ajustes (surfaceMuted oscuro /
          // creamCard claro + borde `line`).
          backgroundColor: theme.isDark
            ? theme.colors.surfaceMuted
            : theme.colors.creamCard,
          borderColor: theme.colors.line,
        },
      ]}
    >
      {/* (1) Próxima renovación */}
      <Row
        icon="event"
        label={t('billing:detailRows.nextRenewal')}
        value={renewValue}
      />

      {/* (2) Miembros del hogar — con avatares a la derecha */}
      <Row
        icon="group"
        label={t('billing:detailRows.householdMembers')}
        value={t('billing:detailRows.membersValue', {
          current: memberCount,
          cap: memberCap,
        })}
        trailing={
          <MemberAvatars
            initials={initials}
            borderColor={
              theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard
            }
          />
        }
        divider
      />

      {/* (3) Renovación automática */}
      <Row
        icon="autorenew"
        label={t('billing:detailRows.autoRenew')}
        value={
          autoRenew
            ? t('billing:detailRows.autoRenewOn')
            : t('billing:detailRows.autoRenewOff')
        }
        divider
      />

      {/* (4) Precio — solo para quien paga (omitido al miembro cubierto). */}
      {priceLabel ? (
        <Row
          icon="sell"
          label={t('billing:detailRows.price')}
          value={priceLabel}
          divider
        />
      ) : null}
    </View>
  )
})

/** Una fila de la card. `divider` dibuja el borde superior fino. */
function Row({
  icon,
  label,
  value,
  trailing,
  divider,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name']
  label: string
  value: string
  trailing?: React.ReactNode
  divider?: boolean
}) {
  const { theme } = useAppTheme()
  return (
    <View
      style={[
        styles.row,
        divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
      ]}
    >
      <View style={[styles.iconBox, { backgroundColor: theme.colors.primarySurface }]}>
        <MaterialIcons name={icon} size={15} color={theme.colors.primary} />
      </View>
      <View style={styles.mid}>
        <Text style={[theme.typography.eyebrow, styles.label, { color: theme.colors.textMuted }]}>
          {label}
        </Text>
        <Text style={[styles.value, { color: theme.colors.text }]}>{value}</Text>
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 11,
  },
  iconBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  mid: { flex: 1, gap: 1 },
  label: { textTransform: 'uppercase' },
  value: { fontSize: 13, fontWeight: '800' },
  trailing: { flexShrink: 0 },
})
