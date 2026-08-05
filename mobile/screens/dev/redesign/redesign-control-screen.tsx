// @i18n-ignore-file — tooling dev-only gateado por __DEV__; copy = fixtures del handoff.
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  CONTROL_SPEC,
  ControlAlcancia,
  ControlComparativa,
  ControlHeader,
  ControlHero,
  ControlPatron,
  ControlReparto,
  ControlTendencia,
  SectionLabel,
  controlHeaderHeroSpacing,
  controlLabelCardSpacing,
  controlSectionSpacing,
  type ControlAlcanciaVariant,
  type ControlComparativaVariant,
  type ControlHeroVariant,
  type ControlMode,
  type ControlPatronVariant,
  type ControlRepartoVariant,
  type ControlTendenciaVariant,
} from '@/components/redesign/control/control-screen'
import { PreviewHomeIndicator, PreviewSectionLabel } from '@/screens/dev/redesign/redesign-preview-shared'
import { useThemeTokens } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

/**
 * Preview dev del kit CONTROL (design_handoff_control, 2026-08-03).
 *
 * Muestra el LAYOUT COMPLETO ensamblado (claro + oscuro, con los mismos
 * spacing exports que usa `NeoControlScreen`) y después las tandas de
 * estados por componente — todas las variantes con sus fixtures
 * literales del handoff, sin datos reales ni auth.
 *
 * OJO EN WEB (feedback_web_preview_no_skia_no_gradients): expo-web no
 * rinde Skia ni `experimental_backgroundImage`, así que Brot aparece
 * como hueco y los gradientes pintan su color sólido de fallback. Sirve
 * para juzgar layout/espaciado/tipografía/sombras; el color de heros,
 * barras y frasco hay que validarlo en device.
 */

const MODES: ControlMode[] = ['light', 'dark']

const HERO_VARIANTS: ControlHeroVariant[] = ['holgado', 'ajustado', 'corto', 'primerCiclo']
const COMPARATIVA_VARIANTS: ControlComparativaVariant[] = ['menos', 'mas', 'igual', 'primerMes']
const TENDENCIA_VARIANTS: ControlTendenciaVariant[] = [
  'cuidado',
  'descendente',
  'alza',
  'sobreCupo',
  'estable',
  'arranca',
  'sinGastos',
]
const PATRON_VARIANTS: ControlPatronVariant[] = ['pico', 'pareja', 'findes', 'pocosDatos']
const REPARTO_VARIANTS: ControlRepartoVariant[] = [
  'sinAhorro',
  'ahorroActivo',
  'fijosAltos',
  'ingresoVariable',
  'sinFijos',
]
const ALCANCIA_VARIANTS: ControlAlcanciaVariant[] = [
  'enMarcha',
  'inactiva',
  'cumplida',
  'arrancando',
  'vacia',
  'sinAporte',
]

/** Frame de 393px (el ancho del teléfono del handoff) sobre el material
 *  del tema, para juzgar cada card sobre el fondo correcto. */
function Frame({ mode, children }: { mode: ControlMode; children: React.ReactNode }) {
  return (
    <View style={[styles.frame, { backgroundColor: CONTROL_SPEC[mode].bg }]}>{children}</View>
  )
}

function VariantCaption({ code, note }: { code: string; note: string }) {
  const theme = useThemeTokens()
  return (
    <View style={styles.caption}>
      <Text style={[styles.captionCode, { color: theme.colors.text }]}>{code}</Text>
      <Text style={[styles.captionNote, { color: theme.colors.textMuted }]}>{note}</Text>
    </View>
  )
}

/** El layout completo, ensamblado con los MISMOS spacing exports que
 *  monta `NeoControlScreen` — así el preview y la vista viva no pueden
 *  divergir en el ritmo vertical. */
function FullLayout({ mode }: { mode: ControlMode }) {
  const s = CONTROL_SPEC[mode]
  return (
    <Frame mode={mode}>
      <View style={styles.page}>
        <ControlHeader mode={mode} />
        <View style={controlHeaderHeroSpacing}>
          <ControlHero mode={mode} variant="holgado" />
        </View>

        <SectionLabel label="COMPARATIVA" spec={s} style={controlSectionSpacing} />
        <View style={controlLabelCardSpacing}>
          <ControlComparativa mode={mode} variant="menos" />
        </View>

        <SectionLabel label="TENDENCIA" spec={s} style={controlSectionSpacing} />
        <View style={controlLabelCardSpacing}>
          <ControlTendencia mode={mode} variant="cuidado" />
        </View>

        <SectionLabel label="HÁBITO" spec={s} style={controlSectionSpacing} />
        <View style={controlLabelCardSpacing}>
          <ControlPatron mode={mode} variant="pico" />
        </View>

        <SectionLabel label="REPARTO" spec={s} style={controlSectionSpacing} />
        <View style={controlLabelCardSpacing}>
          <ControlReparto mode={mode} variant="sinAhorro" />
        </View>

        <SectionLabel label="META" spec={s} style={controlSectionSpacing} />
        <View style={controlLabelCardSpacing}>
          <ControlAlcancia mode={mode} variant="enMarcha" />
        </View>

        <PreviewHomeIndicator mode={mode} />
      </View>
    </Frame>
  )
}

