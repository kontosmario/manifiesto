import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View, type ScrollView } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import i18n from '@/lib/i18n'
import { motionDurations } from '@/lib/motion/tokens'
import { OnbCta, OnbHeader, OnbHero, OnbProgress, OnbScreenShell, OnbScrollBody } from './onb-kit'
import { OnbNumpad, useNumpadScrollAvoid } from './onb-numpad'
import { type OnbMode } from './onb-spec'
import {
  Onb5dDiaCaption,
  Onb5dDiaCard,
  Onb5dDiaGrid,
  Onb5dSemanaRow,
  type Onb5dCaptionSegment,
} from './onb-5d-parts/onb-5d-dia'
import { Onb5dMontoCard, Onb5dStepper } from './onb-5d-parts/onb-5d-monto-stepper'
import {
  Onb5dCicloGrid,
  Onb5dSectionLabel,
  Onb5dTipoTile,
  Onb5dVariableInfoCard,
  type Onb5dCicloTipo,
  type Onb5dTipo,
} from './onb-5d-parts/onb-5d-secciones'


/**
 * 5d · Tus ingresos — réplica de screens/5d…5d5.html (claro) y
 * 5do…5d5o.html (oscuro). Las cinco vistas del doc son ESTADOS de esta
 * misma pantalla: A fijo+mensual, B fijo+quincenal, C fijo+semanal,
 * D fijo+custom, E variable. Todo lo visible se deriva del estado.
 */

export type { Onb5dCicloTipo, Onb5dTipo }

export interface Onb5dIngresosState {
  tipo: Onb5dTipo | null
  cicloTipo: Onb5dCicloTipo | null
  /** Solo ciclo custom: cada N días (1–90). */
  cicloN: number
  /** Monto por período (solo fijo), en pesos. */
  monto: number
  /** Día del mes 1–31 (mensual / quincenal / custom). */
  diaCobro: number | null
  /** Día de la semana 0=L … 6=D (semanal). */
  diaSemana: number | null
}

/** Estados exactos que muestran los cinco mockups (para el preview). */
export const ONB_5D_MOCKUP_STATES: Record<
  '5d' | '5d2' | '5d3' | '5d4' | '5d5',
  Onb5dIngresosState
> = {
  '5d': { tipo: 'fijo', cicloTipo: 'mensual', cicloN: 10, monto: 2500000, diaCobro: 1, diaSemana: 4 },
  '5d2': { tipo: 'fijo', cicloTipo: 'quincenal', cicloN: 10, monto: 1250000, diaCobro: 1, diaSemana: 4 },
  '5d3': { tipo: 'fijo', cicloTipo: 'semanal', cicloN: 10, monto: 625000, diaCobro: 1, diaSemana: 4 },
  '5d4': { tipo: 'fijo', cicloTipo: 'custom', cicloN: 10, monto: 830000, diaCobro: 1, diaSemana: 4 },
  '5d5': { tipo: 'variable', cicloTipo: 'mensual', cicloN: 10, monto: 0, diaCobro: 1, diaSemana: 4 },
}

// ─── Copys derivados del estado (literales de los 5 mockups) ─────────
// Funciones (no consts): se resuelven en cada render con i18n.t para
// reflejar el idioma vigente (la pantalla usa useTranslation → re-render
// al cambiar de idioma).

function heroCopy(state: Onb5dIngresosState): { title: string; sub: string } {
  if (state.tipo === 'variable') {
    return {
      title: i18n.t('onboarding:redesign.ingresos.heroVariableTitle'),
      sub: i18n.t('onboarding:redesign.ingresos.heroVariableSub'),
    }
  }
  switch (state.cicloTipo) {
    case 'quincenal':
      return {
        title: i18n.t('onboarding:redesign.ingresos.heroQuincenalTitle'),
        sub: i18n.t('onboarding:redesign.ingresos.heroQuincenalSub'),
      }
    case 'semanal':
      return {
        title: i18n.t('onboarding:redesign.ingresos.heroSemanalTitle'),
        sub: i18n.t('onboarding:redesign.ingresos.heroSemanalSub'),
      }
    case 'custom':
      return {
        title: i18n.t('onboarding:redesign.ingresos.heroCustomTitle'),
        sub: i18n.t('onboarding:redesign.ingresos.heroCustomSub'),
      }
    default:
      return {
        title: i18n.t('onboarding:redesign.ingresos.heroDefaultTitle'),
        sub: i18n.t('onboarding:redesign.ingresos.heroDefaultSub'),
      }
  }
}

