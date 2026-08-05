// @i18n-ignore-file — kit de rediseño; fixtures literales del markup, el copy real llega por props (i18n vive en el view-model).
import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { BrotMascot, type BrotPose } from '@/components/brot/brot-mascot'
import { CONTROL_SPEC, type ControlMode } from '@/components/redesign/control/control-spec'
import { CtlGlowDot, ScoreRing } from '@/components/redesign/control/control-primitives'
import { nunitoFamily } from '@/theme/typography'

/**
 * ① Header de la vista CONTROL — título + trigger de ciclo + score de
 * salud con Brot asomado. Transcripción del layout final de
 * design_handoff_control (bloque `<!-- LAYOUT-CONTROL -->`, teléfono
 * claro; deltas oscuros = solo tintas, todas ya en CONTROL_SPEC).
 *
 * Qué NO vive acá (lo monta el screen, igual que en Fijos/Gastos):
 *  · el padding de página (`padding:10px 20px 0`) y el wrapper
 *    `ctlRise .5s / delay 0s` de entrada de sección (RiseView);
 *  · el chrome dibujado (status bar / home indicator).
 *
 * SIN mecanismo de variantes: el header no tiene estados en el markup
 * (una sola forma en los dos teléfonos). Igual conserva el split
 * Content + `with…Defaults` del kit para que `<ControlHeader
 * mode="light" />` sin más props reproduzca el header del handoff y el
 * cableado pise campo por campo (dato real, copy traducida).
 *
 * DECISIONES (markup vs RN, resueltas acá):
 *  · Brot va envuelto en `filter:drop-shadow(0 4px 8px
 *    rgba(6,22,12,0.35))` en el markup. Se OMITE: RN no tiene
 *    drop-shadow cross-platform que siga el alfa del dibujo
 *    (`filter.dropShadow` es Android-only en Fabric y `boxShadow` en un
 *    wrapper transparente pintaría una placa rectangular detrás del
 *    muñeco — peor que no tener sombra). Mismo espíritu que el
 *    `shadow={false}` que el propio markup le pasa a Brot.
 *  · El pose de Brot reacciona al score (el layout final lo dibuja
 *    `cool` con 94): la elección es del caller vía `brotPose`, acá solo
 *    vive el default literal del markup.
 */

// ─── Contenido (fixture literal del markup) ───────────────────────────

export interface ControlHeaderContent {
  /** "Control". */
  title: string
  /** "Ciclo 20 jun → 19 jul · día 18". */
  cycleLabel: string
  /** 0–100 — alimenta el anillo Y el número (dashoffset 8.3 del markup
   *  = 138.2 × (1 − 94/100): el score 94 lo reproduce exacto). */
  score: number
  /** Texto que reemplaza al número cuando el score no es computable
   *  (sin días con gasto). Un "0" ahí se lee como "tu salud es pésima"
   *  en vez de "todavía no lo puedo calcular". */
  scoreText?: string
  /** "SALUD". */
  scoreCaption: string
}

export const CONTROL_HEADER_CONTENT: ControlHeaderContent = {
  title: 'Control',
  cycleLabel: 'Ciclo 20 jun → 19 jul · día 18',
  score: 94,
  scoreCaption: 'SALUD',
}

/** Mismo criterio que `withHeroDefaults` de fijos-screen: `??` explícito
 *  campo por campo (un override `0`/`''` real no se confunde con "no
 *  vino" y cada línea es su propio chequeo de tipos). */
export function withHeaderDefaults(d: ControlHeaderContent, p: Partial<ControlHeaderContent>): ControlHeaderContent {
  return {
    title: p.title ?? d.title,
    cycleLabel: p.cycleLabel ?? d.cycleLabel,
    score: p.score ?? d.score,
    scoreText: 'scoreText' in p ? p.scoreText : d.scoreText,
    scoreCaption: p.scoreCaption ?? d.scoreCaption,
  }
}

// ─── Componente ───────────────────────────────────────────────────────

export interface ControlHeaderProps extends Partial<ControlHeaderContent> {
  mode: ControlMode
  /** false = dot sin latido, anillo dibujado directo al valor final y
   *  Brot quieto (reduced motion / perf del cableado real). */
  animated?: boolean
  /** Default 'cool' (literal del markup). Reacciona al score — lo
   *  decide el caller. */
  brotPose?: BrotPose
  /** Con callback, el trigger de ciclo entero se vuelve Pressable
   *  (patrón FijosHeader). */
  onPressCycle?: () => void
  /** Con callback, el anillo del score se vuelve Pressable — es la
   *  entrada al sheet de "Mi meta diaria" que en la vista vieja vivía
   *  en la score pill del header (la única surface equivalente acá). */
  onPressScore?: () => void
  /** A11y del anillo cuando es accionable. */
  scoreA11yLabel?: string
}

