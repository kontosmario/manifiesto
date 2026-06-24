import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated'
import {
  AVATAR_LABELS,
  AVATAR_SLUGS,
  type AvatarSlug,
} from '@/assets/avatars'
import { AvatarAnimal } from '@/components/ui/avatar-animal'
import { RiseView } from '@/components/home/animated/rise-view'
import { usePressScale } from '@/hooks/use-press-scale'
import { radii } from '@/theme/palette'
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

        {/* Grid horizontal: 3 filas fijas que se desplazan a lo ancho.
            Mantiene el alto del sheet acotado (el footer "Guardar" queda
            siempre visible) y permite recorrer los 42 sin scroll vertical. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.gridContent}
        >
          {AVATAR_SLUGS.map((slug) => (
            <AvatarCell
              key={slug}
              slug={slug}
              selected={slug === selected}
              onSelect={onSelect}
              theme={theme}
            />
          ))}
        </ScrollView>
      </RiseView>
    </View>
  )
}

interface AvatarCellProps {
  slug: AvatarSlug
  selected: boolean
  onSelect: (slug: AvatarSlug) => void
  theme: ReturnType<typeof useAppTheme>['theme']
}

function AvatarCell({ slug, selected, onSelect, theme }: AvatarCellProps) {
  const press = usePressScale({ pressedScale: 0.98 })
  return (
    <Pressable
      onPress={() => onSelect(slug)}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={AVATAR_LABELS[slug]}
    >
      <Animated.View
        style={[
          styles.gridCell,
          press.animatedStyle,
          {
            backgroundColor: selected
              ? theme.colors.primarySurface
              : theme.colors.creamCard,
            borderColor: selected ? theme.colors.primary : theme.colors.line,
            borderWidth: selected ? 2 : 1,
          },
        ]}
      >
        <AvatarAnimal
          slug={slug}
          size={44}
          tint={selected ? theme.colors.primary : theme.colors.text}
          backgroundTint="transparent"
        />
      </Animated.View>
    </Pressable>
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
    borderRadius: radii.xl,
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
  // Column-wrap inside a horizontal ScrollView: items flow top→bottom
  // filling 3 rows, then wrap into the next column → content grows
  // horizontally and the ScrollView pans across it. Height = 3 cells +
  // 2 gaps so exactly 3 rows fit.
  gridContent: {
    flexDirection: 'column',
    flexWrap: 'wrap',
    alignContent: 'flex-start',
    height: 64 * 3 + 10 * 2,
    gap: 10,
    paddingRight: 4,
  },
  gridCell: {
    width: 64,
    height: 64,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