/** Una card suelta dentro del frame (para las tandas de estados). */
function CardSlot({ mode, children }: { mode: ControlMode; children: React.ReactNode }) {
  return (
    <Frame mode={mode}>
      <View style={styles.cardPage}>{children}</View>
    </Frame>
  )
}

export function RedesignControlScreen() {
  const theme = useThemeTokens()
  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      style={{ backgroundColor: theme.colors.background }}
    >
      <PreviewSectionLabel
        title="CONTROL · layout completo"
        source="../../design_handoff_control/Control Manifiesto.dc.html"
      />
      <Text style={[styles.webWarning, { color: theme.colors.textMuted }]}>
        En web no rinden Skia (Brot) ni los gradientes CSS: los heros, las barras y el frasco
        pintan su color sólido de fallback. Validar color en device.
      </Text>

      {MODES.map((mode) => (
        <View key={`layout-${mode}`} style={styles.block}>
          <VariantCaption code={mode === 'light' ? 'TEMA CLARO' : 'TEMA OSCURO'} note="layout ensamblado" />
          <FullLayout mode={mode} />
        </View>
      ))}

      <PreviewSectionLabel title="HERO · estados HC-A/B/C/D" source="tanda del hero" />
      {MODES.map((mode) =>
        HERO_VARIANTS.map((variant) => (
          <View key={`hero-${mode}-${variant}`} style={styles.block}>
            <VariantCaption code={`${variant} · ${mode}`} note="hasta cuándo te alcanza" />
            <CardSlot mode={mode}>
              <ControlHero mode={mode} variant={variant} />
            </CardSlot>
          </View>
        )),
      )}

      <PreviewSectionLabel title="COMPARATIVA · CV-A/B/C/D" source="tanda cómo vas este mes" />
      {MODES.map((mode) =>
        COMPARATIVA_VARIANTS.map((variant) => (
          <View key={`comp-${mode}-${variant}`} style={styles.block}>
            <VariantCaption code={`${variant} · ${mode}`} note="cómo vas este mes" />
            <CardSlot mode={mode}>
              <ControlComparativa mode={mode} variant={variant} />
            </CardSlot>
          </View>
        )),
      )}

      <PreviewSectionLabel title="TENDENCIA · S1–S6 + layout" source="tanda últimos 7 días" />
      {MODES.map((mode) =>
        TENDENCIA_VARIANTS.map((variant) => (
          <View key={`tend-${mode}-${variant}`} style={styles.block}>
            <VariantCaption code={`${variant} · ${mode}`} note="últimos 7 días" />
            <CardSlot mode={mode}>
              <ControlTendencia mode={mode} variant={variant} />
            </CardSlot>
          </View>
        )),
      )}

      <PreviewSectionLabel title="HÁBITO · WP-A/B/C/D" source="tanda patrón semanal" />
      {MODES.map((mode) =>
        PATRON_VARIANTS.map((variant) => (
          <View key={`patron-${mode}-${variant}`} style={styles.block}>
            <VariantCaption code={`${variant} · ${mode}`} note="tu patrón semanal" />
            <CardSlot mode={mode}>
              <ControlPatron mode={mode} variant={variant} />
            </CardSlot>
          </View>
        )),
      )}

      <PreviewSectionLabel title="REPARTO · SD-A/B/C/D" source="tanda tu sueldo en días" />
      {MODES.map((mode) =>
        REPARTO_VARIANTS.map((variant) => (
          <View key={`rep-${mode}-${variant}`} style={styles.block}>
            <VariantCaption code={`${variant} · ${mode}`} note="tu sueldo en días" />
            <CardSlot mode={mode}>
              <ControlReparto mode={mode} variant={variant} />
            </CardSlot>
          </View>
        )),
      )}

      <PreviewSectionLabel title="META · E1–E6 (frasco)" source="tanda alcancía" />
      {MODES.map((mode) =>
        ALCANCIA_VARIANTS.map((variant) => (
          <View key={`alc-${mode}-${variant}`} style={styles.block}>
            <VariantCaption code={`${variant} · ${mode}`} note="mi meta · ahorro" />
            <CardSlot mode={mode}>
              <ControlAlcancia mode={mode} variant={variant} />
            </CardSlot>
          </View>
        )),
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: {
    gap: 18,
    paddingBottom: 96,
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  webWarning: {
    fontFamily: nunitoFamily('600'),
    fontSize: 12,
    lineHeight: 17,
  },
  block: {
    gap: 8,
  },
  frame: {
    alignSelf: 'center',
    borderRadius: 28,
    overflow: 'hidden',
    width: 393,
  },
  // El padding de página del markup (10/20/0) — el mismo que el Screen
  // real aporta vía scrollContent.
  page: {
    paddingBottom: 20,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  cardPage: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  caption: {
    alignSelf: 'center',
    alignItems: 'center',
    gap: 2,
  },
  captionCode: {
    fontFamily: nunitoFamily('900'),
    fontSize: 12,
    letterSpacing: 12 * 0.08,
    textTransform: 'uppercase',
  },
  captionNote: {
    fontFamily: nunitoFamily('600'),
    fontSize: 11,
  },
})
