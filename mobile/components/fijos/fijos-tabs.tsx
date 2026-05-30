import { useCallback } from 'react'
import { ScrollView, StyleSheet } from 'react-native'
import { RiseView } from '@/components/home/animated/rise-view'
import { GastosFilterPill } from '@/components/gastos/gastos-filter-pill'
import { triggerHaptic } from '@/lib/haptics'
import type { FijosTab } from '@/features/fijos/use-fijos-controller'

interface FijosTabsProps {
  tab: FijosTab
  setTab: (tab: FijosTab) => void
  counts: { pendientes: number; pagados: number }
}

// Color semántico por bucket — alimenta el `color` prop de
// GastosFilterPill para que el count chip inactivo se pinte con el
// tono del estado. El darkenForLightBg / lightenForDarkBg del pill se
// ocupa de mantener AA en cada modo.
//
// Simplificado 2026-05-30: 2 tabs (eliminamos "Todos" y "Zombis").
// "Pendientes" agrupa pending + overdue/mora; "Pagados" agrupa paid +
// future (fijos al día cuyo próximo vencimiento cae fuera del ciclo).
const TAB_COLORS: Record<FijosTab, string | undefined> = {
  pendientes: '#F2A78C', // peach (urgent / por pagar)
  pagados: '#A6EF8F', // lime (success / al día)
}

const TAB_LABELS: Record<FijosTab, string> = {
  pendientes: 'Pendientes',
  pagados: 'Pagados / Próximos',
}

/**
 * Filtro de status de fijos. Reusa `GastosFilterPill` (mismo componente
 * que el filtro por categoría de Gastos) — esto unifica el lenguaje
 * de filtros entre las dos pantallas: misma morph de active/inactive,
 * misma transición spring, mismo press feedback, misma jerarquía visual.
 *
 * Buckets (2 tabs):
 *  - Pendientes      → pending + overdue (lo accionable este ciclo)
 *  - Pagados / Próximos → paid + future (lo cerrado del ciclo + lo que
 *                          no toca, ej: trimestrales recientemente
 *                          pagados con `next_due_on` en el ciclo
 *                          siguiente).
 *
 * Cada bucket inactivo muestra su count en color semántico del estado;
 * el bucket activo cambia a la pill text-fg + creamCard-bg que ya
 * conocés de Gastos.
 */
export function FijosTabs({ tab, setTab, counts }: FijosTabsProps) {
  const handleSelect = useCallback(
    (id: string | null) => {
      if (!id) return
      void triggerHaptic('selection')
      setTab(id as FijosTab)
    },
    [setTab],
  )

  const TABS: FijosTab[] = ['pendientes', 'pagados']

  return (
    <RiseView delay={120}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {TABS.map((id) => (
          <GastosFilterPill
            key={id}
            active={tab === id}
            label={TAB_LABELS[id]}
            count={counts[id]}
            color={TAB_COLORS[id]}
            selectId={id}
            onSelect={handleSelect}
          />
        ))}
      </ScrollView>
    </RiseView>
  )
}

const styles = StyleSheet.create({
  row: { gap: 6, paddingRight: 4, alignItems: 'center' },
})
