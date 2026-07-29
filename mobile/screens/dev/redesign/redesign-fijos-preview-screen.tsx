// @i18n-ignore-file — tooling dev-only gated por __DEV__.
import { useState, type PropsWithChildren } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Screen } from '@/components/ui/screen'
import {
  FijosHeader,
  FijosHero,
  fijosHeaderHeroSpacing,
  type FijosHeroVariant,
} from '@/components/redesign/fijos/fijos-screen'
import type { FijosMode } from '@/components/redesign/fijos/fijos-spec'
import { PreviewPhoneSection } from '@/screens/dev/redesign/redesign-preview-shared'
import { useThemeTokens } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

/**
 * Preview dev-only de la vista FIJOS del rediseño (design/fijos-2026-07/
 * Fijos Manifiesto.dc.html): réplica pixel-perfect del header + hero, claro
 * y oscuro, MÁS un ciclador de los 8 estados del hero (E1–E8).
 *
 * ALCANCE — adelantado del Task 6 del plan
 * docs/superpowers/plans/2026-07-29-fijos-f0-f1.md. Se trajo al frente
 * (antes de Tasks 4/5) porque el owner no puede aprobar lo que no puede
 * abrir, y la aprobación es lo que destraba el resto: por eso esta pantalla
 * cubre SOLO lo que hoy existe en fijos-screen.tsx (`FijosHeader` +
 * `FijosHero`). El componente Avisos (ticker + 6 estados, Task 4) y "Todos
 * tus fijos" (tabs/categorías/filas, Task 5) TODAVÍA no están construidos.
 *
 * Por eso el archivo está armado como UNA SECCIÓN POR ÁREA DEL KIT — cuando
 * Avisos y "Todos tus fijos" aterricen, se agregan acá como secciones
 * nuevas (mismo patrón: PreviewLabel + PreviewPhoneSection claro/oscuro, con
 * su propio ciclador si el área tiene estados) sin reescribir lo que ya hay.
 *
 * Sin chrome de pantalla completa (status bar / nav / home indicator): cada
 * sección es un swatch del área del kit que representa, no una simulación
 * de la pantalla entera — mismo criterio que el preview de la nav bar
 * (redesign-nav-bar-preview-screen.tsx), que tampoco arma una pantalla
 * completa alrededor del componente que muestra.
 */

const CYCLE_LABEL = 'Ciclo 20 jun → 19 jul · día 18'

const HERO_STATES: Array<{ variant: FijosHeroVariant; name: string }> = [
  { variant: 'E1', name: 'al día' },
  { variant: 'E2', name: 'en curso' },
  { variant: 'E3', name: 'sin vencidas' },
  { variant: 'E4', name: 'arranque de ciclo' },
  { variant: 'E5', name: 'disponible ajustado' },
  { variant: 'E6', name: 'sin fijos' },
  { variant: 'E7', name: 'cerrado' },
  { variant: 'E8', name: 'fuera de ciclo' },
]

export function RedesignFijosPreviewScreen() {
  const theme = useThemeTokens()
  const [heroIdx, setHeroIdx] = useState(0)
  const heroState = HERO_STATES[heroIdx] ?? HERO_STATES[0]
  const goPrev = () => setHeroIdx((i) => (i - 1 + HERO_STATES.length) % HERO_STATES.length)
  const goNext = () => setHeroIdx((i) => (i + 1) % HERO_STATES.length)

  return (
    <Screen
      title="Rediseño · Fijos"
      subtitle={
        'Réplica pixel-perfect de design/fijos-2026-07/Fijos Manifiesto.dc.html — header + hero con sus 8 estados. ' +
        'Avisos (ticker + 6 estados) y "Todos tus fijos" (tabs/categorías/filas) todavía no están construidos: se suman ' +
        'acá como secciones nuevas cuando aterricen.'
      }
      canGoBack
    >
      <View style={styles.stack}>
        <PreviewLabel
          title="Header + Hero — tema claro"
          note="estado default (E2 · en curso) · fixtures literales del teléfono claro"
        />
        <FijosSwatch mode="light">
          <FijosHeader mode="light" cycleLabel={CYCLE_LABEL} onToggleDropdown={() => {}} onPressCalendar={() => {}} />
          <View style={fijosHeaderHeroSpacing}>
            <FijosHero mode="light" />
          </View>
        </FijosSwatch>

        <PreviewLabel
          title="Header + Hero — tema oscuro"
          note="mismo estado (E2) · fixtures literales del teléfono oscuro"
        />
        <FijosSwatch mode="dark">
          <FijosHeader mode="dark" cycleLabel={CYCLE_LABEL} onToggleDropdown={() => {}} onPressCalendar={() => {}} />
          <View style={fijosHeaderHeroSpacing}>
            <FijosHero mode="dark" />
          </View>
        </FijosSwatch>

        <PreviewLabel
          title="Hero — 8 estados (E1–E8)"
          note="claro y oscuro juntos, un solo ciclador mueve los dos · comparar contra el canvas “ESTADOS DE LA TARJETA · HERO FIJOS”, card a card"
        />
        <HeroStateCycler
          index={heroIdx}
          total={HERO_STATES.length}
          variant={heroState.variant}
          name={heroState.name}
          onPrev={goPrev}
          onNext={goNext}
        />
        {heroState.variant === 'E7' ? (
          <Callout text='E7 (mockup, no bug de esta réplica): "Pagaste 18 de 16 fijos" y un total que no cierra con los "$1.588.087 pagado" de arriba. Es la fixture literal de Fijos Manifiesto.dc.html — se transcribió tal cual para que el owner la falle acá.' />
        ) : null}
        {heroState.variant === 'E1' ? (
          <Callout text="E1: el Brot se ve más chato que en el mockup. El diseño lo envuelve en un filter: drop-shadow() de CSS que React Native no soporta (mismo criterio que onb-5c-hogar.tsx) — la ausencia solo quita brillo, no cambia el dibujo." />
        ) : null}
        <FijosSwatch mode="light">
          <FijosHero key={`light-${heroState.variant}`} mode="light" variant={heroState.variant} />
        </FijosSwatch>
        <FijosSwatch mode="dark">
          <FijosHero key={`dark-${heroState.variant}`} mode="dark" variant={heroState.variant} />
        </FijosSwatch>

        <Text style={[styles.scopeFooter, { color: theme.colors.textMuted }]}>
          {'— Fin de lo construido — Avisos (A1–A6) y "Todos tus fijos" llegan en tareas siguientes del mismo kit —'}
        </Text>
      </View>
    </Screen>
  )
}

