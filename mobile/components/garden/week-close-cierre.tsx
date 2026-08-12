// mobile/components/garden/week-close-cierre.tsx
//
// CIERRE DE SEMANA (live) — el takeover real, compuesto con la
// `CierreSemanaView` del kit aprobado (`components/redesign/jardin/cierre-screen`)
// y el `CierreVM` armado con los datos del hogar. Task 10 Step 5 del plan
// `docs/superpowers/plans/2026-08-11-jardin-rediseno-integracion.md`.
//
// ─────────────────────────────────────────────────────────────────────
// DECISIONES DE ESTE ARCHIVO
// ─────────────────────────────────────────────────────────────────────
//
//  · VIVE ACÁ Y NO EN LA PANTALLA porque tiene DOS hosts: el
//    `WeekCloseBridge` (auto-disparo 1×/semana, montado fuera del Stack) y la
//    `SemanaPasadaCard` de Mi jardín. El VM es el mismo en los dos; duplicarlo
//    era garantizar que se desincronizaran.
//
//  · `useAchievements` se monta ACÁ, o sea sólo cuando el cierre se muestra:
//    el bridge no puede pagar dos queries en el arranque de la app para una
//    pantalla que aparece una vez por semana. Es la misma query key que usan
//    el jardín y la galería, así que cuando ya está caliente no hay fetch.
//
//  · Takeover absoluto zIndex 999, como la celebración vieja
//    (`week-close-celebration.tsx:253`): el bridge vive FUERA del `Stack`, así
//    que el cierre tiene que taparlo todo por sí mismo. La superficie la
//    pinta la vista del kit (verde full-bleed en la perfecta, `neoTokens.bg`
//    en las neutras), y como es opaca también come los toques de abajo.
//
//  · El chrome DIBUJADO del kit (status bar "9:41" + home indicator) se apaga
//    con `chrome={false}`: en vivo lo dibuja el SO. La vista respeta ahí los
//    insets reales.
//
//  · `unlocked` NO se filtra por variante: un logro que cayó dentro de esa
//    semana es un hecho, y el kit ya le da prioridad sobre el próximo logro y
//    sobre el coach. Lo que sí se gatea es `nextGoal` (sólo en las semanas
//    buenas: en una floja o cortada, apuntar al próximo hito suena a reproche)
//    y el `coach` (sólo floja/cortada).
//
//  · Las stats salen de la racha REAL (`currentStreak`), nunca del literal 0
//    del mock. La variante `cortada` cambia el tile de BROTES por RÉCORD: con
//    0 o 1 brote, "+0 BROTES" es el peor dato posible para abrir.

import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { ConfettiBurst } from '@/components/ui/confetti-burst'
import {
  CierreSemanaView,
  type CierreDayState,
  type CierreDayVM,
  type CierreVM,
} from '@/components/redesign/jardin/cierre-screen'
import { medalForCode, splitLogros } from '@/features/achievements/achievement-progress'
import { achievementBody, achievementTitle } from '@/features/achievements/achievement-tiers'
import { useAchievements } from '@/features/achievements/use-achievements'
import type { GardenData } from '@/features/garden/use-garden'
import { isoDay, resolveDeviceTimezone, type WeekCloseDay } from '@/features/garden/garden-model'
import { triggerHaptic } from '@/lib/haptics'
import { neoParticlePresets } from '@/theme/neo-tokens'
import { useThemeMode } from '@/theme/theme-provider'

const MS_DIA = 86_400_000

/** Confeti del cierre perfecto: el mismo preset que la celebración vieja
 *  (colores pensados para caer sobre el verde del takeover). */
const CONFETTI_COLORS = neoParticlePresets.weekCloseLight.colors

export interface WeekCloseCierreProps {
  /** El jardín al abrir. Se CONGELA en el montaje (ver abajo). */
  garden: GardenData
  userId: string
  /** Cerrar el takeover. El host además marca el cierre como VISTO. */
  onClose: () => void
}

/** Domingo (ISO) de la semana cuyo lunes es `mondayIso`. */
function sundayOf(mondayIso: string): string {
  const monday = Date.parse(`${mondayIso}T00:00:00Z`)
  return new Date(monday + 6 * MS_DIA).toISOString().slice(0, 10)
}

/**
 * Estado del día en la fila del cierre. Orden logged-first, el mismo de
 * `deriveDayRings`/`deriveGardenCells`: la calma gana (es identidad
 * permanente, D4·1), después lo plantado, después el escudo y recién ahí lo
 * perdido.
 *
 * El domingo perdido de una semana CORTADA se dibuja `seed` y no `wilted`:
 * es el día que todavía no cerró el ciclo del hábito y con el que arranca la
 * semana siguiente — la lectura que el handoff eligió para esa variante
 * (HTML:998), y la única de las cuatro que abre con una salida.
 */
function cierreDayState(day: WeekCloseDay, isLastOfCortada: boolean): CierreDayState {
  if (day.calma) return 'calma'
  if (day.registered) return 'logged'
  if (day.recovered) return 'recovered'
  return isLastOfCortada ? 'seed' : 'missed'
}

