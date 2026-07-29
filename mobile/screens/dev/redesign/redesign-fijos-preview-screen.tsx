// @i18n-ignore-file — tooling dev-only gated por __DEV__.
import { useState, type PropsWithChildren } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Screen } from '@/components/ui/screen'
import { NeoTabBarLive } from '@/components/navigation/neo-tab-bar-live'
import {
  FijosAvisos,
  FijosCategories,
  FijosHeader,
  FijosHero,
  fijosAvisosCategoriesSpacing,
  fijosHeaderHeroSpacing,
  fijosHeroAvisosSpacing,
  type FijosAvisosVariant,
  type FijosHeroVariant,
  type FijosTabKey,
} from '@/components/redesign/fijos/fijos-screen'
import type { FijosMode } from '@/components/redesign/fijos/fijos-spec'
import { PreviewHomeIndicator, PreviewPhoneSection } from '@/screens/dev/redesign/redesign-preview-shared'
import { useThemeTokens } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

/**
 * Preview dev-only de la vista FIJOS del rediseño (design/fijos-2026-07/
 * Fijos Manifiesto.dc.html): réplica pixel-perfect de las 4 áreas del kit
 * — header, hero (8 estados E1–E8), Avisos (6 estados A1–A6) y "Todos tus
 * fijos" (tabs + categorías) —, claro y oscuro, más la nav real
 * (`NeoTabBarLive`, ya aprobada) con `activeTab="fijos"`.
 *
 * HISTORIA — Task 6 del plan docs/superpowers/plans/2026-07-29-fijos-f0-f1.md
 * trajo este preview al frente (antes de las Tasks 4/5) porque el owner no
 * puede aprobar lo que no puede abrir, y la aprobación es lo que destraba
 * el resto: por eso esa entrega cubrió SOLO `FijosHeader` + `FijosHero`.
 * Avisos y "Todos tus fijos" quedaron pendientes de Tasks 4/5 — Task 7
 * (esta) los suma ahora que ambas aterrizaron.
 *
 * Cada área se ve de DOS formas. Primero, "Pantalla completa" (claro y
 * oscuro): header + hero + Avisos + "Todos tus fijos" apilados con sus
 * gaps reales (`fijosHeaderHeroSpacing`/`fijosHeroAvisosSpacing`/
 * `fijosAvisosCategoriesSpacing`), en el estado que dibujan los dos
 * teléfonos de la canvas "FIJOS · LAYOUT NUEVO" del mockup — hero E2,
 * Avisos A1, tab Vencidos activa — para que el ritmo ENTRE áreas también
 * se apruebe, no solo cada área aislada. Después, un ciclador por área con
 * estados (hero 8, Avisos 6, tabs 3): cada uno en su propio swatch
 * claro/oscuro sin el resto de la pantalla alrededor, para cubrir los
 * estados que esos teléfonos no dibujan.
 *
 * La nav es aparte de las 4 áreas del kit (no cicla estados propios):
 * monta la barra real con el home indicator del mockup debajo
 * (`PreviewHomeIndicator`) — ninguna sección de este archivo, ni siquiera
 * esa, dibuja status bar.
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

const AVISOS_STATES: Array<{ variant: FijosAvisosVariant; name: string }> = [
  { variant: 'A1', name: 'con avisos (actual)' },
  { variant: 'A2', name: 'sin aumentos' },
  { variant: 'A3', name: 'nada por pagar' },
  { variant: 'A4', name: 'todo tranquilo' },
  { variant: 'A5', name: 'urgente' },
  { variant: 'A6', name: 'sin fijos' },
]

const TAB_STATES: Array<{ key: FijosTabKey; name: string }> = [
  { key: 'vencidos', name: 'activa por defecto en los 2 teléfonos' },
  { key: 'pendientes', name: 'mismo layout y montos, activa Pendientes' },
  { key: 'pagados', name: 'mismo layout y montos, activa Pagados' },
]

export function RedesignFijosPreviewScreen() {
  const theme = useThemeTokens()
  const [heroIdx, setHeroIdx] = useState(0)
  const heroState = HERO_STATES[heroIdx] ?? HERO_STATES[0]
  const goPrev = () => setHeroIdx((i) => (i - 1 + HERO_STATES.length) % HERO_STATES.length)
  const goNext = () => setHeroIdx((i) => (i + 1) % HERO_STATES.length)

  const [avisosIdx, setAvisosIdx] = useState(0)
  const avisosState = AVISOS_STATES[avisosIdx] ?? AVISOS_STATES[0]
  const goPrevAvisos = () => setAvisosIdx((i) => (i - 1 + AVISOS_STATES.length) % AVISOS_STATES.length)
  const goNextAvisos = () => setAvisosIdx((i) => (i + 1) % AVISOS_STATES.length)

  const [tabIdx, setTabIdx] = useState(0)
  const tabState = TAB_STATES[tabIdx] ?? TAB_STATES[0]
  const goPrevTab = () => setTabIdx((i) => (i - 1 + TAB_STATES.length) % TAB_STATES.length)
  const goNextTab = () => setTabIdx((i) => (i + 1) % TAB_STATES.length)
  const selectTab = (tab: FijosTabKey) => {
    const idx = TAB_STATES.findIndex((t) => t.key === tab)
    if (idx >= 0) setTabIdx(idx)
  }

  return (
    <Screen
      title="Rediseño · Fijos"
      subtitle={
        'Réplica pixel-perfect de design/fijos-2026-07/Fijos Manifiesto.dc.html — header, hero (8 estados), ' +
        'Avisos (6 estados) y "Todos tus fijos" (tabs + categorías), claro y oscuro, más la nav real con ' +
        'activeTab="fijos". Nada cableado a datos reales: son fixtures del mockup.'
      }
      canGoBack
    >
      <View style={styles.stack}>
        <PreviewLabel
          title="Pantalla completa — tema claro"
          note="header + hero (E2) + Avisos (A1) + Todos tus fijos (tab Vencidos) — el estado que dibuja el teléfono claro de “FIJOS · LAYOUT NUEVO”, fixtures literales"
        />
        <FijosSwatch mode="light">
          <FijosHeader mode="light" cycleLabel={CYCLE_LABEL} onToggleDropdown={() => {}} onPressCalendar={() => {}} />
          <View style={fijosHeaderHeroSpacing}>
            <FijosHero mode="light" />
          </View>
          <View style={fijosHeroAvisosSpacing}>
            <FijosAvisos mode="light" />
          </View>
          <View style={fijosAvisosCategoriesSpacing}>
            <FijosCategories mode="light" />
          </View>
        </FijosSwatch>

        <PreviewLabel
          title="Pantalla completa — tema oscuro"
          note="mismo estado (E2 · A1 · Vencidos) · fixtures literales del teléfono oscuro de “FIJOS · LAYOUT NUEVO”"
        />
        <FijosSwatch mode="dark">
          <FijosHeader mode="dark" cycleLabel={CYCLE_LABEL} onToggleDropdown={() => {}} onPressCalendar={() => {}} />
          <View style={fijosHeaderHeroSpacing}>
            <FijosHero mode="dark" />
          </View>
          <View style={fijosHeroAvisosSpacing}>
            <FijosAvisos mode="dark" />
          </View>
          <View style={fijosAvisosCategoriesSpacing}>
            <FijosCategories mode="dark" />
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
        <View style={styles.swatchPairGap}>
          <FijosSwatch mode="light">
            <FijosHero key={`light-${heroState.variant}`} mode="light" variant={heroState.variant} />
          </FijosSwatch>
        </View>
        <FijosSwatch mode="dark">
          <FijosHero key={`dark-${heroState.variant}`} mode="dark" variant={heroState.variant} />
        </FijosSwatch>

        {/* Los gaps hacia Hero/Categorías (fijosHeroAvisosSpacing/
            fijosAvisosCategoriesSpacing) ya se ejercitan arriba, en
            "Pantalla completa". Acá Avisos vuelve a montarse solo, sin nada
            adyacente que tender — mismo criterio que el ciclador E1–E8, que
            tampoco repite fijosHeaderHeroSpacing dentro de su propio
            swatch. */}
        <PreviewLabel
          title="Avisos — 6 estados (A1–A6)"
          note="claro y oscuro juntos, un solo ciclador mueve los dos · A1 es el estado (ACTUAL) que dibujan los 2 teléfonos"
        />
        <HeroStateCycler
          index={avisosIdx}
          total={AVISOS_STATES.length}
          variant={avisosState.variant}
          name={avisosState.name}
          onPrev={goPrevAvisos}
          onNext={goNextAvisos}
        />
        {avisosState.variant === 'A1' || avisosState.variant === 'A3' ? (
          <Callout text='A1/A3 (mockup, no bug de esta réplica): la fila-resumen dice que Disney +, Ecogas y Fútbol Otti suman "$96.400", pero 8.900 + 12.300 + 6.500 = 27.700. Es la fixture literal de Fijos Manifiesto.dc.html — se transcribió tal cual, mismo criterio que el total de E7.' />
        ) : null}
        <View style={styles.swatchPairGap}>
          <FijosSwatch mode="light">
            <FijosAvisos key={`light-${avisosState.variant}`} mode="light" variant={avisosState.variant} />
          </FijosSwatch>
        </View>
        <FijosSwatch mode="dark">
          <FijosAvisos key={`dark-${avisosState.variant}`} mode="dark" variant={avisosState.variant} />
        </FijosSwatch>

        <PreviewLabel
          title="Todos tus fijos — 3 estados de tab (Vencidos/Pendientes/Pagados)"
          note="claro y oscuro juntos, un solo ciclador mueve los dos · categorías y montos vienen de la fixture única (no varían por tab) · los 3 tabs también responden al toque directo"
        />
        <HeroStateCycler
          index={tabIdx}
          total={TAB_STATES.length}
          variant={tabState.key}
          name={tabState.name}
          onPrev={goPrevTab}
          onNext={goNextTab}
        />
        {/* Sin `key` por tab (a diferencia de FijosHero/FijosAvisos arriba):
            `activeTab` solo resalta un tab distinto sobre el MISMO árbol de
            componentes (las 3 filas y los 3 tabs siempre están montados),
            nada estructural que cambie ni un shared value que se pueda
            quedar en un valor viejo — forzar remount acá solo tiraría la
            animación de press de cada tab sin necesidad. */}
        <View style={styles.swatchPairGap}>
          <FijosSwatch mode="light">
            <FijosCategories mode="light" activeTab={tabState.key} onSelectTab={selectTab} />
          </FijosSwatch>
        </View>
        <FijosSwatch mode="dark">
          <FijosCategories mode="dark" activeTab={tabState.key} onSelectTab={selectTab} />
        </FijosSwatch>

        <PreviewLabel
          title="Nav — activeTab “fijos”"
          note="NeoTabBarLive real (aprobada), no se replica el markup — verificación gratis de que la barra se lee bien bajo este fondo"
        />
        <View style={styles.swatchPairGap}>
          <PreviewPhoneSection mode="light" minHeight={230}>
            <NeoTabBarLive mode="light" activeTab="fijos" onPressTab={() => {}} />
            <PreviewHomeIndicator mode="light" />
          </PreviewPhoneSection>
        </View>
        <PreviewPhoneSection mode="dark" minHeight={230}>
          <NeoTabBarLive mode="dark" activeTab="fijos" onPressTab={() => {}} />
          <PreviewHomeIndicator mode="dark" />
        </PreviewPhoneSection>

        <Text style={[styles.scopeFooter, { color: theme.colors.textMuted }]}>
          {'— Fin del kit F0+F1: header, hero, Avisos, tabs/categorías y nav — nada cableado a datos reales —'}
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
  // string (no FijosHeroVariant/FijosAvisosVariant/FijosTabKey): este
  // ciclador es genérico — lo reusan también el ciclador de Avisos (A1–A6)
  // y el de tabs (Vencidos/Pendientes/Pagados) sin ensanchar el tipo ni
  // copiar el componente.
  variant: string
  name: string
  onPrev: () => void
  onNext: () => void
}) {
  const theme = useThemeTokens()
  return (
    <View style={styles.cyclerRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Estado anterior"
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
        accessibilityLabel="Estado siguiente"
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
  // Separación entre las dos tarjetas claro/oscuro de un mismo ciclador —
  // pares que comparten UN solo `PreviewLabel` arriba, sin nada entre medio
  // que ya les dé margen (a diferencia de los pares "tema claro"/"tema
  // oscuro" de la primera sección, que tienen su propio `PreviewLabel` cada
  // uno). `PreviewPhoneSection`/`FijosSwatch` no traen margin propio, así
  // que sin esto quedan al ras — bug real que tuvo el par E1–E8 (origen de
  // este estilo) y que un fix round posterior repitió en el par de la nav;
  // Avisos y tabs/categorías lo usan desde el vamos para no repetirlo un
  // tercer par. Envuelve solo la tarjeta/sección clara de cada par para no
  // tocar `FijosSwatch`/`PreviewPhoneSection` (compartidos por más usos) ni
  // `styles.stack`.
  swatchPairGap: {
    marginBottom: 12,
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
