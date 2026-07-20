import {
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  Nunito_900Black,
  useFonts,
} from '@expo-google-fonts/nunito'
import { RootLayoutShell } from '@/components/root/root-layout-shell'

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Nunito_900Black,
  })

  // Fuentes locales (bundled): esto resuelve en el primer tick. Mientras
  // tanto devolvemos null y el splash nativo sigue tapando la pantalla.
  // Si la carga fallara, arrancamos igual con la fuente de sistema.
  if (!fontsLoaded && !fontError) return null

  return <RootLayoutShell />
}
