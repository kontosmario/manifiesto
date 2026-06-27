import { useCallback } from 'react'
import { ScrollView, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { RiseView } from '@/components/home/animated/rise-view'
import { GastosFilterPill } from '@/components/gastos/gastos-filter-pill'
import { triggerHaptic } from '@/lib/haptics'
import type { FijosTab } from '@/features/fijos/use-fijos-controller'

interface FijosTabsProps {
  tab: FijosTab
  setTab: (tab: FijosTab) => void
  /** Tabs a mostrar, en orden — solo las que tienen datos (las calcula el
   *  controller). Una tab vacía no aparece; si queda una sola, se muestra esa. */
  visibleTabs: FijosTab[]
  counts: {
    vencidos: number
    pendientes: number
    pagados: number
  }
}

// Color semántico por bucket. 3 buckets (2026-05-31 v4) tras retirar
// 'Próximos' — la info de fijos programados sin pagar pasó a un
// banner contextual encima del listado.
const TAB_COLORS: Record<FijosTab, string | undefined> = {
  vencidos: '#A8211B', // rojo brand-deep: urgencia máxima
  pendientes: '#F2A78C', // peach: por pagar este ciclo
  pagados: '#A6EF8F', // lime: cerrado
}

// i18n key suffixes per tab — labels resolved at render via t('fijos:tabs.*')
// so they stay translatable (the tab ids are stable identifiers).
const TAB_LABEL_KEYS: Record<FijosTab, string> = {
  vencidos: 'fijos:tabs.vencidos',
  pendientes: 'fijos:tabs.pendientes',
  pagados: 'fijos:tabs.pagados',
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
 * conocés de Gastos. Solo se muestran los buckets CON datos (`visibleTabs`
 * los calcula el controller): si no hay vencidos ni pendientes, queda solo
 * "Pagados". Cuando el tab activo se vacía, el controller redirige al
 * siguiente visible.
 */
export function FijosTabs({ tab, setTab, visibleTabs, counts }: FijosTabsProps) {
  const { t } = useTranslation()
  const handleSelect = useCallback(
    (id: string | null) => {
      if (!id) return
      void triggerHaptic('selection')
      setTab(id as FijosTab)
    },
    [setTab],
  )

  return (
    <RiseView delay={120}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {visibleTabs.map((id) => (
          <GastosFilterPill
            key={id}
            active={tab === id}
            label={t(TAB_LABEL_KEYS[id])}
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
