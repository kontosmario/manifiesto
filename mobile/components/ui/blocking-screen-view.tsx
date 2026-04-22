import { StyleSheet, Text, View } from 'react-native'
import { LoadingBlock } from '@/components/ui/loading-block'
import { useAppTheme } from '@/theme/theme-provider'

interface BlockingScreenViewProps {
  message?: string
}

export function BlockingScreenView({ message = 'Cargando' }: BlockingScreenViewProps) {
  const { theme } = useAppTheme()

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <LoadingBlock label={message} />
      <Text style={[styles.caption, { color: theme.colors.textSoft }]}>Manifiesto mobile</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 24,
  },
  caption: {
    fontSize: 13,
    fontWeight: '600',
  },
})
