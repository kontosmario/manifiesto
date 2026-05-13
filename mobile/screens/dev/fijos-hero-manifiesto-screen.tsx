import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Screen } from '@/components/ui/screen'
import { HERO_STATES } from '@/components/fijos-hero-preview/hero-states'
import { StateSelector } from '@/components/fijos-hero-preview/state-selector'
import { ManifiestoHeroLive } from '@/components/fijos-hero-preview/manifiesto-hero-live'
import { useAppTheme } from '@/theme/theme-provider'

export function FijosHeroManifiestoScreen() {
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
    <Screen title="Hero · Manifiesto Diario" canGoBack scrollable>
      <View style={styles.intro}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Variante C · Manifiesto Diario
        </Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          Mini-Wrapped en el hero. 3 páginas auto-rotando cada 5s con
          progress bars Wrapped-grammar. Crossfade 360ms entre páginas.
          Long-press para pausar (haptic). Tap left/right para navegar
          manualmente. Adapta páginas según estado (e.g. sin fijos = 1
          sola página).
        </Text>
      </View>

      <StateSelector
        states={HERO_STATES}
        activeId={activeId}
        onSelect={handleSelect}
        onReplay={handleReplay}
      />

      <View style={styles.heroWrapper}>
        <ManifiestoHeroLive key={`${activeId}-${nonce}`} state={active} />
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: theme.colors.textMuted }]}>
          Esperá 5 segundos para ver auto-advance. Probá long-press para
          pausar. Probá tap derecha / izquierda para saltar manualmente.
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
