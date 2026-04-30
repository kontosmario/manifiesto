import type { ComponentProps } from 'react'
import type { MaterialIcons } from '@expo/vector-icons'
import type { AppHapticTone } from '@/lib/haptics'
import type { ControlAction } from '@/features/insights/control-action'

type MaterialIconName = ComponentProps<typeof MaterialIcons>['name']

export interface AsesorActionMeta {
  /** Icon shown in the CTA pill — communicates *what kind of action*
   *  (navigate, edit, dismiss, contribute…) without reading the label. */
  icon: MaterialIconName
  /** Haptic fired on press. Different tones for different commitments —
   *  acknowledging is `success`, navigating is `selection`, alerting a
   *  family member is `warning`. */
  haptic: AppHapticTone
  /** When the builder's CTA copy is the generic "Entendido" / "Ver
   *  detalle" / "Ver fijos" / etc., we fall back to this kind-specific
   *  label instead so the button reads as a real, unique verb. The
   *  builder copy always wins when it's already specific (e.g. "Mover
   *  $42k", "Cancelar", "Avisar"). */
  fallbackLabel?: string
}

const GENERIC_LABELS = new Set([
  'Entendido',
  'Ver',
  'Ver detalle',
  'Ver fijos',
  'Ver meta',
  'Ver gastos',
])

/**
 * Map every `action.kind` to a unique visual identity (icon + haptic +
 * fallback label). The dispatcher already routes each kind to a
 * different destination — this is the UI side of "every action feels
 * unique on press".
 */
const META_BY_KIND: Record<ControlAction['kind'], AsesorActionMeta> = {
  navigate: {
    icon: 'north-east',
    haptic: 'selection',
    fallbackLabel: 'Abrir',
  },
  'open-fixed-expense': {
    icon: 'tune',
    haptic: 'selection',
    fallbackLabel: 'Ajustar',
  },
  'open-expenses-filtered': {
    icon: 'filter-list',
    haptic: 'selection',
    fallbackLabel: 'Explorar',
  },
  'open-add-fixed-prefilled': {
    icon: 'add-circle-outline',
    haptic: 'selection',
    fallbackLabel: 'Registrar',
  },
  'open-savings-goal': {
    icon: 'flag',
    haptic: 'selection',
    fallbackLabel: 'Ver meta',
  },
  'open-streak-sheet': {
    icon: 'local-fire-department',
    haptic: 'success',
    fallbackLabel: 'Ver racha',
  },
  'scroll-to-section': {
    icon: 'south',
    haptic: 'selection',
    fallbackLabel: 'Ir a sección',
  },
  'send-member-warning': {
    icon: 'campaign',
    haptic: 'warning',
    fallbackLabel: 'Avisar',
  },
  'quick-savings-contribution': {
    icon: 'savings',
    haptic: 'success',
    fallbackLabel: 'Mover ahora',
  },
  dismiss: {
    icon: 'check-circle',
    haptic: 'success',
    fallbackLabel: 'Entendido',
  },
  'open-external-url': {
    icon: 'open-in-new',
    haptic: 'selection',
    fallbackLabel: 'Abrir enlace',
  },
  'open-coach-mode': {
    icon: 'auto-awesome',
    haptic: 'selection',
    fallbackLabel: 'Profundizar',
  },
}

/**
 * Resolve the visual + haptic metadata for an advisor task action.
 * Falls back to a sane "navigate" treatment if the task has no action.
 */
export function getActionMeta(
  action: ControlAction | undefined,
): AsesorActionMeta {
  if (!action) {
    return {
      icon: 'arrow-forward',
      haptic: 'selection',
    }
  }
  return META_BY_KIND[action.kind]
}

/**
 * Resolve the CTA label: the builder's copy unless it's a generic
 * "Entendido"/"Ver detalle" placeholder, in which case we use the
 * action-specific fallback.
 */
export function resolveCtaLabel(
  builderCta: string,
  action: ControlAction | undefined,
): string {
  if (!GENERIC_LABELS.has(builderCta)) return builderCta
  const meta = getActionMeta(action)
  return meta.fallbackLabel ?? builderCta
}
