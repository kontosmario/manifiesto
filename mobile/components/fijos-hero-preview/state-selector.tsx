import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useAppTheme } from '@/theme/theme-provider'
import type { HeroState } from './hero-states'

interface StateSelectorProps {
  states: HeroState[]
  activeId: string
  onSelect: (id: string) => void
  onReplay: () => void
}

/**
 * Horizontal segmented selector + "replay animation" button. Cada
 * cambio de estado dispara un cambio de key en el live component, así
 * que la entrance animation se replay automáticamente. El botón
 * replay re-trigger el mismo cambio sin cambiar de estado (incrementa
 * un nonce interno en el screen padre).
 */
export function StateSelector({
  states,
  activeId,
  onSelect,
  onReplay,
}: StateSelectorProps) {
  const { theme } = useAppTheme()
  const active = states.find((s) => s.id === activeId)

  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {states.map((s) => {
          const isActive = s.id === activeId
          return (
            <Pressable
              key={s.id}
              onPress={() => onSelect(s.id)}
              style={[
                styles.chip,
                {
                  borderColor: isActive ? theme.colors.heroAccent : theme.colors.borderStrong,
                  backgroundColor: isActive
                    ? theme.isDark
                      ? 'rgba(166,239,143,0.15)'
                      : 'rgba(31,89,13,0.10)'
                    : 'transparent',
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  {
                    color: isActive
                      ? theme.isDark
                        ? theme.colors.heroAccent
                        : '#1F590D'
                      : theme.colors.textMuted,
                    fontWeight: isActive ? '800' : '600',
                  },
                ]}
              >
                {s.label}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>

      {active ? (
        <View style={styles.descBlock}>
          <Text style={[styles.descText, { color: theme.colors.textMuted }]}>
            {active.description}
          </Text>
          <Pressable
            onPress={onReplay}
            style={({ pressed }) => [
              styles.replayBtn,
              {
                borderColor: theme.colors.borderStrong,
                opacity: pressed ? 0.6 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Reproducir animación de entrada"
          >
            <MaterialIcons
              name="replay"
              size={14}
              color={theme.colors.textMuted}
            />
            <Text style={[styles.replayText, { color: theme.colors.textMuted }]}>
              Replay
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 20,
  },
  scroll: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 12,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    letterSpacing: 0.2,
  },
  descBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 16,
  },
  descText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontStyle: 'italic',
  },
  replayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  replayText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
})
