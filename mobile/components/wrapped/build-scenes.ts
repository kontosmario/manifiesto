import { createElement } from 'react'
import type { TFunction } from 'i18next'
import type { CycleWrappedPayload } from '@/lib/cycle-wrapped-emitter'
import { ContratapaScene } from './scenes/contratapa-scene'
import { DestinoScene } from './scenes/destino-scene'
import { NumerosScene } from './scenes/numeros-scene'
import { PortadaScene } from './scenes/portada-scene'
import { Top3Scene } from './scenes/top3-scene'
import { VeredictoScene, resolveVerdictState } from './scenes/veredicto-scene'
import type { WrappedSpec } from './wrapped-spec'
import type { WrappedScene } from './scenes/types'

/**
 * Ensambla la lista de escenas de "La Edición" a partir del payload +
 * el estado de decisión del orquestador. Composición pura: no toca
 * hooks ni anima nada — sólo describe qué pantallas van, en qué orden y
 * con qué acciones.
 *
 * Flujos posibles (README:22–23):
 *   MARGEN   → 01 · 02 · 03 · 05 · 06 (destino) · 07      (6)
 *   EXCEDIDO → 01 · 02 · 03 · 05 · 06 (recuperación) · 07 (6)
 *   JUSTO    → 01 · 02 · 03 · 05 · 07 — la 06 se salta    (5)
 *   (La 04 "Tu jardín" llega en V1.5 con su migración.)
 */

export interface WrappedDecisionState {
  /** Opción seleccionada en la 06 (id de la rama activa). */
  selected: string | null
  applying: boolean
  /**
   * Decisión resuelta — pasada (replay) o confirmada en ESTA sesión.
   * Alimenta el chip de la contratapa.
   */
  decided: { kind: string; metaTitle?: string | null } | null
}

export interface WrappedSceneHandlers {
  onSelect: (id: string) => void
  /** Confirma la 06 (aplica el RPC que corresponda) y avanza. */
  onConfirmDestino: () => void
  onAdvance: () => void
  onDismiss: () => void
}

