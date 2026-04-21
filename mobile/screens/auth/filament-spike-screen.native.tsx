import { MaterialIcons } from '@expo/vector-icons'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { FilamentStage } from '@/components/auth/filament-stage'
import {
  FilamentMetric,
  SpikeMessage,
  SpikeStageBackdrop,
} from '@/components/auth/filament-spike-primitives'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import {
  getFilamentRuntime,
  getFilamentUnavailableDetail,
} from '@/features/auth/filament-runtime.native'
import { triggerHaptic } from '@/lib/haptics'
import { withAlpha } from '@/theme/color-utils'
import { DEFAULT_HIT_SLOP, DEFAULT_PRESS_RETENTION_OFFSET } from '@/theme/interaction'
import { useAppTheme } from '@/theme/theme-provider'
import { radii } from '@/theme/palette'

export function FilamentSpikeScreen() {
  const router = useRouter()
  const { width } = useWindowDimensions()
  const { theme } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const { filamentModule, filamentModuleError } = getFilamentRuntime()

  const cardWidth = Math.min(width - 32, 390)
  const stageHeight = Math.min(width * 0.74, 308)
  const runtimeUnsupported = Platform.OS === 'web'
  const expoGoRuntime = Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  const moduleUnavailable = filamentModule == null

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

        <View style={styles.backdrop}>
          <View style={styles.glowLarge} />
          <View style={styles.glowSmall} />
        </View>

        <View style={styles.content}>
          <Pressable
            accessibilityLabel="Volver"
            accessibilityRole="button"
            android_ripple={{
              color: withAlpha(theme.colors.text, 0.12),
              borderless: false,
            }}
            hitSlop={DEFAULT_HIT_SLOP}
            onPress={() => {
              void triggerHaptic('selection')
              router.back()
            }}
            pressRetentionOffset={DEFAULT_PRESS_RETENTION_OFFSET}
            style={({ pressed }) => [
              styles.backButton,
              {
                backgroundColor: withAlpha(theme.colors.surfaceStrong, 0.64),
                borderColor: withAlpha(theme.colors.primaryStrong, 0.18),
              },
              pressed && styles.buttonPressed,
            ]}
          >
            <MaterialIcons color="#E7F6EA" name="arrow-back" size={18} />
            <Text style={styles.backButtonLabel}>Volver</Text>
          </Pressable>

          <View style={styles.header}>
            <Text style={styles.eyebrow}>SPIKE NATIVO 3D</Text>
            <Text style={styles.title}>Filament + wallet GLB</Text>
            <Text style={styles.subtitle}>
              Backend `metal` en iOS, mismo asset `.glb` y fallback PNG por detrás para medir carga real.
            </Text>
          </View>

          <View style={[styles.card, { width: cardWidth }]}>
            <View style={[styles.stageShell, { height: stageHeight }]}>
              <SpikeStageBackdrop />

              {runtimeUnsupported ? (
                <SpikeMessage
                  detail="Esta prueba es sólo para iOS/Android nativo. En web no existe renderer Filament."
                  icon="public-off"
                  title="No disponible en web"
                />
              ) : expoGoRuntime ? (
                <SpikeMessage
                  detail="Expo Go no incluye los módulos nativos de `react-native-filament` ni `react-native-worklets-core`. Esta spike sólo corre en un build nativo instalado localmente."
                  icon="construction"
                  title="No disponible en Expo Go"
                />
              ) : moduleUnavailable ? (
                <SpikeMessage
                  detail={getFilamentUnavailableDetail(filamentModuleError)}
                  icon="warning-amber"
                  title="Filament no disponible"
                />
              ) : (
                <FilamentStage reducedMotion={reducedMotion} />
              )}
            </View>

            <View style={styles.metrics}>
              <FilamentMetric label="Engine" value="react-native-filament" />
              <FilamentMetric label="Backend iOS" value="metal" />
              <FilamentMetric label="Asset" value="wallet-cartoon.glb (512)" />
              <FilamentMetric label="Modo" value={expoGoRuntime ? 'Expo Go' : 'build nativo'} />
            </View>

            <View style={[styles.note, { borderColor: theme.colors.borderStrong }]}>
              <MaterialIcons color="#7AD18F" name="info-outline" size={18} />
              <Text style={styles.noteText}>
                Si esta pantalla renderiza estable al abrir, minimizar y volver, la migración del hero puede pasar de spike a implementación real.
              </Text>
            </View>
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
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  glowLarge: {
    position: 'absolute',
    top: 94,
    alignSelf: 'center',
    width: 320,
    height: 320,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(80, 188, 117, 0.14)',
  },
  glowSmall: {
    position: 'absolute',
    top: 170,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(42, 131, 102, 0.12)',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 18,
    gap: 18,
  },
  backButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radii.pill,
    borderWidth: 1,
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
  header: {
    width: '100%',
    gap: 6,
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
  card: {
    gap: 14,
    padding: 14,
    borderRadius: radii['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(223, 249, 228, 0.08)',
    backgroundColor: 'rgba(19, 30, 24, 0.88)',
  },
  stageShell: {
    overflow: 'hidden',
    borderRadius: radii.xl,
    backgroundColor: '#0D1511',
    borderWidth: 1,
    borderColor: 'rgba(225, 248, 229, 0.06)',
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    backgroundColor: 'rgba(13, 21, 17, 0.74)',
  },
  noteText: {
    flex: 1,
    color: '#C7D7CB',
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '500',
  },
})
