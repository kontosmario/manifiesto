import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Screen } from '@/components/ui/screen'
import { HERO_STATES } from '@/components/fijos-hero-preview/hero-states'
import { StateSelector } from '@/components/fijos-hero-preview/state-selector'
import { SmartAlertsEditorialLive } from '@/components/fijos-hero-preview/smart-alerts-editorial-live'
import { SmartAlertsStackLive } from '@/components/fijos-hero-preview/smart-alerts-stack-live'
import { SmartAlertsMarqueeLive } from '@/components/fijos-hero-preview/smart-alerts-marquee-live'
import { SmartAlertsPillsLive } from '@/components/fijos-hero-preview/smart-alerts-pills-live'
import { SmartAlertsBannerLive } from '@/components/fijos-hero-preview/smart-alerts-banner-live'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * 5 variantes de "SmartAlerts" — comparativa lado-a-lado para Etapa 7
 * del refactor. Reemplazaría al `FijosSmartAlerts` viejo (horizontal
 * rail con cards anidadas + emoji icons 📅📈⚖️).
 *
 *   A · Editorial inline   rows tipográficas (sigue lenguaje Próximos)
 *   B · Stack of notes     papers stacked tactile
 *   C · Marquee headline   1 a la vez, rota 6s con crossfade
 *   D · Compact pills      pills horizontales + tap expand
 *   E · Editorial banner   summary headline + bullets
 *
 * Default state al_dia (1 hike Spotify + 1 hike Prepaga + 1 signal
 * stress-week) para mostrar densidad mixta. Probá todos los estados
 * para ver cómo cada variante resuelve empty / urgent / positive.
 */
export function FijosSmartAlertsVariantsScreen() {
  const { theme } = useAppTheme()
  const [activeId, setActiveId] = useState<string>(HERO_STATES[1].id)
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
    <Screen title="SmartAlerts · 5 variantes" canGoBack scrollable>
      <View style={styles.intro}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          5 variantes de "SmartAlerts"
        </Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          Reemplaza la card actual con emojis 📅📈⚖️ + horizontal rail.
          Mismo estado = mismos datos = 5 lenguajes editoriales distintos.
          Theme-aware: contraste AA/AAA verificado en light y dark.
        </Text>
      </View>

      <StateSelector
        states={HERO_STATES}
        activeId={activeId}
        onSelect={handleSelect}
        onReplay={handleReplay}
      />

      <View style={styles.stack}>
        <VariantLabel
          letter="A"
          name="Editorial inline"
          tagline="rows tipográficas · sigue gramática Próximos · default seguro"
        />
        <SmartAlertsEditorialLive key={`a-${key}`} state={active} />

        <View style={styles.sep} />
        <VariantLabel
          letter="B"
          name="Stack of notes"
          tagline="papers apilados con tilt · spring entrance · tactil"
        />
        <SmartAlertsStackLive key={`b-${key}`} state={active} />

        <View style={styles.sep} />
        <VariantLabel
          letter="C"
          name="Marquee headline"
          tagline="1 noticia a la vez · auto-rota 6s · tap navega · DNA Wrapped"
        />
        <SmartAlertsMarqueeLive key={`c-${key}`} state={active} />

        <View style={styles.sep} />
        <VariantLabel
          letter="D"
          name="Compact pills"
          tagline="pills horizontales minimalistas · tap expande detalle inline"
        />
        <SmartAlertsPillsLive key={`d-${key}`} state={active} />

        <View style={styles.sep} />
        <VariantLabel
          letter="E"
          name="Editorial banner"
          tagline="summary headline + bullets · 'esta semana: X y Y'"
        />
        <SmartAlertsBannerLive key={`e-${key}`} state={active} />
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: theme.colors.textMuted }]}>
          Cambia el estado para ver cómo cada variante resuelve empty,
          urgent, positivo, mixto. Probá en light y dark mode.
        </Text>
      </View>
    </Screen>
  )
}

function VariantLabel({
  letter,
  name,
  tagline,
}: {
  letter: string
  name: string
  tagline: string
}) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.variantLabel}>
      <View
        style={[
          styles.variantBadge,
          { borderColor: theme.colors.borderStrong },
        ]}
      >
        <Text style={[styles.variantBadgeText, { color: theme.colors.text }]}>
          {letter}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.variantName, { color: theme.colors.text }]}>
          {name}
        </Text>
        <Text style={[styles.variantTagline, { color: theme.colors.textMuted }]}>
          {tagline}
        </Text>
      </View>
    </View>
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
  stack: {
    paddingHorizontal: 16,
    gap: 12,
  },
  sep: { height: 12 },
  variantLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  variantBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  variantBadgeText: { fontSize: 16, fontWeight: '800' },
  variantName: { fontSize: 15, fontWeight: '700' },
  variantTagline: { fontSize: 12, marginTop: 1 },
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
