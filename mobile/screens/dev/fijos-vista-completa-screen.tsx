import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, {
  FadeIn,
  FadeInDown,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { Screen } from '@/components/ui/screen'
import { HERO_STATES } from '@/components/fijos-hero-preview/hero-states'
import { HeaderHealthPulse } from '@/components/fijos-hero-preview/header-d-health-pulse'
import { TitularHeroLive } from '@/components/fijos-hero-preview/titular-hero-live'
import { ProximosFusedLive } from '@/components/fijos-hero-preview/proximos-fused-live'
import { FullListLive } from '@/components/fijos-hero-preview/full-list-live'
import { useAppTheme } from '@/theme/theme-provider'
import { triggerHaptic } from '@/lib/haptics'

/**
 * Vista completa orquestada — la compilación de TODOS los winners
 * integrados en el orden del screen real. Simula el reemplazo del
 * `fijos-v2-screen.tsx` actual con la composición final del refactor.
 *
 * Orden vertical:
 *   1. FijosHeader · D · Health pulse        title + breathe dot + add
 *   2. Hero Titular                          ciclo + headline state-aware
 *   3. SmartAlerts · A · Editorial inline    hikes + signals (incl. "TODO EN ORDEN")
 *   4. Próximos · A · Editorial list         top 3 upcoming con dividers
 *   5. FullList                              Smart sort + Calendar marker rows
 *
 * Cada sección tiene su propia entrance animation interna (cascade
 * row-by-row). El screen orquesta una cascada section-by-section con
 * stagger 120ms entre cards via FadeInDown.
 *
 * State selector arriba (dev-only chrome — la versión real no lo tiene)
 * permite cambiar entre los 6 estados canónicos y ver cómo orquesta
 * cada uno.
 */
export function FijosVistaCompletaScreen() {
  const { theme } = useAppTheme()
  const [activeId, setActiveId] = useState<string>(HERO_STATES[1].id)
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

  const active = HERO_STATES.find((s) => s.id === activeId) ?? HERO_STATES[0]
  const key = `${activeId}-${nonce}`

  return (
    <Screen title="Fijos · Vista completa" canGoBack scrollable={false}>
      {/* Dev-only chrome: state selector. La versión real no tiene esto. */}
      <View
        style={[
          styles.devBar,
          { borderBottomColor: theme.colors.line, backgroundColor: theme.colors.pageBg },
        ]}
      >
        <Text style={[styles.devLabel, { color: theme.colors.textMuted }]}>
          ESTADO
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {HERO_STATES.map((s) => {
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
            style={[
              styles.replayChip,
              { borderColor: theme.colors.line },
            ]}
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
      </View>

      {/* ── La vista real comienza acá. Scroll independiente del state selector. */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Section 1 · Header (no card wrapper, vive en padding del screen) */}
        <Animated.View key={`hdr-${key}`} entering={FadeIn.duration(360)}>
          <HeaderHealthPulse state={active} />
        </Animated.View>

        {/* Section 2 · Hero Titular */}
        <Animated.View
          key={`hero-${key}`}
          entering={FadeInDown.duration(420).delay(120)}
          style={styles.section}
        >
          <TitularHeroLive state={active} />
        </Animated.View>

        {/* Section 3 · Próximos a pagar (fusión SmartAlerts + Próximos) */}
        <Animated.View
          key={`prox-${key}`}
          entering={FadeInDown.duration(420).delay(240)}
          style={styles.section}
        >
          <ProximosFusedLive state={active} />
        </Animated.View>

        {/* Section 4 · FullList (categorías + smart sort + acciones por row) */}
        <Animated.View
          key={`list-${key}`}
          entering={FadeInDown.duration(420).delay(360)}
          style={styles.section}
        >
          <FullListLive state={active} />
        </Animated.View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </Screen>
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
  scroll: { flex: 1 },
  scrollContent: {
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  section: {
    marginTop: 12,
  },
  bottomSpacer: {
    height: 32,
  },
})
