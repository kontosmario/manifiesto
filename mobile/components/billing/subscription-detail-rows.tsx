import { memo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { NeoSurface } from '@/components/ui/neo-surface'
import { MemberAvatars } from '@/components/billing/member-avatars'
import {
  BillingIconTile,
  useRaisedFallback,
  useWellStyle,
} from '@/components/billing/billing-neo-kit'
import { neoInk } from '@/theme/neo-ink'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'

/**
 * Card de detalle de la suscripción: grupo `raisedLg` con las filas separadas
 * por el único hairline del vocabulario (`neo.sheetDivider` a 1.5px, la receta
 * de las listas de Ajustes). Cada fila = tile de ícono extruido + label
 * uppercase + valor. La fila de miembros suma los avatares del hogar y la de
 * precio muestra el monto en un pozo hundido.
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
  const neo = neoTokens(useThemeTokens().mode)
  const { t } = useTranslation()
  const flatFallback = useRaisedFallback()

  return (
    <NeoSurface radius={neoRadii.card} style={flatFallback} variant="raisedLg">
      {/* (1) Próxima renovación */}
      <Row
        icon="event"
        label={t('billing:detailRows.nextRenewal')}
        value={renewValue}
        divider
      />

      {/* (2) Miembros del hogar — con avatares a la derecha */}
      <Row
        icon="group"
        label={t('billing:detailRows.householdMembers')}
        value={t('billing:detailRows.membersValue', {
          current: memberCount,
          cap: memberCap,
        })}
        trailing={<MemberAvatars borderColor={neo.surface} initials={initials} />}
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
        divider={priceLabel != null}
      />

      {/* (4) Precio — solo para quien paga (omitido al miembro cubierto). */}
      {priceLabel ? (
        <Row
          icon="sell"
          label={t('billing:detailRows.price')}
          value={priceLabel}
          sunkenValue
        />
      ) : null}
    </NeoSurface>
  )
})

/** Una fila de la card. `divider` dibuja la línea inferior de la lista. */
function Row({
  icon,
  label,
  value,
  trailing,
  divider,
  sunkenValue,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name']
  label: string
  value: string
  trailing?: ReactNode
  divider?: boolean
  /** El monto va en un pozo, no como texto suelto. */
  sunkenValue?: boolean
}) {
  const mode = useThemeTokens().mode
  const neo = neoTokens(mode)
  const ink = neoInk(mode)
  const well = useWellStyle('insetSm')

  return (
    <View
      style={[
        styles.row,
        divider && { borderBottomWidth: 1.5, borderBottomColor: neo.sheetDivider },
      ]}
    >
      <BillingIconTile>
        <MaterialIcons color={ink.accent} name={icon} size={16} />
      </BillingIconTile>
      <View style={styles.mid}>
        <Text style={[styles.label, { color: neo.textMuted }]}>{label}</Text>
        {sunkenValue ? (
          <View style={[styles.valueWell, well]}>
            <Text style={[styles.value, { color: neo.text }]}>{value}</Text>
          </View>
        ) : (
          <Text style={[styles.value, { color: neo.text }]}>{value}</Text>
        )}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  mid: { flex: 1, gap: 3, alignItems: 'flex-start' },
  label: {
    fontSize: 10.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  valueWell: {
    borderRadius: neoRadii.chip,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  trailing: { flexShrink: 0 },
})
