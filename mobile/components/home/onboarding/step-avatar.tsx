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

export function StepAvatar({ selected, onSelect }: StepAvatarProps) {
  const { theme } = useAppTheme()

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
          <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
            TODOS LOS AVATARES
          </Text>
          <Text style={[styles.gridCount, { color: theme.colors.textMuted }]}>
            {AVATAR_SLUGS.length} opciones
          </Text>
        </View>

        <View style={styles.grid}>
          {AVATAR_SLUGS.map((slug) => {
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
  gridCount: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
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
