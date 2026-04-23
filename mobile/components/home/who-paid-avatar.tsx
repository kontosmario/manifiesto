import { StyleSheet, View } from 'react-native'
import { Avatar } from '@/components/ui/avatar'
import { useAppTheme } from '@/theme/theme-provider'

interface WhoPaidAvatarProps {
  name: string
  color: string
  size?: number
}

export function WhoPaidAvatar({ name, color, size = 18 }: WhoPaidAvatarProps) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.wrap}>
      <Avatar name={name} color={color} size={size} ringColor={theme.colors.creamCard} />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', bottom: -3, right: -3 },
})
