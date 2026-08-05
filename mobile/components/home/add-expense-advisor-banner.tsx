// Inline advisor banner for the Add Expense flow.
//
// This is the highest-leverage advisor surface in the app: the
// banner appears at the *moment of decision* — right after the user
// picks a category and before they hit "Agregar". A relevant warning
// here can change behavior, not just inform after the fact.
//
// Two scenarios surface:
//   1. The selected category has a `cap-breach` or `cat-accel`
//      advisor signal → banner with the alert (highest urgency).
//   2. There's a `recovery-hard` / `recovery-soft` signal active —
//      shown regardless of category since today's pace is over cupo.
//
// We only ever render at most one banner (the most urgent), and the
// component returns null when nothing relevant applies.

import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { useWizardSkin } from '@/components/wizard/wizard-skin'
import { motionDurations } from '@/lib/motion'
import { useAppTheme } from '@/theme/theme-provider'
import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'

// Descriptores HOISTEADOS a constantes de módulo (una sola instancia
// compartida). `componentDidUpdate` de Reanimated re-registra EXITING y LAYOUT
// en cada update porque compara por IDENTIDAD (`currentConfig ===
// previousConfig`), y `FadeOut.duration(...)` devuelve una instancia nueva por
// render: construidos inline, cada tecla tipeada en la descripción de abajo
// sumaba dos `createSerializable` + un batch nativo que no cambian nada, en el
// hilo JS y con el teclado inyectando eventos. `entering` sólo se configura en
// `componentDidMount`, pero va hoisteado igual por consistencia.
const BANNER_ENTER = FadeIn.duration(motionDurations.standard).delay(motionDurations.quick)
const BANNER_EXIT = FadeOut.duration(motionDurations.quick)
const BANNER_LAYOUT = LinearTransition.duration(motionDurations.standard)

interface AddExpenseAdvisorBannerProps {
  signals: ControlAdvisorTask[]
  selectedCategoryId: string | null | undefined
  /** Categories the user can pick — needed to map name from id when
   *  matching `cat-dominance-<categoryId>` signals to the selection. */
  categoryNameById: Map<string, string>
}

interface BannerData {
  tone: 'warn' | 'danger'
  icon: keyof typeof MaterialIcons.glyphMap
  title: string
  body: string
}

export function AddExpenseAdvisorBanner({
  signals,
  selectedCategoryId,
  categoryNameById,
}: AddExpenseAdvisorBannerProps) {
  const { theme } = useAppTheme()
  // El único consumidor es el paso 1 del wizard de gasto, que monta el
  // provider: sin rama neo el banner quedaba como un bloque de otro sistema
  // (borde de 1px sobre `creamCard`) entre el rail de tiles extruidos y el
  // pozo de descripción. Sin provider el skin cae a `classic` y no cambia.
  const skin = useWizardSkin()
  const neo = skin.kind === 'neo' ? skin : null

  const banner = useMemo<BannerData | null>(() => {
    // 1. Recovery path — today is already over cupo. Always relevant.
    const recovery = signals.find(
      (s) => s.id === 'recovery-hard' || s.id === 'recovery-soft',
    )
    if (recovery) {
      return {
        tone: recovery.id === 'recovery-hard' ? 'danger' : 'warn',
        icon: 'speed',
        title: recovery.title,
        body: recovery.body,
      }
    }

    // 2. Selected category has a cap or accel alert.
    if (selectedCategoryId) {
      const targetName = categoryNameById.get(selectedCategoryId) ?? ''
      // cap-breach signals carry the limit id, but `cat` is the
      // category name; match on cat name.
      const cap = signals.find(
        (s) =>
          s.id.startsWith('cap-') && s.cat === targetName,
      )
      if (cap) {
        return {
          tone: 'danger',
          icon: 'block',
          title: cap.title,
          body: cap.body,
        }
      }
      const accel = signals.find(
        (s) => s.id === 'cat-accel' && s.cat === targetName,
      )
      if (accel) {
        return {
          tone: 'warn',
          icon: 'trending-up',
          title: accel.title,
          body: accel.body,
        }
      }
    }

    return null
  }, [signals, selectedCategoryId, categoryNameById])

  if (!banner) return null

  // En neo los dos tonos comparten el acento clay: la piel del rediseño tiene
  // DOS acentos (verde / clay), y un tercer color para "warn" sería el color
  // fuera del sistema que el owner rechaza. La urgencia la marca el grosor del
  // anillo, no el matiz.
  const accent = neo
    ? neo.add.accentClay
    : banner.tone === 'danger'
      ? theme.colors.danger
      : theme.colors.warning

  return (
    <Animated.View
      // Con delay: el banner es el ÚNICO bloque del paso sin `RiseView` (tiene
      // entrada propia porque aparece y desaparece al cambiar de categoría, no
      // sólo al montar). Sin el retraso quedaba pintado en el frame 0 mientras
      // el rail (130) y la descripción (190) todavía subían, y se leía como
      // algo que no pertenece a la secuencia — justo el elemento que más
      // atención pide. No va envuelto en `RiseView` porque el componente
      // devuelve `null` cuando ninguna señal aplica y el wrapper dejaría una
      // caja vacía sumando el `gap` de la columna.
      entering={BANNER_ENTER}
      exiting={BANNER_EXIT}
      layout={BANNER_LAYOUT}
      style={[
        styles.row,
        { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
        // Mismo material que las cards del paso 2 con anillo clay: el aviso es
        // una superficie del rediseño, no un bloque prestado del sistema
        // viejo. Sin barra de acento — el anillo ya la reemplaza.
        neo
          ? {
              backgroundColor: neo.add.step2Card.background,
              experimental_backgroundImage: neo.add.step2Card.gradientCss,
              boxShadow: neo.add.step2Card.shadow,
              borderRadius: 20,
              borderColor: neo.add.accentClay,
              borderWidth: banner.tone === 'danger' ? 1.5 : 1,
            }
          : null,
      ]}
    >
      {neo ? null : <View style={[styles.accent, { backgroundColor: accent }]} />}
      <MaterialIcons name={banner.icon} size={18} color={accent} />
      <View style={styles.body}>
        <Text
          style={[
            styles.title,
            { color: theme.colors.text },
            neo ? { color: neo.accent('overdue').ink, fontFamily: neo.font('900') } : null,
          ]}
          // SIN `numberOfLines`. Con Texto Grande el título de 13px se cortaba
          // a media palabra y el cuerpo de 11.5 perdía la parte que explica el
          // aviso — justo para el usuario que más necesita leerlo, y en la
          // superficie de mayor palanca del asesor (aparece en el momento de
          // decidir). El banner vive en una columna que crece, así que dejar
          // que envuelva no rompe el layout. Mismo trato que el aviso de ciclo
          // del alta de ingreso, que tampoco limita líneas.
        >
          {banner.title}
        </Text>
        <Text
          style={[
            styles.bodyText,
            { color: theme.colors.textMuted },
            neo ? { color: neo.ink.title, fontFamily: neo.font('700') } : null,
          ]}
        >
          {banner.body}
        </Text>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingLeft: 14,
    paddingRight: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  accent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  bodyText: {
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: '500',
    marginTop: 2,
  },
})
