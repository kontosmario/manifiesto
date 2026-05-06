import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated'
import {
  AVATAR_LABELS,
  AVATAR_SLUGS,
  type AvatarSlug,
} from '@/assets/avatars'
import { AvatarAnimal } from '@/components/ui/avatar-animal'
import { RiseView } from '@/components/home/animated/rise-view'
import { useAppTheme } from '@/theme/theme-provider'

interface StepAvatarProps {
  selected: AvatarSlug
  onSelect: (slug: AvatarSlug) => void
}

const GRID_SIZE = 8

function pickGrid(selected: AvatarSlug, seed: number): AvatarSlug[] {
  // Deterministic shuffle seeded on `seed` so tapping "Ver más" cycles.
  const pool = AVATAR_SLUGS.filter((s) => s !== selected)
  const result: AvatarSlug[] = []
  let cursor = seed
  for (let i = 0; i < Math.min(GRID_SIZE - 1, pool.length); i += 1) {
    cursor = (cursor * 1103515245 + 12345) & 0x7fffffff
    const idx = cursor % pool.length
    result.push(pool[idx]!)
    pool.splice(idx, 1)
  }
  return [selected, ...result]
}

export function StepAvatar({ selected, onSelect }: StepAvatarProps) {
  const { theme } = useAppTheme()
  const [seed, setSeed] = useState<number>(() => Math.floor(Math.random() * 1_000_000))
  const grid = useMemo(() => pickGrid(selected, seed), [selected, seed])

  return (
    <View style={styles.stack}>
      <RiseView>
        <Text style={[styles.title, { color: theme.colors.text }]}>Elige tu avatar</Text>
        <Text style={[styles.subcopy, { color: theme.colors.textMuted }]}>
          Lo vas a ver en tu perfil y en la actividad de la familia.
        </Text>
      </RiseView>

      <RiseView delay={80}>
        <Animated.View
          key={`preview-${selected}`}
          entering={FadeIn.duration(220)}
          layout={LinearTransition.duration(220)}
          style={[
            styles.heroCard,
            { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
          ]}
        >
          <AvatarAnimal
            slug={selected}
            size={120}
            tint={theme.colors.text}
            backgroundTint={theme.colors.creamSoft}
          />
          <Text style={[styles.heroLabel, { color: theme.colors.text }]}>
            {AVATAR_LABELS[selected]}
          </Text>
        </Animated.View>
      </RiseView>

      <RiseView delay={140}>
        <View style={styles.gridHeader}>
          <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>OTRAS OPCIONES</Text>
          <Pressable
            onPress={() => setSeed((s) => s + 1)}
            accessibilityRole="button"
            accessibilityLabel="Ver más avatares"
            hitSlop={8}
            style={[
              styles.seeMoreChip,
              { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
            ]}
          >
            <Text style={[styles.seeMoreText, { color: theme.colors.text }]}>Ver más</Text>
          </Pressable>
        </View>

        <View style={styles.grid}>
          {grid.map((slug) => {
            const on = slug === selected
            return (
              <Pressable
                key={slug}
                onPress={() => onSelect(slug)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={AVATAR_LABELS[slug]}
                style={[
                  styles.gridCell,
                  {
                    backgroundColor: on ? theme.colors.text : theme.colors.creamCard,
                    borderColor: on ? theme.colors.text : theme.colors.line,
                  },
                ]}
              >
                <AvatarAnimal
                  slug={slug}
                  size={52}
                  tint={on ? theme.colors.creamCard : theme.colors.text}
                  backgroundTint="transparent"
                />
              </Pressable>
            )
          })}
        </View>
      </RiseView>
    </View>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.6 },
  subcopy: { fontSize: 13, marginTop: 4 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  heroCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
  },
  heroLabel: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  gridHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  seeMoreChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  seeMoreText: { fontSize: 12, fontWeight: '700' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gridCell: {
    width: '22.5%',
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