export function WeekCloseCierre({ garden, userId, onClose }: WeekCloseCierreProps) {
  const mode = useThemeMode().resolvedMode
  const { t } = useTranslation()
  const router = useRouter()
  const achievements = useAchievements(userId)
  const tz = useMemo(() => resolveDeviceTimezone(), [])

  // El cierre recapitula una semana YA CERRADA: nada de lo que muestra puede
  // cambiar mientras está abierto (el takeover tapa la app entera). Congelarlo
  // en el montaje evita que el tick de minuto del jardín —que re-deriva
  // `GardenData` cada 60s— rearme el VM debajo de las animaciones de entrada.
  const [snapshot] = useState(garden)

  const variant = snapshot.weekClose.variant

  useEffect(() => {
    void triggerHaptic(variant === 'perfecta' ? 'success' : 'selection')
  }, [variant])

  const items = achievements.data?.items
  const currentStreak = snapshot.currentStreak

  /** El logro que cayó DENTRO de la semana cerrada (el más reciente si hubo
   *  varios). `earned_at` es un timestamptz: se compara por día LOCAL, el
   *  mismo corte con el que se armó la semana. */
  const unlocked = useMemo<CierreVM['unlocked']>(() => {
    if (!items) return undefined
    const monday = snapshot.weekCloseId
    const sunday = sundayOf(monday)
    let best: { code: string; title: string; body: string; at: string } | null = null
    for (const item of items) {
      if (!item.earned || !item.earned_at) continue
      const day = isoDay(new Date(item.earned_at), tz)
      if (day < monday || day > sunday) continue
      if (best && item.earned_at <= best.at) continue
      best = {
        code: item.code,
        title: achievementTitle(item.code, item.title),
        body: achievementBody(item.code, item.body),
        at: item.earned_at,
      }
    }
    if (!best) return undefined
    return {
      code: best.code,
      title: best.title,
      body: best.body,
      medal: medalForCode(best.code, true),
    }
  }, [items, snapshot.weekCloseId, tz])

  /** Próximo logro = el nudge de `splitLogros`, y sólo si tiene barra (el kit
   *  dibuja `current/target`). Sin fuente confiable, la card no aparece. */
  const nextGoal = useMemo<CierreVM['nextGoal']>(() => {
    if (!items) return undefined
    const split = splitLogros(items, {
      currentStreak,
      // Cycle-scoped: la fuente canónica es `home_snapshot.no_spend_days_this_cycle`
      // (T11). `null` —nunca 0— evita barras "0 de 15" falsas.
      cycleNoSpendCount: null,
    })
    if (!split.nudgeCode) return undefined
    const row = split.inProgress.find((r) => r.code === split.nudgeCode)
    if (!row?.progress) return undefined
    return {
      title: achievementTitle(row.code, row.title),
      current: row.progress.current,
      target: row.progress.target,
    }
  }, [items, currentStreak])

  const vm = useMemo<CierreVM>(() => {
    const wc = snapshot.weekClose
    const cortada = wc.variant === 'cortada'
    const days: CierreDayVM[] = wc.days.map((day, i) => ({
      letter: day.letter,
      state: cierreDayState(day, cortada && i === wc.days.length - 1),
    }))
    const calmDays = wc.days.filter((day) => day.calma).length

    const jardin = { value: String(snapshot.totalDaysLogged), label: t('garden:cierre.statJardin') }
    const record = { value: String(snapshot.longestStreak), label: t('garden:cierre.statRecord') }
    const racha = { value: String(currentStreak), label: t('garden:cierre.statRacha') }
    const brotes = { value: `+${wc.score}`, label: t('garden:cierre.statBrotes') }
    const stats = cortada
      ? [jardin, record, racha]
      : wc.variant === 'perfecta'
        ? [brotes, jardin, record]
        : [brotes, jardin, racha]

    const openLogros = () => {
      onClose()
      router.push('/settings/achievements' as never)
    }

    return {
      variant: wc.variant,
      title: wc.title,
      chipText: t('garden:cierre.chip', { label: wc.label, score: wc.score }),
      days,
      stats,
      calmDays,
      unlocked,
      // El próximo hito sólo se propone en las semanas buenas.
      nextGoal: wc.variant === 'perfecta' || wc.variant === 'buena' ? nextGoal : undefined,
      coach: cortada
        ? t('garden:cierre.coachCortada', {
            record: snapshot.longestStreak,
            garden: snapshot.totalDaysLogged,
          })
        : wc.variant === 'floja'
          ? t('garden:cierre.coachFloja')
          : undefined,
      cta: cortada
        ? {
            text: t('garden:cierre.ctaPlantar'),
            onPress: () => {
              onClose()
              router.push('/(app)/add-expense')
            },
          }
        : {
            text: t(
              wc.variant === 'floja' ? 'garden:cierre.ctaSemana' : 'garden:cierre.ctaSeguir',
            ),
            onPress: onClose,
          },
      secondary: {
        text: t(
          wc.variant === 'perfecta'
            ? 'garden:cierre.linkLogrosTodos'
            : 'garden:cierre.linkLogros',
        ),
        onPress: openLogros,
      },
    }
  }, [snapshot, currentStreak, unlocked, nextGoal, t, router, onClose])

  // Copy fijo de la vista (el variable ya viaja en el VM). El kit tiene el
  // literal del handoff como default para el preview del gate; en vivo va
  // traducido, con la línea de días en calma ya pluralizada acá.
  const copy = useMemo(
    () => ({
      kicker: t('garden:cierre.kicker'),
      unlockedKicker: t('garden:cierre.unlockedKicker'),
      nextKicker: t('garden:cierre.nextKicker'),
      calmDaysText:
        vm.calmDays && vm.calmDays > 0
          ? t('garden:cierre.calmDays', { count: vm.calmDays })
          : undefined,
    }),
    [t, vm.calmDays],
  )

  return (
    <View style={styles.takeover}>
      <CierreSemanaView mode={mode} vm={vm} copy={copy} chrome={false} />
      {/* Confeti sólo en la perfecta, como la celebración vieja. Se auto-anula
          con reduced motion (el componente devuelve null). */}
      {variant === 'perfecta' ? (
        <ConfettiBurst pulseToken={1} originY={120} colors={CONFETTI_COLORS} />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  takeover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
  },
})
