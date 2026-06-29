import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { IntroScreen } from '@/screens/auth/intro/intro-screen'

/**
 * DEV-only: previsualiza el intro pre-auth (5 slides) estando LOGUEADO, sin
 * pasar por `RequireGuest` ni tocar el flag `pre-auth-intro-seen`. Los CTA
 * ("Crear mi hogar" / "Ya tengo cuenta") y el botón Cerrar simplemente vuelven
 * a Settings — es una vitrina para iterar la UI sin cerrar sesión.
 */
export function IntroPreviewScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const close = () => router.back()

  return (
    <View style={styles.root}>
      <IntroScreen onCreate={close} onLogin={close} />
      {/* Pill oscuro (legible sobre slides claros y oscuros) arriba-izquierda,
          sin chocar con "Saltar" (arriba-derecha). */}
      <Pressable
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel="Cerrar preview del onboarding"
        hitSlop={12}
        style={[styles.close, { top: insets.top + 8 }]}
      >
        <Text style={styles.closeText}>✕ Cerrar</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  close: {
    position: 'absolute',
    left: 16,
    zIndex: 50,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  closeText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13.5 },
})
