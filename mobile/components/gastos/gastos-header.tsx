import type { ReactNode } from 'react'
import { TabSectionHeader } from '@/components/ui/tab-section-header'

interface GastosHeaderProps {
  title?: string
  subtitle?: string
  /** Slot en la esquina superior derecha. Hoy lo usa StreakFlameIcon;
   * antes era el botón + para registrar gasto. */
  rightSlot?: ReactNode
}

export function GastosHeader({
  title = 'Gastos',
  subtitle = 'Historial, filtros y edición rápida de movimientos.',
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
    />
  )
}
