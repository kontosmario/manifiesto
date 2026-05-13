import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Screen } from '@/components/ui/screen'
import { HERO_STATES } from '@/components/fijos-hero-preview/hero-states'
import { StateSelector } from '@/components/fijos-hero-preview/state-selector'
import { ProximosLive } from '@/components/fijos-hero-preview/proximos-live'
import { ProximosBarsLive } from '@/components/fijos-hero-preview/proximos-bars-live'
import { ProximosTimelineLive } from '@/components/fijos-hero-preview/proximos-timeline-live'
import { ProximosHierarchyLive } from '@/components/fijos-hero-preview/proximos-hierarchy-live'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * 4 variantes de "Próximos a pagar" — comparativa lado-a-lado.
 *
 *   A · Editorial list   (winner default)        editorial spread con rows
 *   B · Proximity bars                            barra de ancho = urgencia
 *   C · Timeline horizontal                       línea HOY → FIN CICLO con dots
 *   D · Hierarchy asimétrico                      el próximo en grande, el resto compacto
 *
 * Selector de 6 estados al tope, las 4 variantes se renderean stacked
 * para ver cómo cada una resuelve el mismo data. Theme-aware colors
 * en todas (peach urgency / lime success ajustados light vs dark).
 */
export function FijosProximosVariantsScreen() {
  const { theme } = useAppTheme()
  const [activeId, setActiveId] = useState<string>(HERO_STATES[1].id) // default al_dia
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
    <Screen title="Próximos · 4 variantes" canGoBack scrollable>
      <View style={styles.intro}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          4 variantes de "Próximos a pagar"
        </Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          A es la que está hoy en Selección final (editorial list). Las
          otras 3 son alternativas. Mismo estado → mismos datos → 4
          formas de resolverlos. Todas theme-aware: contraste verificado
          AA o mejor en light y dark.
        </Text>
      </View>

      <StateSelector
        states={HERO_STATES}
        activeId={activeId}
        onSelect={handleSelect}
        onReplay={handleReplay}
      />

      <View style={styles.stack}>
        <VariantLabel letter="A" name="Editorial list" tagline="rows tipográficas con dividers thin — la ganadora por defecto" />
        <ProximosLive key={`a-${key}`} state={active} />

        <View style={styles.sep} />
        <VariantLabel letter="B" name="Proximity bars" tagline="ancho de barra = urgencia · animated fill L→R" />
        <ProximosBarsLive key={`b-${key}`} state={active} />

        <View style={styles.sep} />
        <VariantLabel letter="C" name="Timeline horizontal" tagline="línea HOY → FIN CICLO · dots scale-in spring" />
        <ProximosTimelineLive key={`c-${key}`} state={active} />

        <View style={styles.sep} />
        <VariantLabel letter="D" name="Hierarchy asimétrico" tagline="el próximo en grande, los otros 2 referencia compacta" />
        <ProximosHierarchyLive key={`d-${key}`} state={active} />
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: theme.colors.textMuted }]}>
          Probá cada estado en light y dark mode (Settings → Apariencia)
          para confirmar contraste. Cuando elijas, paso a actualizar
          ProximosLive (la canon) si fue B/C/D.
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
  sep: {
    height: 12,
  },
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
  variantBadgeText: {
    fontSize: 16,
    fontWeight: '800',
  },
  variantName: {
    fontSize: 15,
    fontWeight: '700',
  },
  variantTagline: {
    fontSize: 12,
    marginTop: 1,
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
