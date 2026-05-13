import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Screen } from '@/components/ui/screen'
import { HERO_STATES } from '@/components/fijos-hero-preview/hero-states'
import { StateSelector } from '@/components/fijos-hero-preview/state-selector'
import { HeaderEditorial } from '@/components/fijos-hero-preview/header-a-editorial'
import { HeaderStatLed } from '@/components/fijos-hero-preview/header-b-stat-led'
import { HeaderSearch } from '@/components/fijos-hero-preview/header-c-search'
import { HeaderHealthPulse } from '@/components/fijos-hero-preview/header-d-health-pulse'
import { HeaderUtilityBar } from '@/components/fijos-hero-preview/header-e-utility-bar'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * 5 variantes de FijosHeader — Etapa 9. Reemplaza al FijosHeader
 * actual (title + subtitle genérico "Todo lo recurrente en un solo
 * lugar" + add button con sonar halo continuous).
 *
 *   A · Editorial título + dato vivo   title big + sub state-aware
 *   B · Stat-led                       eyebrow + monto $ big hero
 *   C · Header + search inline         title compacto + search bar
 *   D · Health pulse                   breathe dot color-coded
 *   E · Compact + utility bar          title chico + 3 utility icons
 */
export function FijosHeaderVariantsScreen() {
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
    <Screen title="Header · 5 variantes" canGoBack scrollable>
      <View style={styles.intro}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          5 variantes de FijosHeader
        </Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          Reemplaza al header actual (title + subtitle "Todo lo
          recurrente en un solo lugar" + add button con sonar halo). El
          subtitle viejo no aporta info — todas las nuevas variantes lo
          reemplazan con dato útil state-aware.
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
          name="Editorial título + dato vivo"
          tagline="title big 34pt + sub state-aware · add minimal · restraint"
        />
        <HeaderWrap>
          <HeaderEditorial key={`a-${key}`} state={active} />
        </HeaderWrap>

        <View style={styles.sep} />
        <VariantLabel
          letter="B"
          name="Stat-led"
          tagline="eyebrow + monto $ big como hero · jerarquía invertida"
        />
        <HeaderWrap>
          <HeaderStatLed key={`b-${key}`} state={active} />
        </HeaderWrap>

        <View style={styles.sep} />
        <VariantLabel
          letter="C"
          name="Header + search inline"
          tagline="title compacto + count · search bar always-on · add integrado"
        />
        <HeaderWrap>
          <HeaderSearch key={`c-${key}`} state={active} />
        </HeaderWrap>

        <View style={styles.sep} />
        <VariantLabel
          letter="D"
          name="Health pulse"
          tagline="breathe dot color-coded · semáforo de salud del ciclo"
        />
        <HeaderWrap>
          <HeaderHealthPulse key={`d-${key}`} state={active} />
        </HeaderWrap>

        <View style={styles.sep} />
        <VariantLabel
          letter="E"
          name="Compact + utility bar"
          tagline="title chico + 3 utility icons (search · filter · add)"
        />
        <HeaderWrap>
          <HeaderUtilityBar key={`e-${key}`} state={active} />
        </HeaderWrap>
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: theme.colors.textMuted }]}>
          Probá cómo cada variante adapta el copy según estado
          (inicio / al_dia / con_atraso / todo_pagado / sin_fijos /
          fin_ciclo). Probá light + dark mode.
        </Text>
      </View>
    </Screen>
  )
}

function HeaderWrap({ children }: { children: React.ReactNode }) {
  const { theme } = useAppTheme()
  return (
    <View
      style={[
        styles.headerWrap,
        {
          backgroundColor: theme.colors.pageBg,
          borderColor: theme.colors.line,
        },
      ]}
    >
      {children}
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
  headerWrap: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1,
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