function montoLabels(): Record<Onb5dCicloTipo, { section: string; kicker: string }> {
  return {
    mensual: {
      section: i18n.t('onboarding:redesign.ingresos.montoSectionMensual'),
      kicker: i18n.t('onboarding:redesign.ingresos.montoKickerMensual'),
    },
    quincenal: {
      section: i18n.t('onboarding:redesign.ingresos.montoSectionQuincenal'),
      kicker: i18n.t('onboarding:redesign.ingresos.montoKickerQuincenal'),
    },
    semanal: {
      section: i18n.t('onboarding:redesign.ingresos.montoSectionSemanal'),
      kicker: i18n.t('onboarding:redesign.ingresos.montoKickerSemanal'),
    },
    custom: {
      section: i18n.t('onboarding:redesign.ingresos.montoSectionCustom'),
      kicker: i18n.t('onboarding:redesign.ingresos.montoKickerCustom'),
    },
  }
}

function diaSectionLabel(tipo: Onb5dTipo, cicloTipo: Onb5dCicloTipo): string {
  // Variable no tiene sección de monto → el día pasa a ser la 3.
  const num = tipo === 'variable' ? '3' : '4'
  switch (cicloTipo) {
    case 'semanal':
      return i18n.t('onboarding:redesign.ingresos.diaSemanal', { num })
    case 'quincenal':
      return i18n.t('onboarding:redesign.ingresos.diaQuincenal', { num })
    case 'custom':
      return i18n.t('onboarding:redesign.ingresos.diaCustom', { num })
    default:
      return tipo === 'variable'
        ? i18n.t('onboarding:redesign.ingresos.diaVariableMensual', { num })
        : i18n.t('onboarding:redesign.ingresos.diaMensual', { num })
  }
}

/** Nombre del día de la semana (0=lunes … 6=domingo) para el caption. */
function weekdayName(index: number): string {
  return i18n.t(`onboarding:redesign.ingresos.weekday.${index}`)
}

/** Abreviatura del mes (0=ene … 11=dic) para "próximo cobro". */
function monthAbbrev(index: number): string {
  return i18n.t(`onboarding:redesign.ingresos.month.${index}`)
}

/**
 * "21 jul" — fin del período de cobro que contiene HOY (= el próximo
 * cobro que verá el usuario). DEBE coincidir con el ciclo que se guarda:
 * neo-onboarding-screen ancla en el día `dia` del MES ACTUAL y el Home
 * usa getCurrentPayCycle (rolling). Un salto SOLO HACIA ADELANTE desde el
 * anchor (bug r2/r3) ignoraba que el borde del período puede caer ANTES
 * del anchor (p.ej. día 28, hoy 3 → el ciclo real corta el 14, no el 28),
 * y la caption prometía un cobro hasta ~cadaN días más tarde que el real.
 * Se replica EXACTO el modelo de computeRollingN (mobile/utils/pay-cycle.ts):
 * period = floor((hoy − anchor)/cadaN); fin = anchor + (period+1)·cadaN.
 * (Mediodía local en ambos: el offset se cancela en la aritmética de días
 * y sobrevive DST.)
 */
function proximoCobro(dia: number, cadaN: number, hoy: Date = new Date()): string {
  // Entradas defensivas: paso mínimo 1 día y día 1–31.
  const paso = Number.isFinite(cadaN) ? Math.max(1, Math.round(cadaN)) : 1
  const diaSeguro = Number.isFinite(dia) ? Math.min(Math.max(1, Math.round(dia)), 31) : 1
  const diasDelMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()
  const anchor = new Date(hoy.getFullYear(), hoy.getMonth(), Math.min(diaSeguro, diasDelMes), 12)
  const hoyMediodia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 12)
  const DAY_MS = 24 * 60 * 60 * 1000
  const diffDays = Math.floor((hoyMediodia.getTime() - anchor.getTime()) / DAY_MS)
  const periodIndex = Math.floor(diffDays / paso)
  const fin = new Date(anchor)
  fin.setDate(fin.getDate() + (periodIndex + 1) * paso)
  return `${fin.getDate()} ${monthAbbrev(fin.getMonth())}`
}

