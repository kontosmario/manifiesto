import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Screen } from '@/components/ui/screen'
import { NeoTabBar, type NeoTabKey } from '@/components/redesign/neo-tab-bar'
import {
  PreviewHomeIndicator,
  PreviewPhoneSection,
  PreviewSectionLabel,
} from '@/screens/dev/redesign/redesign-preview-shared'

/**
 * Preview dev-only de la barra de navegación del rediseño 2026-07,
 * en ambos temas y sobre el fondo del design doc. Los tabs son
 * interactivos (tap mueve la píldora activa) para revisar el estado
 * activo en las 4 posiciones. Gate de aprobación del owner: la barra
 * NO se cablea a la app real hasta aprobar este preview contra
 * screens/1b.html y 1c.html.
 */
export function RedesignNavBarPreviewScreen() {
  const [activeLight, setActiveLight] = useState<NeoTabKey>('inicio')
  const [activeDark, setActiveDark] = useState<NeoTabKey>('inicio')

  return (
    <Screen
      // @i18n-ignore (dev-only: preview gated por __DEV__, copy interno de tooling)
      title="Rediseño · Nav bar"
      // @i18n-ignore (dev-only)
      subtitle="Réplica pixel-perfect de la barra flotante. Compará contra screens/1b.html (claro) y 1c.html (oscuro) a 393px. Tap en los tabs para mover la píldora."
      canGoBack
    >
      <View style={styles.stack}>
        <PreviewSectionLabel title="Tema claro — Salvia" source="screens/1b.html" />
        <PreviewPhoneSection mode="light" minHeight={230}>
          {/* margin del mockup: 26px 18px 22px */}
          <View style={styles.barSlot}>
            <NeoTabBar mode="light" activeTab={activeLight} onTabPress={setActiveLight} />
          </View>
          <PreviewHomeIndicator mode="light" />
        </PreviewPhoneSection>

        <PreviewSectionLabel title="Tema oscuro — Noche de bosque" source="screens/1c.html" />
        <PreviewPhoneSection mode="dark" minHeight={230}>
          <View style={styles.barSlot}>
            <NeoTabBar mode="dark" activeTab={activeDark} onTabPress={setActiveDark} />
          </View>
          <PreviewHomeIndicator mode="dark" />
        </PreviewPhoneSection>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  stack: {
    paddingBottom: 40,
  },
  barSlot: {
    marginTop: 26,
    marginHorizontal: 18,
    marginBottom: 22,
  },
})
