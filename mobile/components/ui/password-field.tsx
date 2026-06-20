import { forwardRef, useState, type ComponentProps } from 'react'
import { Pressable } from 'react-native'
import type { TextInput } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { TextField } from './text-field'
import { DEFAULT_HIT_SLOP } from '@/theme/interaction'
import { useAppTheme } from '@/theme/theme-provider'

type TextFieldProps = ComponentProps<typeof TextField>
type PasswordFieldProps = Omit<TextFieldProps, 'secureTextEntry' | 'trailing'>

/**
 * Campo de contraseña con el ver/ocultar clásico (ojo en el trailing). Wrappea
 * el TextField (reusa label + borde animado). El valor es controlado, así que
 * togglear `secureTextEntry` no lo pierde.
 */
export const PasswordField = forwardRef<TextInput, PasswordFieldProps>(
  function PasswordField(props, ref) {
    const { theme } = useAppTheme()
    const [visible, setVisible] = useState(false)
    return (
      <TextField
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
        ref={ref}
        secureTextEntry={!visible}
        trailing={
          <Pressable
            accessibilityLabel={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            accessibilityRole="button"
            hitSlop={DEFAULT_HIT_SLOP}
            onPress={() => setVisible((v) => !v)}
          >
            <MaterialIcons
              name={visible ? 'visibility-off' : 'visibility'}
              size={20}
              color={theme.colors.textMuted}
            />
          </Pressable>
        }
      />
    )
  },
)