export const ControlHeader = memo(function ControlHeader({
  mode,
  animated = true,
  brotPose = 'cool',
  onPressCycle,
  onPressScore,
  scoreA11yLabel,
  ...overrides
}: ControlHeaderProps) {
  const s = CONTROL_SPEC[mode]
  const c = withHeaderDefaults(CONTROL_HEADER_CONTENT, overrides)

  const trigger = (
    <View style={styles.cycTrig}>
      <CtlGlowDot animated={animated} color={s.cycTrigDot} size={7} />
      <Text style={[styles.cycTrigLabel, { color: s.cycTrigInk }]}>{c.cycleLabel}</Text>
      <Text style={[styles.cycCaret, { color: s.cycTrigInk }]}>▾</Text>
    </View>
  )

  return (
    <View style={styles.headerRow}>
      <View style={styles.headerLeft}>
        <Text style={[styles.title, { color: s.headerTitleInk }]}>{c.title}</Text>
        {onPressCycle ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={c.cycleLabel}
            // La fila del trigger mide ~18px (label 12.5 + margin). Mismo
            // cálculo que FijosHeader: 14 la lleva a ~46, el mínimo a11y;
            // arriba solo el título (no accionable) y a la derecha el
            // score (tampoco), así que el slop no roba ningún toque.
            hitSlop={14}
            onPress={onPressCycle}
            style={({ pressed }) => (pressed ? styles.pressedDim : null)}
          >
            {trigger}
          </Pressable>
        ) : (
          trigger
        )}
      </View>
      <View style={styles.scoreWrap}>
        {onPressScore ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={scoreA11yLabel ?? c.scoreCaption}
            hitSlop={8}
            onPress={onPressScore}
            style={({ pressed }) => [styles.scoreBox, pressed ? styles.pressedDim : null]}
          >
            <ScoreRing animated={animated} score={c.score} size={56} spec={s} />
            <View style={styles.scoreOverlay}>
              <Text style={[styles.scoreNumber, { color: s.scoreInk }]}>{c.scoreText ?? String(c.score)}</Text>
              <Text style={[styles.scoreCaptionText, { color: s.scoreCaption }]}>{c.scoreCaption}</Text>
            </View>
          </Pressable>
        ) : (
          <View style={styles.scoreBox}>
            <ScoreRing animated={animated} score={c.score} size={56} spec={s} />
            <View style={styles.scoreOverlay}>
              <Text style={[styles.scoreNumber, { color: s.scoreInk }]}>{c.scoreText ?? String(c.score)}</Text>
              <Text style={[styles.scoreCaptionText, { color: s.scoreCaption }]}>{c.scoreCaption}</Text>
            </View>
          </View>
        )}
        {/* Hermano ABSOLUTO del box del anillo (no hijo): asoma por
            arriba del wrapper sin que nada lo recorte — regla del README
            para todo Brot que se sale de su contenedor. Sin drop-shadow
            (ver docblock). */}
        <View pointerEvents="none" style={styles.brotPerch}>
          <BrotMascot animated={animated} pose={brotPose} shadow={false} size={40} />
        </View>
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  headerRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  headerLeft: { flexShrink: 1, minWidth: 0 },
  // lineHeight con headroom (~1.18×) sobre el fontSize en vez del 1.05
  // del markup: en Nunito 900 un lineHeight ≈ fontSize clippea el
  // ascender en RN (mismo gotcha documentado en fijos-screen y gastos).
  title: { fontFamily: nunitoFamily('900'), fontSize: 30, fontWeight: '900', lineHeight: 36 },
  cycTrig: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 6 },
  cycTrigLabel: { fontFamily: nunitoFamily('800'), fontSize: 12.5, fontWeight: '800' },
  cycCaret: { fontSize: 9, opacity: 0.75 },
  pressedDim: { opacity: 0.65 },
  // `flex:none; margin-top:-2px; padding-right:6px` del markup — el box
  // del anillo queda corrido 6px del borde derecho y Brot se ancla al
  // wrapper CON ese padding (right:-14 desde el borde exterior).
  scoreWrap: { alignItems: 'center', marginTop: -2, paddingRight: 6 },
  scoreBox: { height: 56, width: 56 },
  scoreOverlay: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  // Headroom sobre el line-height:1 del markup, mismo gotcha que title.
  scoreNumber: { fontFamily: nunitoFamily('900'), fontSize: 17, fontWeight: '900', lineHeight: 20 },
  scoreCaptionText: { fontFamily: nunitoFamily('900'), fontSize: 6.5, fontWeight: '900', letterSpacing: 6.5 * 0.12 },
  brotPerch: { position: 'absolute', right: -14, top: -15 },
})
