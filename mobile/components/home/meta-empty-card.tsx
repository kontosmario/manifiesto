// Placeholder card for the goal slot when the user hasn't created
// any savings goal yet. The original Home behavior dropped the slot
// entirely, leaving the surface silent about a feature that's a key
// driver of retention. This card replaces that silence with a low-
// friction CTA that lands on `/savings-goal`.

import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { MaterialIcons } from '@expo/vector-icons'
import { RiseView } from '@/components/home/animated/rise-view'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'

export const MetaEmptyCard = memo(function MetaEmptyCard() {
  const { theme } = useAppTheme()
  const router = useRouter()

  const onPress = () => {
    void triggerHaptic('selection')
    router.push('/(app)/savings-goal' as never)
  }

  return (
    <RiseView delay={300}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Crear tu primera meta de ahorro"
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: theme.colors.creamCard,
            borderColor: theme.colors.line,
          },
          pressed && { opacity: 0.85 },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: theme.colors.primarySurface }]}>
          <MaterialIcons name="savings" size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.text}>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            Crea tu primera meta
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]} maxFontSizeMultiplier={1.4}>
            Define un objetivo y el asistente te muestra cuánto adelantás cada ciclo.
          </Text>
        </View>
        <MaterialIcons name="chevron-right" size={18} color={theme.colors.textMuted} />
      </Pressable>
    </RiseView>
  )
})

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '700' },
  subtitle: { fontSize: 12, lineHeight: 16 },
})
