import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Screen } from '@/components/ui/screen'
import { HERO_STATES } from '@/components/fijos-hero-preview/hero-states'
import { StateSelector } from '@/components/fijos-hero-preview/state-selector'
import { TabsUnderlineLive } from '@/components/fijos-hero-preview/tabs-underline-live'
import { TabsStackedBarLive } from '@/components/fijos-hero-preview/tabs-stacked-bar-live'
import { TabsBigCountsLive } from '@/components/fijos-hero-preview/tabs-big-counts-live'
import { TabsChipDropdownLive } from '@/components/fijos-hero-preview/tabs-chip-dropdown-live'
import { TabsLedgerLive } from '@/components/fijos-hero-preview/tabs-ledger-live'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * 5 variantes de FijosTabs — Etapa 8a del refactor. Reemplaza al
 * `FijosTabs` viejo (4 pills horizontales con count chip dentro y
 * solid-ink active).
 *
 *   A · Underline switch       labels + underline animado · editorial puro
 *   B · Stacked composition    barra proporcional · tap segmentos
 *   C · Big counts             count grande · label eyebrow tiny
 *   D · Single chip dropdown   chip + expand inline · footprint min
 *   E · Numeric ledger         4 columnas con count + label + monto
 *
 * Default state al_dia (mix de pendientes + pagados + sin overdue).
 * Cambiar de estado replay entrance + adapta counts.
 */
export function FijosTabsVariantsScreen() {
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
    <Screen title="Tabs · 5 variantes" canGoBack scrollable>
      <View style={styles.intro}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          5 variantes de "FijosTabs"
        </Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          Reemplaza los pills horizontales con count chip + solid-ink
          active. Mismo state = mismos counts = 5 formas de filtrar.
          Cada variante mantiene la lógica todos/pendientes/pagados +
          surface vencidos como bucket propio (el "zombi" legacy queda
          fuera). Theme-aware AA/AAA en light + dark.
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
          name="Underline switch"
          tagline="labels + underline animado · editorial NY Times · restraint puro"
        />
        <TabsUnderlineLive key={`a-${key}`} state={active} />

        <View style={styles.sep} />
        <VariantLabel
          letter="B"
          name="Stacked composition"
          tagline="barra proporcional pagado/pendiente/vencido · tap segmento filtra"
        />
        <TabsStackedBarLive key={`b-${key}`} state={active} />

        <View style={styles.sep} />
        <VariantLabel
          letter="C"
          name="Big counts"
          tagline="count grande (28pt) es el héroe · label eyebrow tiny abajo"
        />
        <TabsBigCountsLive key={`c-${key}`} state={active} />

        <View style={styles.sep} />
        <VariantLabel
          letter="D"
          name="Chip dropdown"
          tagline="un solo chip · expande inline · footprint mínimo"
        />
        <TabsChipDropdownLive key={`d-${key}`} state={active} />

        <View style={styles.sep} />
        <VariantLabel
          letter="E"
          name="Numeric ledger"
          tagline="4 cols con count + label + monto · top-indicator estilo lápiz"
        />
        <TabsLedgerLive key={`e-${key}`} state={active} />
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: theme.colors.textMuted }]}>
          Probá tappear los buckets en cada variante para ver la
          interaction. B/D requieren múltiples taps por su naturaleza
          (B tap segmento, D tap expand). Probá en light y dark mode.
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
      <View style={[styles.variantBadge, { borderColor: theme.colors.borderStrong }]}>
        <Text style={[styles.variantBadgeText, { color: theme.colors.text }]}>
          {letter}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.variantName, { color: theme.colors.text }]}>{name}</Text>
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
  stack: { paddingHorizontal: 16, gap: 12 },
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
