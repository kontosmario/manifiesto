import { View, StyleSheet } from 'react-native'
import { SkeletonBox } from './skeleton-box'
import { type SkeletonSkin } from './neo-skeleton'
import { neoRadii } from '@/theme/neo-tokens'
import { radii } from '@/theme/palette'

// Pure layout descriptors — exported for testability.
export const SKELETON_HERO_LAYOUT = {
  eyebrow: { width: '35%' as const, height: 10 },
  value:   { width: '55%' as const, height: 48 },
  context: { width: '70%' as const, height: 14 },
  cta:     { width: 140, height: 34 },
}

export const SKELETON_LIST_ROW_LAYOUT = {
  leading:  { width: 36, height: 36 },
  title:    { width: '50%' as const, height: 14 },
  subtitle: { width: '35%' as const, height: 11 },
  trailing: { width: 64, height: 14 },
}

export const SKELETON_METRIC_LAYOUT = {
  label: { width: '40%' as const, height: 10 },
  value: { width: '60%' as const, height: 20 },
}

// Cada piel resuelve los mismos 5 pasos de radio con su propio
// vocabulario, así la geometría de los layouts no depende de la piel.
const SKELETON_RADII: Record<
  SkeletonSkin,
  { bar: number; value: number; avatar: number; pill: number; card: number }
> = {
  classic: {
    bar:    radii.xs,
    value:  radii.sm,
    avatar: radii.md,
    pill:   radii.lg,
    card:   radii['2xl'],
  },
  neo: {
    bar:    neoRadii.chip,
    value:  neoRadii.chip,
    avatar: neoRadii.tile,
    pill:   neoRadii.input,
    card:   neoRadii.card,
  },
}

export function HeroSkeleton({ skin = 'classic' }: { skin?: SkeletonSkin }) {
  const r = SKELETON_RADII[skin]
  return (
    <View style={styles.heroCard}>
      <SkeletonBox {...SKELETON_HERO_LAYOUT.eyebrow} radius={r.bar} skin={skin} />
      <View style={styles.heroSpacerSm} />
      <SkeletonBox {...SKELETON_HERO_LAYOUT.value} radius={r.value} skin={skin} />
      <View style={styles.heroSpacerMd} />
      <SkeletonBox {...SKELETON_HERO_LAYOUT.context} radius={r.bar} skin={skin} />
      <View style={styles.heroSpacerLg} />
      <SkeletonBox {...SKELETON_HERO_LAYOUT.cta} radius={r.pill} skin={skin} />
    </View>
  )
}

export function MetricStripSkeleton({
  count = 2,
  skin = 'classic',
}: {
  count?: number
  skin?: SkeletonSkin
}) {
  const r = SKELETON_RADII[skin]
  return (
    <View style={styles.metricStrip}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={styles.metricCard}>
          <SkeletonBox {...SKELETON_METRIC_LAYOUT.label} radius={r.bar} skin={skin} />
          <View style={styles.metricSpacer} />
          <SkeletonBox {...SKELETON_METRIC_LAYOUT.value} radius={r.value} skin={skin} />
        </View>
      ))}
    </View>
  )
}

export function ListRowSkeleton({
  rows = 4,
  hasLeading = true,
  hasTrailing = true,
  skin = 'classic',
}: {
  rows?: number
  hasLeading?: boolean
  hasTrailing?: boolean
  skin?: SkeletonSkin
}) {
  const r = SKELETON_RADII[skin]
  return (
    <View>
      {Array.from({ length: rows }).map((_, index) => (
        <View key={index} style={styles.row}>
          {hasLeading && (
            <SkeletonBox {...SKELETON_LIST_ROW_LAYOUT.leading} radius={r.avatar} skin={skin} />
          )}
          <View style={styles.rowLabels}>
            <SkeletonBox {...SKELETON_LIST_ROW_LAYOUT.title} radius={r.bar} skin={skin} />
            <View style={styles.rowSpacer} />
            <SkeletonBox {...SKELETON_LIST_ROW_LAYOUT.subtitle} radius={r.bar} skin={skin} />
          </View>
          {hasTrailing && (
            <SkeletonBox {...SKELETON_LIST_ROW_LAYOUT.trailing} radius={r.bar} skin={skin} />
          )}
        </View>
      ))}
    </View>
  )
}

export function CardSkeleton({
  height = 120,
  skin = 'classic',
}: {
  height?: number
  skin?: SkeletonSkin
}) {
  return <SkeletonBox height={height} radius={SKELETON_RADII[skin].card} skin={skin} />
}

const styles = StyleSheet.create({
  heroCard:       { padding: 20, borderRadius: 28 },
  heroSpacerSm:   { height: 6 },
  heroSpacerMd:   { height: 10 },
  heroSpacerLg:   { height: 18 },
  metricStrip:    { flexDirection: 'row', gap: 10 },
  metricCard:     { flex: 1, padding: 14, borderRadius: 16 },
  metricSpacer:   { height: 6 },
  row:            { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  rowLabels:      { flex: 1 },
  rowSpacer:      { height: 4 },
})
