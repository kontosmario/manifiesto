import { StyleSheet, Text, View } from 'react-native'

interface AvatarProps {
  name: string
  color: string
  size?: number
  ringColor?: string
}

export function Avatar({ name, color, size = 28, ringColor }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          borderColor: ringColor ?? 'transparent',
          borderWidth: ringColor ? 2 : 0,
        },
      ]}
    >
      <Text style={[styles.initials, { fontSize: size * 0.42, color: '#fff' }]}>{initials}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontWeight: '700', letterSpacing: 0.2 },
})