/** Envoltorio del swatch: `PreviewPhoneSection` (marco del color de fondo
 *  del teléfono) + el padding de contenido del mockup (`10px 20px 0` en
 *  Fijos Manifiesto.dc.html, mismo valor que usa GastosFinalScreen). */
function FijosSwatch({ mode, children }: PropsWithChildren<{ mode: FijosMode }>) {
  return (
    <PreviewPhoneSection mode={mode}>
      <View style={styles.content}>{children}</View>
    </PreviewPhoneSection>
  )
}

function HeroStateCycler({
  index,
  total,
  variant,
  name,
  onPrev,
  onNext,
}: {
  index: number
  total: number
  variant: FijosHeroVariant
  name: string
  onPrev: () => void
  onNext: () => void
}) {
  const theme = useThemeTokens()
  return (
    <View style={styles.cyclerRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Estado anterior del hero"
        hitSlop={10}
        onPress={onPrev}
        style={[styles.cyclerBtn, { borderColor: theme.colors.border }]}
      >
        <Text style={[styles.cyclerBtnText, { color: theme.colors.text }]}>‹</Text>
      </Pressable>
      <Text style={[styles.cyclerLabel, { color: theme.colors.text }]}>
        {variant} · {name}{' '}
        <Text style={[styles.cyclerLabelCount, { color: theme.colors.textMuted }]}>
          ({index + 1}/{total})
        </Text>
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Estado siguiente del hero"
        hitSlop={10}
        onPress={onNext}
        style={[styles.cyclerBtn, { borderColor: theme.colors.border }]}
      >
        <Text style={[styles.cyclerBtnText, { color: theme.colors.text }]}>›</Text>
      </Pressable>
    </View>
  )
}

/** Nota de contexto para lo que el owner "no debe sorprenderse" al verlo —
 *  se muestra solo mientras esa tarjeta puntual está en pantalla, así se
 *  lee mirando la cosa. */
function Callout({ text }: { text: string }) {
  const theme = useThemeTokens()
  return (
    <View style={[styles.callout, { borderColor: theme.colors.warning }]}>
      <Text style={[styles.calloutText, { color: theme.colors.warning }]}>{`⚠ ${text}`}</Text>
    </View>
  )
}

function PreviewLabel({ title, note }: { title: string; note: string }) {
  const theme = useThemeTokens()
  return (
    <View style={styles.labelBlock}>
      <Text style={[styles.labelTitle, { color: theme.colors.text }]}>{title}</Text>
      <Text style={[styles.labelSource, { color: theme.colors.textMuted }]}>
        Fuente: design/fijos-2026-07/Fijos Manifiesto.dc.html · {note}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  stack: {
    paddingBottom: 40,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
  },
  labelBlock: {
    gap: 2,
    marginTop: 18,
    marginBottom: 10,
  },
  labelTitle: {
    fontSize: 15,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  labelSource: {
    fontSize: 11.5,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
  },
  cyclerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginBottom: 12,
  },
  cyclerBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cyclerBtnText: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  cyclerLabel: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    textAlign: 'center',
  },
  cyclerLabelCount: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
  callout: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  calloutText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    lineHeight: 17,
  },
  scopeFooter: {
    marginTop: 24,
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    textAlign: 'center',
  },
})
