import Constants, { ExecutionEnvironment } from 'expo-constants'
import { useEffect, useState, type ReactNode } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { SceneErrorBoundary } from './login-hero-model-error-boundary'

type FilamentModule = typeof import('react-native-filament')

let filamentModule: FilamentModule | null = null

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  filamentModule = require('react-native-filament') as FilamentModule
} catch {
  filamentModule = null
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const walletModel = require('../../../assets/brand/wallet-cartoon.glb') as number

const MODEL_BASE_PITCH = 0.12
const MODEL_BASE_YAW = -0.44
const MODEL_AUTO_ROTATION_SPEED = 1.36
const MODEL_AUTO_ROTATION_FRAME_MS = 16

type RotationVector = [number, number, number]

export function LoginHeroModel({
  fallback = null,
  objectScale = 0.94,
  reducedMotion = false,
}: {
  fallback?: ReactNode
  objectScale?: number
  reducedMotion?: boolean
}) {
  const [rotation, setRotation] = useState<RotationVector>([MODEL_BASE_PITCH, MODEL_BASE_YAW, 0])
  const [hasSceneError, setHasSceneError] = useState(false)
  const activeFilamentModule = filamentModule
  const isExpoRuntime = Constants.executionEnvironment === ExecutionEnvironment.StoreClient

  const shouldRenderFilament =
    Platform.OS === 'ios' &&
    !isExpoRuntime &&
    activeFilamentModule != null &&
    !hasSceneError

  useEffect(() => {
    if (!shouldRenderFilament || reducedMotion) {
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
  }, [reducedMotion, shouldRenderFilament])

  if (isExpoRuntime) {
    return <>{fallback}</>
  }

  if (!shouldRenderFilament) {
    return null
  }

  if (!activeFilamentModule) {
    return null
  }

  const { Camera, DefaultLight, FilamentScene, FilamentView, Model, ModelInstance } =
    activeFilamentModule

  return (
    <View pointerEvents="none" style={styles.root}>
      <SceneErrorBoundary
        onError={() => {
          setHasSceneError(true)
        }}
      >
        <FilamentScene
          backend="metal"
          config={{
            commandBufferSizeMB: 6,
            minCommandBufferSizeMB: 2,
            perFrameCommandsSizeMB: 2,
            perRenderPassArenaSizeMB: 4,
            resourceAllocatorCacheMaxAge: 1,
          }}
          fallback={undefined}
        >
          <FilamentView enableTransparentRendering style={styles.stage}>
            <DefaultLight />
            <Camera
              cameraPosition={[0, 0.06, 2.9]}
              cameraTarget={[0, -0.05, 0]}
              near={0.05}
              far={14}
            />
            <Model castShadow receiveShadow source={walletModel} transformToUnitCube>
              <ModelInstance
                index={0}
                multiplyWithCurrentTransform={false}
                rotate={rotation}
                scale={[objectScale, objectScale, objectScale]}
                translate={[0, -0.1, 0]}
              />
            </Model>
          </FilamentView>
        </FilamentScene>
      </SceneErrorBoundary>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    height: '100%',
  },
  stage: {
    flex: 1,
    backgroundColor: 'transparent',
  },
})
