import { useCallback } from 'react'
import { ScrollView, StyleSheet } from 'react-native'
import { RiseView } from '@/components/home/animated/rise-view'
import { GastosFilterPill } from '@/components/gastos/gastos-filter-pill'
import { triggerHaptic } from '@/lib/haptics'
import type { FijosTab } from '@/features/fijos/use-fijos-controller'

interface FijosTabsProps {
  tab: FijosTab
  setTab: (tab: FijosTab) => void
  counts: {
    vencidos: number
    pendientes: number
    pagados: number
    proximos: number
  }
}

// Color semántico por bucket — alimenta el `color` prop de
// GastosFilterPill para que el count chip inactivo se pinte con el
// tono del estado. El darkenForLightBg / lightenForDarkBg del pill se
// ocupa de mantener AA en cada modo.
//
// 4 buckets (2026-05-30 v3): separamos "Vencidos" de "Pendientes"
// para hacer la mora más prominente. Color rojo brand-deep para que
// salte primero en el ojo.
const TAB_COLORS: Record<FijosTab, string | undefined> = {
  vencidos: '#A8211B', // rojo brand-deep: urgencia máxima
  pendientes: '#F2A78C', // peach: por pagar este ciclo
  pagados: '#A6EF8F', // lime: cerrado
  proximos: '#9DC4DE', // sky muted: calendario lejano
}

const TAB_LABELS: Record<FijosTab, string> = {
  vencidos: 'Vencidos',
  pendientes: 'Pendientes',
  pagados: 'Pagados',
  proximos: 'Próximos',
}

/**
 * Filtro de status de fijos. Reusa `GastosFilterPill` — unifica el
 * lenguaje de filtros con Gastos: misma morph active/inactive, mismo
 * spring de transición, mismo press feedback.
 *
 * Buckets (4 tabs):
 *  - Vencidos   → overdue (mora arrastrada). El más urgente.
 *  - Pendientes → pending (cuotas del ciclo activo aún sin vencer)
 *  - Pagados    → paid del ciclo (lo cerrado este mes)
 *  - Próximos   → future (fijos al día con próximo en un ciclo
 *                  posterior, ej trimestral pagado en abril cuando
 *                  estás en mayo)
 *
 * Cada bucket inactivo muestra su count en color semántico del estado;
 * el bucket activo cambia a la pill text-fg + creamCard-bg que ya
 * conocés de Gastos. Si un bucket tiene count=0 NO lo escondemos —
 * el user puede querer navegar entre vacíos para entender el sistema.
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

  // Orden: vencidos primero (más urgente) → pendientes → pagados →
  // próximos (más lejano). Refleja la jerarquía de "qué tengo que
  // mirar primero".
  const TABS: FijosTab[] = ['vencidos', 'pendientes', 'pagados', 'proximos']

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
