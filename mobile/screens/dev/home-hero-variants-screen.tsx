import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { Screen } from '@/components/ui/screen'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { HOME_HERO_STATES } from '@/components/home-hero-preview/home-hero-states'
import { HomeHeroTermometro } from '@/components/home-hero-preview/home-hero-a-termometro'
import { HomeHeroReloj } from '@/components/home-hero-preview/home-hero-b-reloj'
import { HomeHeroDiario } from '@/components/home-hero-preview/home-hero-c-diario'
import { HomeHeroCofre } from '@/components/home-hero-preview/home-hero-d-cofre'
import { HomeHeroPulso } from '@/components/home-hero-preview/home-hero-e-pulso'
import { HomeHeroManifiesto } from '@/components/home-hero-preview/home-hero-f-manifiesto'

/**
 * 6 variantes radicalmente distintas del nuevo Home hero card. Selector
 * horizontal de 8 estados representativos (al_dia · inicio_ciclo ·
 * adelantado_ahorro · cerrando_apenas · en_apuros · payday_overdue ·
 * cycle_adjusted · setup) — cambio de estado = remount = replay
 * animaciones.
 *
 * Cada variante explora una dirección estética distinta · A Termómetro
 * (monospace · spatial-temporal) · B Reloj (luxury · daypart-aware) ·
 * C Diario (editorial · prose) · D Cofre (skeumorphic · flip) ·
 * E Pulso (waveform · projection-as-hero) · F Manifiesto (typographic-
 * only · saldo en palabras).
 */
export function HomeHeroVariantsScreen() {
  const { theme } = useAppTheme()
  const [activeId, setActiveId] = useState<string>(HOME_HERO_STATES[0].id)
  const [nonce, setNonce] = useState(0)

  const handleSelect = useCallback((id: string) => {
    void triggerHaptic('selection')
    setActiveId(id)
    setNonce((n) => n + 1)
  }, [])

  const handleReplay = useCallback(() => {
    void triggerHaptic('selection')
    setNonce((n) => n + 1)
  }, [])

  const active =
    HOME_HERO_STATES.find((s) => s.id === activeId) ?? HOME_HERO_STATES[0]
  const key = `${activeId}-${nonce}`

  return (
    <Screen title="Home · Hero · 6 variantes" canGoBack scrollable={false}>
      {/* State selector chrome (dev-only) */}
      <View
        style={[
          styles.devBar,
          { borderBottomColor: theme.colors.line, backgroundColor: theme.colors.pageBg },
        ]}
      >
        <Text style={[styles.devLabel, { color: theme.colors.textMuted }]}>ESTADO</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {HOME_HERO_STATES.map((s) => {
            const isActive = s.id === activeId
            return (
              <Pressable
                key={s.id}
                onPress={() => handleSelect(s.id)}
                style={[
                  styles.chip,
                  {
                    borderColor: isActive
                      ? theme.isDark
                        ? '#A6EF8F'
                        : '#1F590D'
                      : theme.colors.line,
                    backgroundColor: isActive
                      ? theme.isDark
                        ? 'rgba(166,239,143,0.15)'
                        : 'rgba(31,89,13,0.08)'
                      : 'transparent',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    {
                      color: isActive
                        ? theme.isDark
                          ? '#A6EF8F'
                          : '#1F590D'
                        : theme.colors.textMuted,
                      fontWeight: isActive ? '800' : '600',
                    },
                  ]}
                >
                  {s.label}
                </Text>
              </Pressable>
            )
          })}
          <Pressable
            onPress={handleReplay}
            style={[styles.replayChip, { borderColor: theme.colors.line }]}
            accessibilityRole="button"
            accessibilityLabel="Reproducir animación"
          >
            <MaterialIcons
              name="replay"
              size={13}
              color={theme.colors.textMuted}
            />
          </Pressable>
        </ScrollView>
        <Text style={[styles.activeDescription, { color: theme.colors.textMuted }]}>
          {active.description}
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <VariantLabel
          letter="A"
          name="El Termómetro"
          tagline="spatial-temporal · barra vertical = ciclo · marker HOY desliza · monospace dark · ticks por día"
        />
        <HomeHeroTermometro key={`a-${key}`} state={active} />

        <View style={styles.sep} />
        <VariantLabel
          letter="B"
          name="El Reloj de Sol"
          tagline="luxury · daypart-aware · sol del ciclo · cielo cambia con la hora · cream/forest"
        />
        <HomeHeroReloj key={`b-${key}`} state={active} />

        <View style={styles.sep} />
        <VariantLabel
          letter="C"
          name="El Diario"
          tagline="editorial · masthead + headline state-aware + stand-first prose + stock ticker animado"
        />
        <HomeHeroDiario key={`c-${key}`} state={active} />

        <View style={styles.sep} />
        <VariantLabel
          letter="D"
          name="El Cofre"
          tagline="skeumórfico · stack de monedas físicas · tap-to-flip revela proyección · spring entrance"
        />
        <HomeHeroCofre key={`d-${key}`} state={active} />

        <View style={styles.sep} />
        <VariantLabel
          letter="E"
          name="El Pulso"
          tagline="waveform · balance del ciclo entero · pasado sólido + futuro dashed · HOY con halo pulsante"
        />
        <HomeHeroPulso key={`e-${key}`} state={active} />

        <View style={styles.sep} />
        <VariantLabel
          letter="F"
          name="El Manifiesto"
          tagline="0 chrome · saldo escrito en palabras · cascade word-by-word · 1 línea fina de progreso al pie"
        />
        <HomeHeroManifiesto key={`f-${key}`} state={active} />

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.colors.textMuted }]}>
            Cada variante explora una dirección estética RADICALMENTE
            distinta a las de Fijos/Control. Probá los 8 estados (al día
            · inicio · adelantado · cerrando · apuros · overdue ·
            adjusted · setup) en light y dark mode. Particles · gradient
            forest · BreatheDot · 2-tile split son patterns BANEADOS aquí.
          </Text>
        </View>
      </ScrollView>
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
  devBar: {
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    gap: 6,
  },
  devLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 11,
    letterSpacing: 0.1,
  },
  replayChip: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeDescription: {
    fontSize: 11,
    fontStyle: 'italic',
    lineHeight: 15,
    marginTop: 4,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 32,
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
  variantBadgeText: { fontSize: 16, fontWeight: '800' },
  variantName: { fontSize: 15, fontWeight: '700' },
  variantTagline: { fontSize: 12, marginTop: 1 },
  sep: { height: 20 },
  footer: {
    paddingTop: 24,
    paddingBottom: 32,
  },
  footerText: {
    fontSize: 11,
    fontStyle: 'italic',
    lineHeight: 15,
  },
})
