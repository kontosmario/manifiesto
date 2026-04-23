import { Alert, Platform } from 'react-native'

export function promptBiometricSetup(label: string) {
  if (Platform.OS === 'web') {
    return Promise.resolve(false)
  }

  return new Promise<boolean>((resolve) => {
    let settled = false

    const finish = (result: boolean) => {
      if (settled) {
        return
      }

      settled = true
      resolve(result)
    }

    Alert.alert(
      `Activar ${label}`,
      `Después vas a poder ingresar automáticamente con ${label}.`,
      [
        {
          style: 'cancel',
          text: 'Ahora no',
          onPress: () => {
            finish(false)
          },
        },
        {
          text: 'Activar',
          onPress: () => {
            finish(true)
          },
        },
      ],
      {
        cancelable: true,
        onDismiss: () => {
          finish(false)
        },
      },
    )
  })
}
