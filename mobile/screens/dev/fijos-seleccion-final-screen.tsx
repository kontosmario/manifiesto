import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Screen } from '@/components/ui/screen'
import { HERO_STATES } from '@/components/fijos-hero-preview/hero-states'
import { StateSelector } from '@/components/fijos-hero-preview/state-selector'
import { TitularHeroLive } from '@/components/fijos-hero-preview/titular-hero-live'
import { ProximosLive } from '@/components/fijos-hero-preview/proximos-live'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Composición final del Fijos refactor. Muestra exclusivamente los
 * componentes ganadores (Etapa-by-etapa, cada componente que pasa el
 * gate del owner se agrega acá). Cada cambio de estado replay las
 * animaciones de entrada de TODOS los componentes — así se ve la
 * cascada completa como sería en pantalla real.
 *
 * Componentes seleccionados a la fecha:
 *   1. Hero · El Titular        (Iteration 2 winner)
 *   2. Próximos · Editorial     (segundo componente, Wrapped DNA)
 *
 * Próximos componentes a refactorizar (orden propuesto):
 *   3. SmartAlerts (hike alerts) — si se mantiene aparte
 *   4. Tabs + Category groups (la lista en sí)
 *   5. Header / FAB del screen
 */
export function FijosSeleccionFinalScreen() {
  const { theme } = useAppTheme()
  const [activeId, setActiveId] = useState<string>(HERO_STATES[0].id)
  const [nonce, setNonce] = useState(0)

  const handleSelect = useCallback((id: string) => {
    setActiveId(id)
    setNonce((n) => n + 1)
  }, [])

  const handleReplay = useCallback(() => {
    setNonce((n) => n + 1)
  }, [])

  const active = HERO_STATES.find((s) => s.id === activeId) ?? HERO_STATES[0]
  const key = `${activeId}-${nonce}`

  return (
    <Screen title="Fijos · Selección final" canGoBack scrollable>
      <View style={styles.intro}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Composición final
        </Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          Solo los componentes seleccionados. Cambio de estado o tap en
          "Replay" → cascade entrance de toda la pantalla. Esta es la
          forma final del refactor en construcción.
        </Text>
      </View>

      <StateSelector
        states={HERO_STATES}
        activeId={activeId}
        onSelect={handleSelect}
        onReplay={handleReplay}
      />

      {/* Stack en el orden del screen real */}
      <View style={styles.stack}>
        <TitularHeroLive key={`titular-${key}`} state={active} />
        <ProximosLive key={`proximos-${key}`} state={active} />
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: theme.colors.textMuted }]}>
          A medida que avancen las etapas del refactor, los nuevos
          componentes se suman acá. La idea: esta pantalla siempre
          refleja el estado actual del rediseño.
        </Text>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  intro: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
  },
  stack: {
    paddingHorizontal: 16,
    gap: 12,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 32,
  },
  footerText: {
    fontSize: 11,
    fontStyle: 'italic',
    lineHeight: 15,
  },
})