function captionSegments(state: Onb5dIngresosState): Onb5dCaptionSegment[] | null {
  const { tipo, cicloTipo, cicloN, diaCobro, diaSemana } = state
  if (cicloTipo === 'semanal') {
    if (diaSemana === null) return null
    return [
      { text: i18n.t('onboarding:redesign.ingresos.capSemanaPrefix') },
      { text: weekdayName(diaSemana), accent: true },
      { text: i18n.t('onboarding:redesign.ingresos.capSemanaSuffix') },
    ]
  }
  if (diaCobro === null) return null
  if (cicloTipo === 'mensual') {
    if (tipo === 'variable') {
      return [
        { text: i18n.t('onboarding:redesign.ingresos.capVarPrefix') },
        { text: String(diaCobro), accent: true },
        { text: i18n.t('onboarding:redesign.ingresos.capVarSuffix') },
      ]
    }
    return [
      { text: i18n.t('onboarding:redesign.ingresos.capMensualPrefix') },
      { text: i18n.t('onboarding:redesign.ingresos.capMensualAccent', { dia: diaCobro }), accent: true },
      { text: i18n.t('onboarding:redesign.ingresos.capMensualSuffix', { dia: diaCobro }) },
    ]
  }
  const cadaN = cicloTipo === 'quincenal' ? 14 : cicloN
  return [
    { text: i18n.t('onboarding:redesign.ingresos.capCadaPrefix') },
    { text: i18n.t('onboarding:redesign.ingresos.capCadaAccent', { cadaN }), accent: true },
    {
      text: i18n.t('onboarding:redesign.ingresos.capCadaSuffix', {
        dia: diaCobro,
        proximo: proximoCobro(diaCobro, cadaN),
      }),
    },
  ]
}

/**
 * Primer faltante del paso (validación bloqueante, orden 1→4).
 * null = completo. Copy corto estilo 3c ("Falta … para continuar").
 */
function faltante(state: Onb5dIngresosState): string | null {
  const { tipo, cicloTipo, monto, diaCobro, diaSemana } = state
  if (tipo === null) return i18n.t('onboarding:redesign.ingresos.faltanteTipo')
  if (cicloTipo === null) return i18n.t('onboarding:redesign.ingresos.faltanteCiclo')
  if (tipo === 'fijo' && monto <= 0) return i18n.t('onboarding:redesign.ingresos.faltanteMonto')
  if (cicloTipo === 'semanal' ? diaSemana === null : diaCobro === null) {
    return i18n.t('onboarding:redesign.ingresos.faltanteDia')
  }
  return null
}

// ─── Pantalla ────────────────────────────────────────────────────────

