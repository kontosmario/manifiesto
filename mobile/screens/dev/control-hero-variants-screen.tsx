import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { Screen } from '@/components/ui/screen'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { CONTROL_HERO_STATES } from '@/components/control-hero-preview/control-hero-states'
import { ControlHeroTitular } from '@/components/control-hero-preview/control-hero-a-titular'
import { ControlHeroVelocimetro } from '@/components/control-hero-preview/control-hero-b-velocimetro'
import { ControlHeroTermometro } from '@/components/control-hero-preview/control-hero-c-termometro'
import { ControlHeroCoach } from '@/components/control-hero-preview/control-hero-d-coach'
import { ControlHeroPeriodico } from '@/components/control-hero-preview/control-hero-e-periodico'
import { ControlHeroReloj } from '@/components/control-hero-preview/control-hero-f-reloj'

/**
 * 6 variantes del nuevo hero card de Control. Selector horizontal de
 * 8 estados representativos (al_dia_temprano / al_dia_tarde /
 * adelantado / atrasado_leve / atrasado_critico / no_alcanza /
 * exhausto / inicio_ciclo) — cambio de estado = remount = replay
 * animaciones.
 *
 * Cada variante tiene · gradient forest · ShineOverlay · CardParticles
 * (12 luciérnagas) · BreatheDot color-coded · CountUpText en montos ·
 * cascade entrance · resolveControlMessage state-aware copy.
 */
export function ControlHeroVariantsScreen() {
  const { theme } = useAppTheme()
  const [activeId, setActiveId] = useState<string>(CONTROL_HERO_STATES[1].id)
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
    CONTROL_HERO_STATES.find((s) => s.id === activeId) ?? CONTROL_HERO_STATES[0]
  const key = `${activeId}-${nonce}`

  return (
    <Screen title="Control · Hero · 6 variantes" canGoBack scrollable={false}>
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
          {CONTROL_HERO_STATES.map((s) => {
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
        <VariantLabel letter="A" name="El Titular" tagline="magazine cover · state-aware headline + primary number + footer stats" />
        <ControlHeroTitular key={`a-${key}`} state={active} />

        <View style={styles.sep} />
        <VariantLabel letter="B" name="El Velocímetro" tagline="radial gauge · % consumido cupo + AHORA tick · libreHoy center" />
        <ControlHeroVelocimetro key={`b-${key}`} state={active} />

        <View style={styles.sep} />
        <VariantLabel letter="C" name="El Termómetro" tagline="vertical bar · fill gastoHoy/cupo + marker prorrateo hora · gap = delta visual" />
        <ControlHeroTermometro key={`c-${key}`} state={active} />

        <View style={styles.sep} />
        <VariantLabel letter="D" name="El Coach" tagline="speech bubble · coach avatar + 'Hoy te digo:' + dato clave + sugerencia" />
        <ControlHeroCoach key={`d-${key}`} state={active} />

        <View style={styles.sep} />
        <VariantLabel letter="E" name="El Periódico" tagline="newspaper front-page · masthead + EDICIÓN + headline + lead + stock ticker" />
        <ControlHeroPeriodico key={`e-${key}`} state={active} />

        <View style={styles.sep} />
        <VariantLabel letter="F" name="El Reloj del día" tagline="analog clock + arc del cupo consumido · time+money en un visual" />
        <ControlHeroReloj key={`f-${key}`} state={active} />

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.colors.textMuted }]}>
            Particles · ShineOverlay · BreatheDot · CountUpText en todas.
            Probá los 8 estados (inicio · al día · adelantado · atrasado
            leve · atrasado crítico · no alcanza · exhausto) en light y
            dark mode.
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
  sep: { height: 14 },
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
