import { Dimensions } from 'react-native'
import { Easing } from 'react-native-reanimated'

// ── Pacing tokens ────────────────────────────────────────────────────
// El Wrapped se dispara una vez al mes. No hay que apurarse — el
// usuario quiere leer. 4500ms por escena permite mirar el número,
// procesar la copy, y avanzar antes de aburrir.
export const SCENE_DURATION_MS = 4500
export const SCENE_TRANSITION_MS = 280
export const EXPO_OUT = Easing.bezier(0.16, 1, 0.30, 1) // ease-out-expo

// Stagger entrance entre OptionCards (Spec B). Solo aplica al primer
// mount de la closing scene en MODE pending.
export const OPTION_STAGGER_MS = 70
export const OPTION_ENTER_MS = 260

export const SCREEN_WIDTH = Dimensions.get('window').width
