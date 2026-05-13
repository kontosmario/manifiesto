import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Screen } from '@/components/ui/screen'
import { HERO_STATES } from '@/components/fijos-hero-preview/hero-states'
import { StateSelector } from '@/components/fijos-hero-preview/state-selector'
import { TitularHeroLive } from '@/components/fijos-hero-preview/titular-hero-live'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Dev-only state explorer para Variant A · El Titular. Selector
 * horizontal con 6 estados, key-based remount del hero al cambiar
 * de estado para que la entrance animation se replay. Botón replay
 * fuerza re-mount sin cambiar de estado.
 */
export function FijosHeroTitularScreen() {
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
    <Screen title="Hero · El Titular" canGoBack scrollable>
      <View style={styles.intro}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Variante A · El Titular
        </Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          Magazine cover. Headline state-aware (lee el estado y escribe
          una sentencia). Cascade entrance row por row, CountUp en los
          montos del footer, breathe-dot cuando hay vencidos.
        </Text>
      </View>

      <StateSelector
        states={HERO_STATES}
        activeId={activeId}
        onSelect={handleSelect}
        onReplay={handleReplay}
      />

      <View style={styles.heroWrapper}>
        {/* key remount = replay entrance animation */}
        <TitularHeroLive key={`${activeId}-${nonce}`} state={active} />
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: theme.colors.textMuted }]}>
          Tocá los chips para cambiar de estado. Cada cambio replay la
          animación de entrada. Tocá "Replay" para repetirla sin cambiar.
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
  heroWrapper: {
    paddingHorizontal: 16,
  },
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
