import { useCallback } from 'react'
import { ScrollView, StyleSheet } from 'react-native'
import { RiseView } from '@/components/home/animated/rise-view'
import { GastosFilterPill } from '@/components/gastos/gastos-filter-pill'
import { triggerHaptic } from '@/lib/haptics'
import type { FijosTab } from '@/features/fijos/use-fijos-controller'

interface FijosTabsProps {
  tab: FijosTab
  setTab: (tab: FijosTab) => void
  counts: { pendientes: number; pagados: number; proximos: number }
}

// Color semántico por bucket — alimenta el `color` prop de
// GastosFilterPill para que el count chip inactivo se pinte con el
// tono del estado. El darkenForLightBg / lightenForDarkBg del pill se
// ocupa de mantener AA en cada modo.
//
// 3 buckets (2026-05-30 refinado):
//   - Pendientes → peach (urgente, por pagar)
//   - Pagados    → lime  (cerrado, éxito)
//   - Próximos   → sky muted (info, calendario lejano — distinto de
//                  los otros dos para que el ojo lo separe de un vistazo)
const TAB_COLORS: Record<FijosTab, string | undefined> = {
  pendientes: '#F2A78C',
  pagados: '#A6EF8F',
  proximos: '#9DC4DE', // sky muted: distinguible sin compitir con peach/lime
}

const TAB_LABELS: Record<FijosTab, string> = {
  pendientes: 'Pendientes',
  pagados: 'Pagados',
  proximos: 'Próximos',
}

/**
 * Filtro de status de fijos. Reusa `GastosFilterPill` — unifica el
 * lenguaje de filtros con Gastos: misma morph active/inactive, mismo
 * spring de transición, mismo press feedback.
 *
 * Buckets (3 tabs):
 *  - Pendientes → pending + overdue (lo accionable este ciclo)
 *  - Pagados    → paid del ciclo (lo cerrado este mes)
 *  - Próximos   → future (fijos al día con próximo vencimiento en un
 *                 ciclo posterior, ej trimestral pagado en abril cuando
 *                 estás en mayo)
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

  const TABS: FijosTab[] = ['pendientes', 'pagados', 'proximos']

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
