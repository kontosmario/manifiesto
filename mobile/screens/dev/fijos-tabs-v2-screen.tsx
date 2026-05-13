import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Screen } from '@/components/ui/screen'
import { HERO_STATES } from '@/components/fijos-hero-preview/hero-states'
import { StateSelector } from '@/components/fijos-hero-preview/state-selector'
import { TabsV2BandejaLive } from '@/components/fijos-hero-preview/tabs-v2-bandeja-live'
import { TabsV2ToggleLive } from '@/components/fijos-hero-preview/tabs-v2-toggle-live'
import { TabsV2InboxLive } from '@/components/fijos-hero-preview/tabs-v2-inbox-live'
import { TabsV2TimeGroupedLive } from '@/components/fijos-hero-preview/tabs-v2-time-grouped-live'
import { TabsV2SmartSortLive } from '@/components/fijos-hero-preview/tabs-v2-smart-sort-live'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Tabs v2 — 5 variantes más intuitivas. Owner rechazó la primera tanda
 * por demasiado abstracta (todas eran "filter selectors" con paradigms
 * de tab/bucket). Esta segunda iteración cuestiona el paradigma mismo:
 * varias **no usan tabs**.
 *
 *   A · Bandeja simple    sin tabs · 2 secciones (Por pagar / Pagados)
 *   B · Toggle binario    segmented 2 estados · default smart
 *   C · Inbox progresivo  solo pendientes + "Ver pagados →" expand
 *   D · Time-grouped      sin estados · agrupado por tiempo
 *   E · Smart sort        sin filtros · lista única ordenada por urgencia
 *
 * Cada variante renderea la LISTA real (10 ítems mock) debajo del
 * mecanismo para ver el comportamiento end-to-end.
 */
export function FijosTabsV2Screen() {
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
    <Screen title="Tabs v2 · 5 variantes intuitivas" canGoBack scrollable>
      <View style={styles.intro}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          5 variantes más intuitivas
        </Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          La primera tanda eran todas "filter selectors". Esta iteración
          cuestiona el paradigma: varias no usan tabs explícitos. Cada
          variante renderea la LISTA real debajo del mecanismo para ver
          el flujo end-to-end. Probá distintos estados.
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
          name="Bandeja simple"
          tagline="sin tabs · 2 secciones · pagados collapsable · cero decisión"
        />
        <TabsV2BandejaLive key={`a-${key}`} state={active} />

        <View style={styles.sep} />
        <VariantLabel
          letter="B"
          name="Toggle binario"
          tagline="segmented 2 estados · indicator desliza spring · default smart"
        />
        <TabsV2ToggleLive key={`b-${key}`} state={active} />

        <View style={styles.sep} />
        <VariantLabel
          letter="C"
          name="Inbox progresivo"
          tagline="solo pendientes default · 'Ver X pagados →' expand inline"
        />
        <TabsV2InboxLive key={`c-${key}`} state={active} />

        <View style={styles.sep} />
        <VariantLabel
          letter="D"
          name="Time-grouped"
          tagline="HOY · ESTA SEMANA · DESPUÉS · PAGADOS — sin abstracciones de estado"
        />
        <TabsV2TimeGroupedLive key={`d-${key}`} state={active} />

        <View style={styles.sep} />
        <VariantLabel
          letter="E"
          name="Smart sort"
          tagline="sin tabs · lista única ordenada por urgencia · scroll = filtro mental"
        />
        <TabsV2SmartSortLive key={`e-${key}`} state={active} />
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: theme.colors.textMuted }]}>
          Probá el estado "con_atraso" para ver cómo cada variante
          maneja vencidos. Y "todo_pagado" para ver cómo se ven cuando
          no hay pendientes.
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
