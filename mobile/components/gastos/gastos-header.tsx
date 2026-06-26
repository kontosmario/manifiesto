import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { TabSectionHeader } from '@/components/ui/tab-section-header'
import { CobroPendingHeaderChip } from '@/components/ui/cobro-pending-chip'

interface GastosHeaderProps {
  title?: string
  subtitle?: string
  /** Hogar activo — alimenta el chip de "cobro pendiente". */
  familyId?: string
  /** Slot en la esquina superior derecha. Hoy lo usa StreakFlameIcon;
   * antes era el botón + para registrar gasto. */
  rightSlot?: ReactNode
}

export function GastosHeader({
  title,
  subtitle,
  familyId,
  rightSlot,
}: GastosHeaderProps) {
  const { t } = useTranslation()
  return (
    <TabSectionHeader
      title={title ?? t('gastos:header.title')}
      subtitle={subtitle ?? t('gastos:header.subtitle')}
      right={rightSlot}
      // Clearance so the StreakFlameIcon's overflow badge
      // (`top: -5, right: -5`) doesn't get clipped by the SectionList
      // header cell's right edge.
      rightClearance={6}
    >
      <CobroPendingHeaderChip familyId={familyId} />
    </TabSectionHeader>
  )
}
