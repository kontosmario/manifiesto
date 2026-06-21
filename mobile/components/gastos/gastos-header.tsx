import type { ReactNode } from 'react'
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
  title = 'Gastos',
  subtitle = 'Historial, filtros y edición rápida de movimientos.',
  familyId,
  rightSlot,
}: GastosHeaderProps) {
  return (
    <TabSectionHeader
      title={title}
      subtitle={subtitle}
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
