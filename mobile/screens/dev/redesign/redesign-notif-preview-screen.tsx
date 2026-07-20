// @i18n-ignore-file — tooling dev-only gated por __DEV__.
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { NotifScreen } from '@/components/redesign/notifications/notif-screen'
import { NOTIF_SPEC, type NotifMode } from '@/components/redesign/notifications/notif-spec'
import { nunitoFamily } from '@/theme/typography'

/**
 * Preview dev-only de Notificaciones (Turno 6): réplica pixel-perfect de
 * 7a/7ao (lista) y 7b/7bo (empty state). Chrome flotante = toggle de
 * tema claro/oscuro + toggle lista/vacío + salir (NO es parte del
 * mockup). Bajo gate de aprobación (redesign-approval-status: 'notif').
 */

type NotifVariant = 'list' | 'empty'

export function RedesignNotifPreviewScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [mode, setMode] = useState<NotifMode>('light')
  const [variant, setVariant] = useState<NotifVariant>('list')
  const s = NOTIF_SPEC[mode]

  return (
    <View style={[styles.root, { backgroundColor: s.bg }]}>
      <NotifScreen mode={mode} variant={variant} />

      <View pointerEvents="box-none" style={[styles.devChrome, { top: insets.top + 6 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Alternar tema del preview"
          onPress={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))}
          style={[styles.devToggle, { borderColor: s.cardBody }]}
        >
          <Text style={styles.devToggleIcon}>{mode === 'light' ? '🌙' : '☀️'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Alternar lista / vacío"
          onPress={() => setVariant((v) => (v === 'list' ? 'empty' : 'list'))}
          style={[styles.devToggle, { borderColor: s.cardBody }]}
        >
          <Text style={styles.devToggleIcon}>{variant === 'list' ? '∅' : '☰'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Salir del preview"
          onPress={() => router.back()}
          style={[styles.devToggle, { borderColor: s.cardBody }]}
        >
          <Text style={styles.devToggleIcon}>✕</Text>
        </Pressable>
        <Text style={[styles.devStep, { color: s.cardBody }]}>{variant}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  devChrome: {
    position: 'absolute',
    right: 10,
    alignItems: 'center',
    gap: 3,
  },
  devToggle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  devToggleIcon: { fontSize: 14 },
  devStep: { fontSize: 9, fontWeight: '800', fontFamily: nunitoFamily('800') },
})
