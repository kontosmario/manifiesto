import { Dimensions } from 'react-native'
import { motionEasings } from '@/lib/motion/tokens'

// ── Pacing tokens ────────────────────────────────────────────────────
// El Wrapped se dispara una vez al mes. No hay que apurarse — el
// usuario quiere leer. 4500ms por escena permite mirar el número,
// procesar la copy, y avanzar antes de aburrir.
export const SCENE_DURATION_MS = 4500
export const SCENE_TRANSITION_MS = 280
// CR Sprint D Minor #2: re-export desde `motionEasings.enterSmooth`
// (curva idéntica) en lugar de redeclarar la bezier. Single source of
// truth en `mobile/lib/motion/tokens.ts`.
export const EXPO_OUT = motionEasings.enterSmooth

// Stagger entrance entre OptionCards (Spec B). Solo aplica al primer
// mount de la closing scene en MODE pending.
export const OPTION_STAGGER_MS = 70
export const OPTION_ENTER_MS = 260

export const SCREEN_WIDTH = Dimensions.get('window').width