export function buildWrappedScenes(
  payload: CycleWrappedPayload,
  t: TFunction,
  state: WrappedDecisionState,
  handlers: WrappedSceneHandlers,
  /** Spec resuelto contra el tema vigente (counts de partículas). */
  spec: WrappedSpec,
): WrappedScene[] {
  const verdict = resolveVerdictState(payload)
  const pending = Boolean(
    payload.pendingLeftoverDecision && payload.onApplyLeftoverDecision,
  )
  // `skip` persistido no se muestra como decisión pasada (no hay nada
  // interesante en "decidiste saltarlo") — cae al flujo vanilla.
  const past =
    payload.pastLeftoverDecision && payload.pastLeftoverDecision.decision !== 'skip'
      ? payload.pastLeftoverDecision
      : null

  // El pending existe pero este usuario no puede confirmar (RPC
  // owner-only): opciones a la vista, inertes, con el aviso. Y una vez
  // decidida EN ESTA SESIÓN (`state.decided`), la 06 pasa a modo lectura:
  // volver atrás desde la contratapa no puede re-armar el CTA de
  // confirmación (re-aplicaría el RPC).
  const canDecide = payload.canDecide !== false
  const interactive =
    (verdict === 'excedido' ? canDecide : pending && canDecide && !past) &&
    state.decided == null

  const includeDestino =
    verdict === 'excedido'
      ? true
      : verdict === 'margen'
        ? pending || past != null || state.decided != null
        : false

  const scenes: WrappedScene[] = []

  // ── 01 Portada ──
  scenes.push({
    id: 'portada',
    particleCount: spec.portada.particleCount,
    cta: {
      label: t('control:wrapped.edicion.ctaPortada'),
      onPress: handlers.onAdvance,
    },
    render: (args) => createElement(PortadaScene, { payload, args }),
  })

  // ── 02 Los números ──
  // CTA en TODAS las páginas (orden del owner 2026-08-13): el botón del
  // pie es la vía principal de navegación; el tap lateral queda de atajo.
  scenes.push({
    id: 'numeros',
    particleCount: 0,
    cta: {
      label: t('control:wrapped.edicion.ctaSeguir'),
      onPress: handlers.onAdvance,
    },
    render: (args) => createElement(NumerosScene, { payload, args }),
  })

  // ── 03 Top 3 (si el ciclo tiene categorías) ──
  if ((payload.topCategories ?? []).length > 0) {
    scenes.push({
      id: 'top3',
      particleCount: 0,
      cta: {
        label: t('control:wrapped.edicion.ctaSeguir'),
        onPress: handlers.onAdvance,
      },
      render: (args) => createElement(Top3Scene, { payload, args }),
    })
  }

  // ── 05 El veredicto ──
  scenes.push({
    id: 'veredicto',
    particleCount:
      verdict === 'margen' ? spec.veredicto.margen.particleCount : 0,
    cta: {
      label:
        verdict === 'margen'
          ? t('control:wrapped.edicion.ctaMargen')
          : verdict === 'excedido'
            ? t('control:wrapped.edicion.ctaExcedido')
            : t('control:wrapped.edicion.ctaJusto'),
      onPress: handlers.onAdvance,
    },
    render: (args) => createElement(VeredictoScene, { payload, args }),
  })

  // ── 06 Destino / Plan de recuperación (condicional) ──
  if (includeDestino) {
    const branch = verdict === 'excedido' ? 'excedido' : 'margen'
    const decidedId =
      state.decided?.kind === 'plan-cubrir'
        ? 'cubrir'
        : state.decided?.kind === 'plan-ajustar'
          ? 'ajustar'
          : state.decided?.kind === 'plan-revisar'
            ? 'revisar'
            : (state.decided?.kind ?? past?.decision ?? null)
    scenes.push({
      id: 'destino',
      particleCount: 0,
      blockTapAdvance: interactive,
      cta: interactive
        ? {
            label:
              branch === 'excedido'
                ? t('control:wrapped.edicion.ctaRecuperacion')
                : t('control:wrapped.edicion.ctaDestino'),
            onPress: handlers.onConfirmDestino,
            disabled: state.selected == null,
            busy: state.applying,
          }
        : {
            label: t('control:wrapped.edicion.ctaSeguir'),
            onPress: handlers.onAdvance,
          },
      render: (args) =>
        createElement(DestinoScene, {
          payload,
          args,
          branch,
          selected: state.selected,
          onSelect: handlers.onSelect,
          interactive,
          decidedId: interactive ? null : decidedId,
          decidedAtLabel:
            !interactive && past?.decidedAt
              ? t('control:wrapped.edicion.decidisteEl', {
                  fecha: formatDecidedAt(past.decidedAt),
                })
              : null,
          noOwnerHint: pending && !canDecide && !past,
        }),
    })
  }

  // ── 07 Contratapa ──
  scenes.push({
    id: 'contratapa',
    particleCount: spec.contratapa.particleCount,
    cta: {
      label: t('control:wrapped.edicion.ctaContratapa'),
      onPress: handlers.onDismiss,
    },
    render: (args) =>
      createElement(ContratapaScene, {
        payload,
        args,
        decisionChip: buildDecisionChip(payload, t, state, verdict),
      }),
  })

  return scenes
}

/** Chip de la contratapa — refleja la decisión (o el veredicto JUSTO). */
function buildDecisionChip(
  payload: CycleWrappedPayload,
  t: TFunction,
  state: WrappedDecisionState,
  verdict: 'margen' | 'excedido' | 'justo',
): string | null {
  const past =
    payload.pastLeftoverDecision && payload.pastLeftoverDecision.decision !== 'skip'
      ? payload.pastLeftoverDecision
      : null
  const kind = state.decided?.kind ?? past?.decision ?? null
  const metaTitle =
    state.decided?.metaTitle ?? past?.metaGoalTitle ?? payload.activeGoal?.title
  switch (kind) {
    case 'meta':
      return t('control:wrapped.edicion.chipMeta', { titulo: metaTitle ?? '' })
    case 'reserva':
      return t('control:wrapped.edicion.chipReserva')
    case 'acumular':
      return t('control:wrapped.edicion.chipAcumular')
    case 'plan-cubrir':
      return t('control:wrapped.edicion.chipPlanCubrir')
    case 'plan-ajustar':
      return t('control:wrapped.edicion.chipPlanAjustar')
    case 'plan-revisar':
      return t('control:wrapped.edicion.chipPlanRevisar')
    default:
      return verdict === 'justo' ? t('control:wrapped.edicion.chipJusto') : null
  }
}

/** "2026-07-20T…" → "20/7/2026" sin Intl (fuera de worklet igual, pero
 *  el formato corto no necesita locale). */
function formatDecidedAt(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${Number(m[3])}/${Number(m[2])}/${m[1]}`
}
