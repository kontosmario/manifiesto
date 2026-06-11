// Flag de "prompt biométrico en vuelo" — escrito por
// `authenticateBiometricAccess` (el chokepoint de TODOS los prompts:
// unlock, login, enrolamiento, re-auth, settings).
//
// Por qué existe: presentar un prompt de LocalAuthentication (Face ID,
// o la sheet de passcode en Expo Go) hace pasar la app a
// AppState=`inactive` — el MISMO estado que dispara el
// BackgroundSnapshotOverlay (cover verde sólido anti-screenshot, z100).
// Medido en device: la app queda `inactive` durante TODO el prompt y
// ~1.4s después de resolver → el cover tapaba el viaje de unlock entero
// (incluido el soar-away). Con este flag, el cover ignora el `inactive`
// del prompt; `background` real (swipe a multitasking) sigue cubriendo.

let inFlight = false

export function setBiometricPromptInFlight(value: boolean) {
  inFlight = value
}

export function isBiometricPromptInFlight() {
  return inFlight
}
