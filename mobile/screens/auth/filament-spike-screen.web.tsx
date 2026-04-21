import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { triggerHaptic } from '@/lib/haptics'
import { withAlpha } from '@/theme/color-utils'
import { DEFAULT_HIT_SLOP, DEFAULT_PRESS_RETENTION_OFFSET } from '@/theme/interaction'
import { radii } from '@/theme/palette'

export function FilamentSpikeScreen() {
  const router = useRouter()

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <StatusBar style="light" />

      <View style={styles.root}>
        <LinearGradient
          colors={['#07100C', '#0B1510', '#101B15']}
          end={{ x: 0.92, y: 1 }}
          start={{ x: 0.08, y: 0.04 }}
          style={StyleSheet.absoluteFillObject}
        />

        <View style={styles.content}>
          <Pressable
            accessibilityLabel="Volver"
            accessibilityRole="button"
            android_ripple={{
              color: withAlpha('#E7F6EA', 0.12),
              borderless: false,
            }}
            hitSlop={DEFAULT_HIT_SLOP}
            onPress={() => {
              void triggerHaptic('selection')
              router.back()
            }}
            pressRetentionOffset={DEFAULT_PRESS_RETENTION_OFFSET}
            style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.backButtonLabel}>Volver</Text>
          </Pressable>

          <View style={styles.card}>
            <Text style={styles.eyebrow}>SPIKE NATIVO 3D</Text>
            <Text style={styles.title}>Filament no corre en web</Text>
            <Text style={styles.subtitle}>
              Esta ruta quedó pensada para iOS/Android con development build. En web se muestra
              este stub para no romper el bundle del router.
            </Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#07100C',
  },
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    gap: 18,
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(17, 29, 22, 0.64)',
    borderWidth: 1,
    borderColor: 'rgba(163, 231, 184, 0.08)',
    overflow: 'hidden',
  },
  backButtonLabel: {
    color: '#E7F6EA',
    fontSize: 13,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.88,
  },
  card: {
    gap: 8,
    marginTop: 24,
    padding: 18,
    borderRadius: radii['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(223, 249, 228, 0.08)',
    backgroundColor: 'rgba(19, 30, 24, 0.88)',
  },
  eyebrow: {
    color: '#7AD18F',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  title: {
    color: '#F5FBF6',
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  subtitle: {
    color: '#AEBBB1',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
})
