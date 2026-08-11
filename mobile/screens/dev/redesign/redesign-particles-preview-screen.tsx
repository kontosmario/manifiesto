import { StyleSheet, Text, View } from 'react-native'
import { Screen } from '@/components/ui/screen'
import { BrotParticles } from '@/components/brot'
import { cssGradient, neoParticlePresets } from '@/theme/neo-tokens'
import {
  PreviewPhoneSection,
  PreviewSectionLabel,
} from '@/screens/dev/redesign/redesign-preview-shared'
import { nunitoFamily } from '@/theme/typography'

/**
 * Preview dev-only de las partículas (port Skia de particles.js) en
 * los 4 contextos del handoff: auth claro/oscuro, hero verde
 * (clipeadas al radius 32) y cierre de semana. Gate de aprobación del
 * owner contra el <brot-particles> original y handoff-README
 * §Partículas.
 */
export function RedesignParticlesPreviewScreen() {
  return (
    <Screen
      // @i18n-ignore (dev-only: preview gated por __DEV__, copy interno de tooling)
      title="Rediseño · Partículas"
      // @i18n-ignore (dev-only)
      subtitle="Los 4 presets del handoff. Deriva ascendente + sway + titileo con halo, física idéntica al particles.js original."
      canGoBack
    >
      <View style={styles.stack}>
        <PreviewSectionLabel
          title="Login/bienvenida · claro (×18)"
          source="handoff-README.md §Partículas"
        />
        <PreviewPhoneSection mode="light" minHeight={170}>
          <BrotParticles {...neoParticlePresets.authLight} />
        </PreviewPhoneSection>

        <PreviewSectionLabel
          title="Login/bienvenida · oscuro (×18) — fondo #0F1E14"
          source="handoff-README.md §Partículas"
        />
        <View style={[styles.welcomeDark]}>
          <BrotParticles {...neoParticlePresets.authDark} />
        </View>

        <PreviewSectionLabel
          title="Hero verde (×10, clip radius 32)"
          source="screens/1b.html — hero de Inicio"
        />
        <View
          style={[
            styles.hero,
            cssGradient(
              'linear-gradient(155deg, #337B39 0%, #4C9A52 55%, #5FAC64 100%)',
              '#4C9A52',
            ),
            {
              boxShadow:
                '12px 12px 26px rgba(124,138,110,0.55), -8px -8px 20px rgba(255,255,255,0.85), inset 0 1px 0 rgba(255,255,255,0.25)',
            },
          ]}
        >
          <BrotParticles {...neoParticlePresets.hero} borderRadius={32} />
          <Text style={styles.heroLabel}>SALDO DEL MES</Text>
        </View>

        <PreviewSectionLabel
          title="Cierre de semana · claro (×22)"
          source="handoff-README.md §Partículas"
        />
        <PreviewPhoneSection mode="light" minHeight={170}>
          <BrotParticles {...neoParticlePresets.weekCloseLight} />
        </PreviewPhoneSection>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  stack: {
    paddingBottom: 40,
  },
  welcomeDark: {
    borderRadius: 28,
    overflow: 'hidden',
    minHeight: 170,
    backgroundColor: '#0F1E14',
  },
  hero: {
    borderRadius: 32,
    minHeight: 170,
    padding: 20,
    justifyContent: 'flex-start',
  },
  heroLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.6,
    color: 'rgba(240,248,230,0.85)',
  },
})
