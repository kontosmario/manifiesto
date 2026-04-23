import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { walletFallback } from '@/features/auth/filament-runtime.native'
import { radii } from '@/theme/palette'

export function SpikeStageBackdrop() {
  return (
    <View style={styles.stageBackdrop}>
      <View style={styles.stageGlow} />
      <Image
        defaultSource={walletFallback}
        source={walletFallback}
        resizeMode="contain"
        style={styles.stageImage}
      />
    </View>
  )
}

export function SpikeInlineFallback() {
  return (
    <View style={styles.inlineFallback}>
      <ActivityIndicator color="#7AD18F" size="small" />
      <Text style={styles.inlineFallbackText}>Inicializando Filament...</Text>
    </View>
  )
}

export function SpikeMessage({
  detail,
  icon,
  title,
}: {
  detail: string
  icon: keyof typeof MaterialIcons.glyphMap
  title: string
}) {
  return (
    <View style={styles.messageWrap}>
      <MaterialIcons color="#DDF5E2" name={icon} size={24} />
      <Text style={styles.messageTitle}>{title}</Text>
      <Text style={styles.messageDetail}>{detail}</Text>
    </View>
  )
}

export function FilamentMetric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  stageBackdrop: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageGlow: {
    position: 'absolute',
    width: '76%',
    height: '76%',
    borderRadius: radii.pill,
    backgroundColor: 'rgba(94, 204, 131, 0.11)',
  },
  stageImage: {
    width: '86%',
    height: '68%',
    opacity: 0.82,
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
  messageWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
  },
  messageTitle: {
    color: '#F4FAF5',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  messageDetail: {
    color: '#B5C4B9',
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: '500',
    textAlign: 'center',
  },
  metric: {
    minWidth: '47%',
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: 'rgba(104, 143, 114, 0.12)',
  },
  metricLabel: {
    color: '#90A798',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  metricValue: {
    color: '#F0F7F1',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
  },
})
