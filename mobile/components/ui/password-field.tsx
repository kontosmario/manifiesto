import { forwardRef, useRef, useState, type ComponentProps } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import type { TextInput } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { TextField } from './text-field'
import { DEFAULT_HIT_SLOP } from '@/theme/interaction'
import { useAppTheme } from '@/theme/theme-provider'

type TextFieldProps = ComponentProps<typeof TextField>
type PasswordFieldProps = Omit<TextFieldProps, 'secureTextEntry' | 'trailing'>

/**
 * Campo de contraseña con el ver/ocultar clásico (ojo en el trailing). Wrappea
 * el TextField (reusa label + borde animado). El valor es controlado, así que
 * togglear `secureTextEntry` no lo pierde. Al togglear se mantiene el foco para
 * que el teclado no se cierre (y no re-dispare el keyboard-avoidance del screen).
 */
export const PasswordField = forwardRef<TextInput, PasswordFieldProps>(
  function PasswordField(props, ref) {
    const { theme } = useAppTheme()
    const { t } = useTranslation()
    const [visible, setVisible] = useState(false)
    const innerRef = useRef<TextInput | null>(null)

    const setRefs = (node: TextInput | null) => {
      innerRef.current = node
      if (typeof ref === 'function') {
        ref(node)
      } else if (ref) {
        ref.current = node
      }
    }

    const toggle = () => {
      setVisible((v) => !v)
      // Mantener el foco: sin esto, tocar el ojo blurea el input → el teclado se
      // cierra y el screen re-corre su keyboard-avoidance (salto del contenido).
      innerRef.current?.focus()
    }

    return (
      <TextField
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
        ref={setRefs}
        secureTextEntry={!visible}
        trailing={
          <Pressable
            accessibilityLabel={visible ? t('states:passwordField.hide') : t('states:passwordField.show')}
            accessibilityRole="button"
            hitSlop={DEFAULT_HIT_SLOP}
            onPress={toggle}
            style={styles.eye}
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

const styles = StyleSheet.create({
  // Llena la altura del trailing (que se estira al alto del input) y centra el
  // ícono → el ojo queda alineado verticalmente con el texto.
  eye: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
