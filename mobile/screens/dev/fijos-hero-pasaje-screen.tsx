import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Screen } from '@/components/ui/screen'
import { HERO_STATES } from '@/components/fijos-hero-preview/hero-states'
import { StateSelector } from '@/components/fijos-hero-preview/state-selector'
import { PasajeHeroLive } from '@/components/fijos-hero-preview/pasaje-hero-live'
import { useAppTheme } from '@/theme/theme-provider'

export function FijosHeroPasajeScreen() {
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

  return (
    <Screen title="Hero · Pasaje del ciclo" canGoBack scrollable>
      <View style={styles.intro}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Variante B · Pasaje del ciclo
        </Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          Boarding pass aesthetic. La route line se dibuja izq→der, los
          dashes ya recorridos se pintan lime, el today marker hace
          bounce-in spring y luego halo pulse continuo. CountUp en los
          $ amounts.
        </Text>
      </View>

      <StateSelector
        states={HERO_STATES}
        activeId={activeId}
        onSelect={handleSelect}
        onReplay={handleReplay}
      />

      <View style={styles.heroWrapper}>
        <PasajeHeroLive key={`${activeId}-${nonce}`} state={active} />
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: theme.colors.textMuted }]}>
          Atendé especialmente al "inicio" (marker en posición 2/30) vs
          "fin de ciclo" (marker en 29/30). Los dashes lime van mostrando
          el recorrido del ciclo.
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
  title: { fontSize: 16, fontWeight: '700' },
  body: { fontSize: 13, lineHeight: 18 },
  heroWrapper: { paddingHorizontal: 16 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 32,
  },
  footerText: {
    fontSize: 11,
    fontStyle: 'italic',
    lineHeight: 15,
  },
})
