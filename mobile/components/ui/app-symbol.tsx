import { Platform } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { SymbolView, type SymbolType, type SymbolWeight } from 'expo-symbols'

interface AppSymbolProps {
  name: string
  fallback: keyof typeof MaterialIcons.glyphMap
  size?: number
  color: string
  type?: SymbolType
  weight?: SymbolWeight
  style?: object
}

export function AppSymbol({
  name,
  fallback,
  size = 22,
  color,
  type = 'hierarchical',
  weight = 'semibold',
  style,
}: AppSymbolProps) {
  if (Platform.OS === 'ios') {
    return (
      <SymbolView
        fallback={<MaterialIcons color={color} name={fallback} size={size} />}
        name={name as never}
        size={size}
        style={style}
        tintColor={color}
        type={type}
        weight={weight}
      />
    )
  }

  return <MaterialIcons color={color} name={fallback} size={size} style={style} />
}
