// @i18n-ignore-file — tooling dev-only gated por __DEV__.
import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import Animated, { FadeInLeft, FadeInRight } from 'react-native-reanimated'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AVATAR_LABELS } from '@/assets/avatars'
import { Onb5aNombre } from '@/components/redesign/onboarding/onb-5a-nombre'
import { Onb5bAvatar } from '@/components/redesign/onboarding/onb-5b-avatar'
import { Onb5cHogar } from '@/components/redesign/onboarding/onb-5c-hogar'
import { Onb5dIngresos } from '@/components/redesign/onboarding/onb-5d-ingresos'
import { Onb5eAhorro } from '@/components/redesign/onboarding/onb-5e-ahorro'
import { Onb5e2Meta } from '@/components/redesign/onboarding/onb-5e2-meta'
import { Onb5fResumen } from '@/components/redesign/onboarding/onb-5f-resumen'
import { Onb5gAporte } from '@/components/redesign/onboarding/onb-5g-aporte'
import { Onb5hConfirmar } from '@/components/redesign/onboarding/onb-5h-confirmar'
import { cicloLabel, formatPesos } from '@/components/redesign/onboarding/onb-format'
import {
  buildInitialOnbState,
  monthlyFromIncome,
  ONB_ALL_STEPS,
  ONB_JOINER_STEP_ORDER,
  ONB_STEP_ORDER,
  type OnbAnyStep,
  type OnbFlowState,
} from '@/components/redesign/onboarding/onb-flow-state'
import { ONB_SPEC, type OnbMode } from '@/components/redesign/onboarding/onb-spec'
import { motionDurations } from '@/lib/motion/tokens'
import { nunitoFamily } from '@/theme/typography'

/**
 * Flujo interactivo full-screen del onboarding del rediseño (preview
 * dev-only). Estado demo local + revelado paso a paso + toggle
 * flotante claro/oscuro (chrome del preview, NO parte del mockup).
 *
 * Se puede entrar en un paso puntual con ?step=5a…5h (lo usa el
 * sub-índice de aprobación por pantalla). 5g/5h son el ramal joiner.
 */


function isOnbStep(value: string | undefined): value is OnbAnyStep {
  return ONB_ALL_STEPS.includes(value as OnbAnyStep)
}

export function RedesignOnboardingFlowScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ step?: string }>()

  const entryStep: OnbAnyStep = isOnbStep(params.step) ? params.step : '5a'
  const [mode, setMode] = useState<OnbMode>('light')
  const [step, setStepState] = useState<OnbAnyStep>(entryStep)
  // Dirección de la última navegación → la transición entra desde el
  // lado correcto (adelante: desde la derecha; atrás: desde la izquierda).
  // La secuencia monotónica global (ONB_ALL_STEPS, con 5g/5h al final)
  // da la dirección correcta incluso al cruzar al ramal joiner: 5c→5g
  // lee "adelante", 5g→5c "atrás".
  const [navDir, setNavDir] = useState<'fwd' | 'back'>('fwd')
  const setStep = (next: OnbAnyStep) => {
    setNavDir(ONB_ALL_STEPS.indexOf(next) >= ONB_ALL_STEPS.indexOf(step) ? 'fwd' : 'back')
    setStepState(next)
  }
  // El seed depende del paso de entrada: entrar después de 5d siembra
  // el income demo del mockup; entrar antes lo deja vacío para el
  // revelado secuencial de 5d.
  const [state, setState] = useState<OnbFlowState>(() => buildInitialOnbState(entryStep))

  const patch = useCallback((partial: Partial<OnbFlowState>) => {
    setState((prev) => ({ ...prev, ...partial }))
  }, [])

  // Orden ACTIVO según el ramal: el joiner (familyMode 'joined') va
  // 5a·5b·5c·5g·5h; el creador ('solo'/'created') mantiene el orden
  // intacto 5a…5f. goNext/goBack navegan sobre este orden.
  const activeOrder: OnbAnyStep[] =
    state.familyMode === 'joined' ? ONB_JOINER_STEP_ORDER : ONB_STEP_ORDER
  const stepIndex = activeOrder.indexOf(step)
  // Sin useCallback: dependían de [step], que cambia en cada navegación
  // — no cacheaban nada. Funciones planas.
  const goNext = () => {
    const next = activeOrder[stepIndex + 1]
    if (next) setStep(next)
  }
  const goBack = () => {
    const prev = activeOrder[stepIndex - 1]
    if (prev) setStep(prev)
    else router.back()
  }
  // Fin del onboarding → pantalla del PLAN (secuencia real: onboarding
  // completo → trial-welcome → paywall welcomeMode → Home). El paywall
  // vive en el flujo de auth (redesign-auth ?step=plan).
  const goPlan = () =>
    router.push('/(app)/settings/dev/redesign-auth?step=plan' as never)

  const s = ONB_SPEC[mode]

  // Sin useMemo deliberadamente: acá no cacheaba nada (sus deps cambian
  // en cada render que importa) y el switch es barato.
  const screen = (() => {
    switch (step) {
      case '5a':
        return (
          <Onb5aNombre
            mode={mode}
            name={state.name}
            onChangeName={(name) => patch({ name })}
            onBack={goBack}
            onNext={goNext}
          />
        )
      case '5b':
        return (
          <Onb5bAvatar
            mode={mode}
            avatar={state.avatar}
            onSelectAvatar={(avatar) => patch({ avatar })}
            onBack={goBack}
            onNext={goNext}
          />
        )
      case '5c':
        return (
          <Onb5cHogar
            mode={mode}
            hogar={state.hogar}
            onChangeHogar={(hogar) => patch({ hogar })}
            onBack={goBack}
            // Solo/crear: fija el ramal creador y sigue a 5d. Destino
            // EXPLÍCITO (no goNext): si un joiner vuelve a 5c y cambia a
            // solo, familyMode todavía es 'joined' en este render y
            // goNext leería el orden joiner (iría a 5g). 5c→creador
            // siempre es 5d.
            onNext={() => {
              patch({ familyMode: state.hogar === 'solo' ? 'solo' : 'created' })
              setStep('5d')
            }}
            // Unirse con código: fija el ramal joiner y desvía a 5g.
            onJoin={() => {
              patch({ familyMode: 'joined' })
              setStep('5g')
            }}
          />
        )
      case '5d':
        return (
          <Onb5dIngresos
            mode={mode}
            state={state.income}
            onChange={(p) => patch({ income: { ...state.income, ...p } })}
            onBack={goBack}
            onNext={goNext}
          />
        )
      case '5e':
        return (
          <Onb5eAhorro
            mode={mode}
            percent={state.ahorroPct}
            monthlyIncome={monthlyFromIncome(state.income)}
            onSelectPercent={(ahorroPct) => patch({ ahorroPct })}
            // "Agregar una meta" desvía a 5e2; el CTA "Terminar y
            // empezar" salta directo al resumen (la meta es opcional).
            onAddGoal={() => setStep('5e2')}
            onBack={goBack}
            onNext={() => setStep('5f')}
          />
        )
      case '5e2':
        return (
          <Onb5e2Meta
            mode={mode}
            meta={state.meta}
            onChangeMeta={(meta) => patch({ meta })}
            onBack={goBack}
            onNext={() => setStep('5f')}
            onSkip={() => {
              patch({ meta: null })
              setStep('5f')
            }}
          />
        )
      case '5f': {
        return (
          <Onb5fResumen
            mode={mode}
            summary={{
              name: state.name,
              avatar: { slug: state.avatar, label: AVATAR_LABELS[state.avatar] },
              hogar: state.hogar === 'solo' ? 'Yo solo' : 'Con mi familia',
              hogarSolo: state.hogar === 'solo',
              ingresos: `${formatPesos(monthlyFromIncome(state.income))} · ${cicloLabel(state.income)}`,
              ahorro: `${state.ahorroPct}% · ${formatPesos((monthlyFromIncome(state.income) * state.ahorroPct) / 100)} por mes`,
            }}
            onGoHome={goPlan}
          />
        )
      }
      case '5g':
        return (
          <Onb5gAporte
            mode={mode}
            contributesIncome={state.contributesIncome}
            contribution={state.contribution}
            onChange={(p) => patch(p)}
            onBack={goBack}
            onNext={goNext}
          />
        )
      case '5h':
        return (
          <Onb5hConfirmar
            mode={mode}
            contribution={state.contribution}
            contributes={state.contributesIncome === true}
            onBack={goBack}
            // Confirmar y unirse → resumen joiner (5i).
            onJoin={() => setStep('5i')}
          />
        )
      case '5i': {
        // Resumen del que se unió: mismo 5f, variante joiner (HOGAR =
        // la familia + fila APORTE, sin ingresos-ciclo/ahorro).
        const aporte =
          state.contributesIncome === true && state.contribution > 0
            ? `Aportas ${formatPesos(state.contribution)} /mes`
            : 'No aportas al hogar'
        return (
          <Onb5fResumen
            mode={mode}
            summary={{
              name: state.name,
              avatar: { slug: state.avatar, label: AVATAR_LABELS[state.avatar] },
              hogar: 'Con mi familia',
              hogarSolo: false,
              ingresos: '',
              ahorro: '',
              variant: 'joiner',
              joinerHogar: 'Te uniste · 3 miembros',
              joinerAporte: aporte,
            }}
            onGoHome={goPlan}
          />
        )
      }
      default:
        // Pasos en integración — las réplicas se van cableando a medida
        // que se transcriben. Placeholder explícito, no silencioso.
        return (
          <View style={styles.pendingWrap}>
            <Text style={[styles.pendingText, { color: s.text }]}>
              Réplica {step} en integración
            </Text>
          </View>
        )
    }
  })()

  return (
    <View style={[styles.root, { backgroundColor: s.bg }]}>
      <View
        style={[
          styles.content,
          { paddingTop: insets.top + 10, paddingBottom: Math.max(insets.bottom, 10) },
        ]}
      >
        {/* key=step re-monta la pantalla; entra desde el lado de la
            dirección navegada (fade + slide sutil). */}
        <Animated.View
          key={step}
          entering={(navDir === 'fwd' ? FadeInRight : FadeInLeft).duration(
            motionDurations.enterStack,
          )}
          style={styles.stepHost}
        >
          {screen}
        </Animated.View>
      </View>

      {/* Chrome del preview: toggle de tema + paso actual. Flotante y
          discreto — NO es parte del mockup. */}
      <View pointerEvents="box-none" style={[styles.devChrome, { top: insets.top + 6 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Alternar tema del preview"
          onPress={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))}
          style={[styles.devToggle, { borderColor: s.helper }]}
        >
          <Text style={styles.devToggleIcon}>{mode === 'light' ? '🌙' : '☀️'}</Text>
        </Pressable>
        <Text style={[styles.devStep, { color: s.helper }]}>
          {step} · {stepIndex + 1}/{activeOrder.length}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  // Sin padding horizontal acá: lo pone cada pantalla (OnbBody /
  // OnbScrollBody del kit). Si el padding vive fuera del ScrollView,
  // el viewport del scroll guillotina las sombras neumórficas en el
  // borde exacto de las cards (feedback owner 2026-07-15).
  content: {
    flex: 1,
  },
  stepHost: {
    flex: 1,
  },
  pendingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingText: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  devChrome: {
    position: 'absolute',
    right: 10,
    alignItems: 'center',
    gap: 3,
  },
  devToggle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  devToggleIcon: {
    fontSize: 15,
  },
  devStep: {
    fontSize: 9,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
})