export function Onb5dIngresos({
  mode,
  state,
  onChange,
  onBack,
  onNext,
}: {
  mode: OnbMode
  state: Onb5dIngresosState
  onChange: (patch: Partial<Onb5dIngresosState>) => void
  onBack?: () => void
  onNext?: () => void
}) {
  const { t } = useTranslation()
  const hero = heroCopy(state)
  const { tipo, cicloTipo } = state

  // Revelado progresivo derivado del estado (decisión owner 2026-07-15:
  // la vista no llega cargada — 1 tipo → 2 ciclo → 3 monto + 4 día →
  // caption). Los mockups muestran los cinco estados completos; con
  // null se corta en la última elección.
  const showCiclo = tipo !== null
  const showStepper = showCiclo && cicloTipo === 'custom'
  const showMonto = tipo === 'fijo' && cicloTipo !== null
  const showDia = showCiclo && cicloTipo !== null
  const caption = showDia ? captionSegments(state) : null
  // Validación bloqueante: sin las 4 elecciones no se avanza.
  const missing = faltante(state)

  // El numpad del monto (4j/4jo) se monta como overlay de la screen; su
  // apertura la dispara la card de monto y se refleja en su tratamiento
  // "en edición". Solo aplica al caso fijo (única sección con monto).
  const [numpadOpen, setNumpadOpen] = useState(false)

  // Keyboard-avoidance: al abrir el numpad, elevamos la card de monto por
  // encima de la hoja (la card suele quedar baja en el scroll).
  const scrollRef = useRef<ScrollView>(null)
  const montoRef = useRef<View>(null)
  const { onScroll, extraBottomPad } = useNumpadScrollAvoid({
    scrollRef,
    targetRef: montoRef,
    open: numpadOpen && showMonto,
  })

  // Entrada suave de cada sección revelada (sin animación de salida:
  // las elecciones solo agregan secciones hacia abajo).
  const reveal = FadeInDown.duration(motionDurations.standard)

  return (
    <OnbScreenShell mode={mode}>
      <OnbScrollBody ref={scrollRef} onScroll={onScroll} extraBottomPad={extraBottomPad}>
        <OnbHeader mode={mode} title={t('onboarding:chrome.title.income')} onBack={onBack} />
        <OnbProgress mode={mode} active={3} />
        {/* Brot `coach`: es EL paso que explica (4 secciones reveladas
            una a una) — el rol "coach" que el handoff le asigna a Brot
            en los momentos informativos. El mockup no lo traía; lo pide
            el owner (2026-07-15) para tenerlo en todo el flujo. */}
        <OnbHero mode={mode} title={hero.title} subtitle={hero.sub} brotPose="coach" />

        <Onb5dSectionLabel mode={mode}>{t('onboarding:redesign.ingresos.section1')}</Onb5dSectionLabel>
        <Onb5dTipoTile
          mode={mode}
          kind="fijo"
          selected={tipo === 'fijo'}
          onPress={() => onChange({ tipo: 'fijo' })}
        />
        <Onb5dTipoTile
          mode={mode}
          kind="variable"
          selected={tipo === 'variable'}
          // Variable no tiene monto (mockup 5d5 lo modela con monto 0):
          // el patch lo pisa para que 5e/5f no arrastren el monto fijo.
          // Al volver a "fijo" queda 0 — el usuario lo re-ingresa.
          onPress={() => onChange({ tipo: 'variable', monto: 0 })}
        />
        {tipo === 'variable' ? (
          <Animated.View entering={reveal}>
            <Onb5dVariableInfoCard mode={mode} />
          </Animated.View>
        ) : null}

        {showCiclo ? (
          <Animated.View entering={reveal}>
            <Onb5dSectionLabel mode={mode}>
              {tipo === 'variable'
                ? t('onboarding:redesign.ingresos.section2Variable')
                : t('onboarding:redesign.ingresos.section2')}
            </Onb5dSectionLabel>
            <Onb5dCicloGrid
              mode={mode}
              selected={cicloTipo}
              onSelect={(ciclo) => onChange({ cicloTipo: ciclo })}
            />
          </Animated.View>
        ) : null}

        {showStepper ? (
          <Animated.View entering={reveal}>
            <Onb5dSectionLabel mode={mode}>{t('onboarding:redesign.ingresos.stepperLabel')}</Onb5dSectionLabel>
            <Onb5dStepper
              mode={mode}
              value={state.cicloN}
              onChange={(cicloN) => onChange({ cicloN })}
            />
          </Animated.View>
        ) : null}

        {showMonto && cicloTipo !== null ? (
          <Animated.View entering={reveal}>
            <Onb5dSectionLabel mode={mode}>{montoLabels()[cicloTipo].section}</Onb5dSectionLabel>
            {/* Wrapper con ref: blanco de medición del keyboard-avoidance. */}
            <View ref={montoRef}>
              <Onb5dMontoCard
                mode={mode}
                kicker={montoLabels()[cicloTipo].kicker}
                monto={state.monto}
                editing={numpadOpen}
                onOpen={() => setNumpadOpen(true)}
              />
            </View>
          </Animated.View>
        ) : null}

        {showDia && tipo !== null && cicloTipo !== null ? (
          <Animated.View entering={reveal}>
            <Onb5dSectionLabel mode={mode}>{diaSectionLabel(tipo, cicloTipo)}</Onb5dSectionLabel>
            <Onb5dDiaCard mode={mode}>
              {cicloTipo === 'semanal' ? (
                <Onb5dSemanaRow
                  mode={mode}
                  selected={state.diaSemana}
                  onSelect={(diaSemana) => onChange({ diaSemana })}
                />
              ) : (
                <Onb5dDiaGrid
                  mode={mode}
                  selected={state.diaCobro}
                  onSelect={(diaCobro) => onChange({ diaCobro })}
                />
              )}
              {caption ? (
                <Animated.View entering={reveal}>
                  <Onb5dDiaCaption mode={mode} segments={caption} />
                </Animated.View>
              ) : null}
            </Onb5dDiaCard>
          </Animated.View>
        ) : null}

        {/* El mockup lleva el CTA en el flujo con 20px sobre la última
            card; con el revelado el contenido arranca corto, así que el
            'auto' lo ancla abajo y el paddingTop garantiza el 20 mínimo
            (con contenido largo el 'auto' colapsa a 0 → 20 literal). */}
        <View style={styles.ctaWrap}>
          <OnbCta
            mode={mode}
            label={t('onboarding:cta.next')}
            disabled={missing !== null}
            disabledHint={missing ?? undefined}
            onPress={onNext}
          />
        </View>
      </OnbScrollBody>

      {/* Numpad como overlay full-width de la screen (fuera del scroll):
          se ancla al fondo y su zona superior cierra por tap fuera. */}
      <OnbNumpad
        mode={mode}
        visible={numpadOpen && showMonto}
        value={state.monto}
        onChange={(monto) => onChange({ monto })}
        onDone={() => setNumpadOpen(false)}
      />
    </OnbScreenShell>
  )
}

const styles = StyleSheet.create({
  ctaWrap: {
    marginTop: 'auto',
    paddingTop: 20,
  },
})
