import { MaterialIcons } from '@expo/vector-icons'
import { useEffect, useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { SceneErrorBoundary } from '@/components/auth/login-hero-model-error-boundary'
import { radii } from '@/theme/palette'
import {
  getFilamentRuntime,
  MODEL_AUTO_ROTATION_FRAME_MS,
  MODEL_AUTO_ROTATION_SPEED,
  MODEL_BASE_PITCH,
  MODEL_BASE_YAW,
  type RotationVector,
  walletModel,
} from '@/features/auth/filament-runtime.native'

interface FilamentStageProps {
  reducedMotion: boolean
}

export function FilamentStage({ reducedMotion }: FilamentStageProps) {
  const { filamentModule } = getFilamentRuntime()
  const [rotation, setRotation] = useState<RotationVector>([MODEL_BASE_PITCH, MODEL_BASE_YAW, 0])

  useEffect(() => {
    if (reducedMotion) {
      return
    }

    const interval = setInterval(() => {
      setRotation(([pitch, yaw]) => [
        pitch,
        yaw + MODEL_AUTO_ROTATION_SPEED * (MODEL_AUTO_ROTATION_FRAME_MS / 1000),
        0,
      ])
    }, MODEL_AUTO_ROTATION_FRAME_MS)

    return () => {
      clearInterval(interval)
    }
  }, [reducedMotion])

  if (!filamentModule) {
    return null
  }

  const { Camera, DefaultLight, FilamentScene, FilamentView, Model, ModelInstance } = filamentModule

  return (
    <View style={styles.stageGestureLayer}>
      <SceneErrorBoundary>
        <FilamentScene
          backend={Platform.OS === 'ios' ? 'metal' : 'default'}
          config={{
            commandBufferSizeMB: 6,
            minCommandBufferSizeMB: 2,
            perFrameCommandsSizeMB: 2,
            perRenderPassArenaSizeMB: 4,
            resourceAllocatorCacheMaxAge: 1,
          }}
          fallback={<SpikeInlineFallback />}
        >
          <FilamentView enableTransparentRendering style={styles.stage}>
            <DefaultLight />
            <Camera cameraPosition={[0, 0.03, 5.15]} cameraTarget={[0, -0.01, 0]} far={14} near={0.05} />
            <Model castShadow receiveShadow source={walletModel} transformToUnitCube>
              <ModelInstance
                index={0}
                multiplyWithCurrentTransform={false}
                rotate={rotation}
                scale={[0.94, 0.94, 0.94]}
                translate={[0, -0.02, 0]}
              />
            </Model>
          </FilamentView>
        </FilamentScene>
      </SceneErrorBoundary>

      <View pointerEvents="none" style={styles.stageHintWrap}>
        <MaterialIcons color="#BEE8C8" name="autorenew" size={14} />
        <Text style={styles.stageHintText}>Rotación automática</Text>
      </View>
    </View>
  )
}

function SpikeInlineFallback() {
  return (
    <View style={styles.inlineFallback}>
      <Text style={styles.inlineFallbackText}>Inicializando Filament...</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
  },
  stageGestureLayer: {
    flex: 1,
  },
  stageHintWrap: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(10, 18, 14, 0.58)',
    borderWidth: 1,
    borderColor: 'rgba(206, 243, 214, 0.08)',
  },
  stageHintText: {
    color: '#D8EFE0',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  inlineFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  inlineFallbackText: {
    color: '#D6E7DA',
    fontSize: 13,
    fontWeight: '600',
  },
})
