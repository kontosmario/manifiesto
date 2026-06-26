import type { ComponentProps } from 'react'
import type { MaterialIcons } from '@expo/vector-icons'
import i18n from '@/lib/i18n'
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
  /** i18n key for the kind-specific fallback label. When the builder's
   *  CTA copy is the generic "Entendido" / "Ver detalle" / etc., we fall
   *  back to this label instead so the button reads as a real, unique
   *  verb. Resolved to text by `resolveCtaLabel` via `i18n.t`. The
   *  builder copy always wins when it's already specific (e.g. "Mover
   *  $42k", "Cancelar", "Avisar"). */
  fallbackLabelKey?: string
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
    fallbackLabelKey: 'control:advisorAction.fallbackAbrir',
  },
  'open-fixed-expense': {
    icon: 'tune',
    haptic: 'selection',
    fallbackLabelKey: 'control:advisorAction.fallbackAjustar',
  },
  'open-expenses-filtered': {
    icon: 'filter-list',
    haptic: 'selection',
    fallbackLabelKey: 'control:advisorAction.fallbackExplorar',
  },
  'open-add-fixed-prefilled': {
    icon: 'add-circle-outline',
    haptic: 'selection',
    fallbackLabelKey: 'control:advisorAction.fallbackRegistrar',
  },
  'open-savings-goal': {
    icon: 'flag',
    haptic: 'selection',
    fallbackLabelKey: 'control:advisorAction.fallbackVerMeta',
  },
  'open-streak-sheet': {
    icon: 'local-fire-department',
    haptic: 'success',
    fallbackLabelKey: 'control:advisorAction.fallbackVerRacha',
  },
  'scroll-to-section': {
    icon: 'south',
    haptic: 'selection',
    fallbackLabelKey: 'control:advisorAction.fallbackIrSeccion',
  },
  'send-member-warning': {
    icon: 'campaign',
    haptic: 'warning',
    fallbackLabelKey: 'control:advisorAction.fallbackAvisar',
  },
  'quick-savings-contribution': {
    icon: 'savings',
    haptic: 'success',
    fallbackLabelKey: 'control:advisorAction.fallbackMoverAhora',
  },
  dismiss: {
    icon: 'check-circle',
    haptic: 'success',
    fallbackLabelKey: 'control:advisorAction.fallbackEntendido',
  },
  'open-external-url': {
    icon: 'open-in-new',
    haptic: 'selection',
    fallbackLabelKey: 'control:advisorAction.fallbackAbrirEnlace',
  },
  'open-coach-mode': {
    icon: 'auto-awesome',
    haptic: 'selection',
    fallbackLabelKey: 'control:advisorAction.fallbackProfundizar',
  },
  'open-settings-modal': {
    icon: 'tune',
    haptic: 'selection',
    fallbackLabelKey: 'control:advisorAction.fallbackConfigurar',
  },
  'sub-usage-answer': {
    icon: 'check',
    haptic: 'success',
    fallbackLabelKey: 'control:advisorAction.fallbackResponder',
  },
  'sub-usage-cancel': {
    icon: 'cancel',
    haptic: 'warning',
    fallbackLabelKey: 'control:advisorAction.fallbackCancelar',
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
  return meta.fallbackLabelKey ? i18n.t(meta.fallbackLabelKey) : builderCta
}
