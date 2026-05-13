import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import Svg, { Path } from 'react-native-svg'
import { usePressScale } from '@/hooks/use-press-scale'
import { useAppTheme } from '@/theme/theme-provider'
import { RiseRow } from './smart-alerts-helpers'
import type { HeroState } from './hero-states'

interface HeaderCProps {
  state: HeroState
}

/**
 * Variant C · Header + search inline. Title compacto + count tiny al
 * lado. Search bar always-on debajo con placeholder "Buscar Netflix,
 * Alquiler…". Add button como icon glyph integrado al final del
 * search bar (mismo touch target visual).
 *
 * Útil cuando el usuario tiene 20+ fijos. Para 5-10 ítems el search
 * sobrepasa pero no estorba (es 1 sola línea).
 */
export function HeaderSearch({ state }: HeaderCProps) {
  const { theme } = useAppTheme()
  const press = usePressScale({ pressedScale: 0.94 })
  const [query, setQuery] = useState('')

  return (
    <View style={styles.wrapper}>
      <RiseRow delay={0}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: theme.colors.text }]}>Fijos</Text>
          <Text style={[styles.count, { color: theme.colors.textMuted }]}>
            ({state.cantidadFijos})
          </Text>
        </View>
      </RiseRow>

      <RiseRow delay={80}>
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: theme.isDark
                ? 'rgba(242,234,211,0.06)'
                : 'rgba(18,33,26,0.04)',
              borderColor: theme.colors.line,
            },
          ]}
        >
          <MaterialIcons
            name="search"
            size={18}
            color={theme.colors.textMuted}
          />
          <TextInput
            placeholder="Buscar Netflix, Alquiler…"
            placeholderTextColor={theme.colors.textMuted}
            value={query}
            onChangeText={setQuery}
            style={[styles.searchInput, { color: theme.colors.text }]}
          />
          {query.length > 0 ? (
            <Pressable
              onPress={() => setQuery('')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Limpiar búsqueda"
            >
              <MaterialIcons
                name="close"
                size={16}
                color={theme.colors.textMuted}
              />
            </Pressable>
          ) : null}
          <View style={[styles.divider, { backgroundColor: theme.colors.line }]} />
          <Pressable
            onPressIn={press.onPressIn}
            onPressOut={press.onPressOut}
            accessibilityRole="button"
            accessibilityLabel="Agregar fijo"
            hitSlop={8}
          >
            <Animated.View style={[styles.addInline, press.animatedStyle]}>
              <PlusIcon color={theme.colors.text} />
            </Animated.View>
          </Pressable>
        </View>
      </RiseRow>
    </View>
  )
}

const PlusIcon = ({ color }: { color: string }) => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 5v14M5 12h14"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
    />
  </Svg>
)

const styles = StyleSheet.create({
  wrapper: {
    gap: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  count: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
    paddingVertical: 2,
  },
  divider: {
    width: 1,
    height: 16,
    opacity: 0.6,
    marginHorizontal: 2,
  },
  addInline: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
})
