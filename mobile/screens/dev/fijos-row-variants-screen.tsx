import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Screen } from '@/components/ui/screen'
import { HERO_STATES } from '@/components/fijos-hero-preview/hero-states'
import { StateSelector } from '@/components/fijos-hero-preview/state-selector'
import { buildFijoList, type FijoItem } from '@/components/fijos-hero-preview/fijo-list-sample'
import { RowEditorial } from '@/components/fijos-hero-preview/row-a-editorial'
import { RowSparkline } from '@/components/fijos-hero-preview/row-b-sparkline'
import { RowStripe } from '@/components/fijos-hero-preview/row-c-stripe'
import { RowDayMarker } from '@/components/fijos-hero-preview/row-d-day-marker'
import { RowStatusIcon } from '@/components/fijos-hero-preview/row-e-status-icon'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * 5 variantes de FijoRow — Etapa 8b. Reemplaza al FijoRow actual
 * (448 LOC con emoji icon, status chip pastel, expand panel, etc).
 *
 *   A · Editorial row     dot color + name + label tipo + amount
 *   B · Sparkline-hero    mini-curva SVG de tendencia precio
 *   C · Accent stripe     stripe vertical color + two-line typography
 *   D · Calendar marker   día del mes en caja a la izquierda
 *   E · Status icon-led   icon tile bg-tinted (check/clock/warning)
 *
 * Cada variante renderea las 10 filas con la misma data del state
 * activo, dentro de un card para mostrar el rhythm de la lista.
 */
export function FijosRowVariantsScreen() {
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
  const items = buildFijoList(active)
  const key = `${activeId}-${nonce}`

  return (
    <Screen title="FijoRow · 5 variantes" canGoBack scrollable>
      <View style={styles.intro}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          5 variantes de "FijoRow"
        </Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          Reemplaza al FijoRow actual (emoji icon + status chip pastel
          + expand panel denso). Mismas 10 filas, 5 paradigmas visuales
          distintos. Theme-aware vía buildProximosPalette.
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
          name="Editorial row"
          tagline="dot color + name + status label + amount · restraint puro"
        />
        <RowsBlock key={`a-${key}`} items={items}>
          {(item) => <RowEditorial key={item.id} item={item} />}
        </RowsBlock>

        <View style={styles.sep} />
        <VariantLabel
          letter="B"
          name="Sparkline-hero"
          tagline="mini-curva SVG entre name y amount · 'la forma habla'"
        />
        <RowsBlock key={`b-${key}`} items={items}>
          {(item) => <RowSparkline key={item.id} item={item} />}
        </RowsBlock>

        <View style={styles.sep} />
        <VariantLabel
          letter="C"
          name="Accent stripe"
          tagline="stripe vertical del color cat · two-line typography editorial"
        />
        <RowsBlock key={`c-${key}`} items={items}>
          {(item) => <RowStripe key={item.id} item={item} />}
        </RowsBlock>

        <View style={styles.sep} />
        <VariantLabel
          letter="D"
          name="Calendar marker"
          tagline="día del mes en caja · ve cuándo paga sin leer"
        />
        <RowsBlock key={`d-${key}`} items={items}>
          {(item) => <RowDayMarker key={item.id} item={item} />}
        </RowsBlock>

        <View style={styles.sep} />
        <VariantLabel
          letter="E"
          name="Status icon-led"
          tagline="icon tile bg-tinted (check/clock/warning) · pattern tasklist"
        />
        <RowsBlock key={`e-${key}`} items={items}>
          {(item) => <RowStatusIcon key={item.id} item={item} />}
        </RowsBlock>
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: theme.colors.textMuted }]}>
          Probá el estado "con_atraso" para ver vencidos. Y "todo_pagado"
          para ver dimmed treatment. Probá light + dark mode.
        </Text>
      </View>
    </Screen>
  )
}

function RowsBlock({
  items,
  children,
}: {
  items: FijoItem[]
  children: (item: FijoItem) => React.ReactNode
}) {
  const { theme } = useAppTheme()
  if (items.length === 0) {
    return (
      <View
        style={[
          styles.rowsCard,
          {
            backgroundColor: theme.colors.creamCard,
            borderColor: theme.colors.line,
          },
        ]}
      >
        <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
          Sin fijos cargados.
        </Text>
      </View>
    )
  }
  return (
    <View
      style={[
        styles.rowsCard,
        {
          backgroundColor: theme.colors.creamCard,
          borderColor: theme.colors.line,
        },
      ]}
    >
      {items.map((item, idx) => (
        <View key={item.id}>
          {children(item)}
          {idx < items.length - 1 ? (
            <View style={[styles.divider, { backgroundColor: theme.colors.line }]} />
          ) : null}
        </View>
      ))}
    </View>
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
        style={[styles.variantBadge, { borderColor: theme.colors.borderStrong }]}
      >
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
  rowsCard: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderWidth: 1,
  },
  divider: {
    height: 1,
    opacity: 0.35,
  },
  empty: {
    fontSize: 13,
    fontStyle: 'italic',
    fontWeight: '500',
    paddingVertical: 16,
    textAlign: 'center',
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
