// mobile/screens/settings/achievements-gallery-screen.tsx
//
// LOGROS — la pantalla de `/settings/achievements` COMPUESTA con el kit del
// rediseño del jardín (`components/redesign/jardin/logros-screen.tsx`) y
// cableada al catálogo real de 18 (T11 · Steps 1–2 del plan
// `docs/superpowers/plans/2026-08-11-jardin-rediseno-integracion.md`).
//
// PATRÓN DEL REPO (el mismo de `neo-gastos-screen.tsx`): la pantalla NO monta
// la `LogrosFinalScreen` del kit —esa vive para el preview del gate, con datos
// sembrados—; monta sus SUB-COMPONENTES (`LogrosResumen`,
// `LogrosSectionHeader`, `LogroRow`) con VMs derivadas de los hooks reales.
// El chrome del mockup (`LogrosHeader`, status bar y home indicator) queda
// afuera: header, back y canvas los pone `<Screen>`. Lo único del header del
// handoff que sí entra es el Brot `zen`, por el `rightSlot` del Screen.
//
// DE DÓNDE SALE CADA DATO
//  · Catálogo + earned → `useAchievements(userId)`. Cero cambios de schema: el
//    otorgamiento sigue siendo 100% server-side (triggers).
//  · Secciones, medallas y progreso → `splitLogros`, el ÚNICO lugar con la
//    regla status → rama de medalla (§5 del plan). Esta pantalla no decide
//    medallas ni barras: recibe el `MedalVM` resuelto y lo pasa a la fila.
//  · `currentStreak` → `useStreak` (family_streaks: el MISMO número con el que
//    el server otorga los `streak_*`).
//  · `cycleNoSpendCount` → `home_snapshot.no_spend_days_this_cycle`, la fuente
//    cycle-scoped canónica (la que ya usa Gastos), no el `markedDaysIso` del
//    streak —capado a 35 días y con otra ventana—. Se pasa `?? null` y NUNCA
//    `?? 0`: con 0 se dibujarían barras "0 de 15" falsas mientras el snapshot
//    carga, y es `null` lo que manda la fila SIN barra.
//    Las tres queries extra (familia, streak, snapshot) son de cache tibio —
//    Home ya las seedeó, y `useStreak` reusa el mismo `expenseQueryKeys.list`
//    que siembra `home_snapshot`—, así que abrir Logros no dispara cascada.
//
// D3 · CLIP DE LAS MEDALLAS: la grilla vieja recortaba el ícono con
// `overflow:'hidden'` en `styles.iconBubble`, y eso guillotina al Brot (su
// tinta sobresale `BROT_INK_BLEED_TOP` unidades de la caja). La grilla se
// retira entera con el rediseño: ahora la medalla la dibuja `<Medal>` (vía
// `LogroRow`), que lleva el clip en un View interno alrededor del ícono y deja
// el disco sin recortar.
//
// Se conservan las tres garantías de la versión anterior: SKELETON mientras
// carga (nunca una pantalla en blanco), `NeoStateBlock` con retry ante error, y
// `BadgeDetailSheet` al tocar una fila — salvo los SECRETOS, que no abren nada
// ni revelan título/cuerpo (lo garantiza `LogroRow`, y acá tampoco se les pasa
// `onPress`).
//
// i18n (T12): título y cuerpo de los 18 códigos salen del bundle
// (`achievementTitle`/`achievementBody`); las etiquetas de sección, el copy de
// la card resumen, los textos tapados de los secretos y la cola del nudge viven
// en `achievements:screen.*` y bajan al kit por props (el kit es
// `@i18n-ignore-file`: conserva el literal del handoff como default para el
// preview del gate).
//
// ④2 · "LOGROS NUEVOS SIN VER": esta pantalla no repite el dot del jardín, pero
// sí lo APAGA — entrar acá es haberlos visto, se haya llegado desde la
// `LogrosAccessCard` o desde Ajustes. Sin esto, abrir Logros desde Ajustes
// dejaría el dot prendido en el jardín para siempre.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { useQueryClient } from '@tanstack/react-query'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { decorativeDurations } from '@/lib/motion/tokens'
import { RiseView } from '@/components/home/animated/rise-view'
import { NeoStateBlock } from '@/components/ui/neo-state-block'
import { Screen } from '@/components/ui/screen'
import { BadgeDetailSheet } from '@/components/achievements/badge-detail-sheet'
import { BrotMascot } from '@/components/brot/brot-mascot'
import {
  LogroRow,
  LogrosResumen,
  LogrosSectionHeader,
  type LogroRowVM as LogroRowKitVM,
  type LogrosResumenVM,
} from '@/components/redesign/jardin/logros-screen'
import { JARDIN_GEOMETRY } from '@/components/redesign/jardin/jardin-spec'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { triggerHaptic } from '@/lib/haptics'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useFamily } from '@/features/family/use-family'
import { useStreak } from '@/features/streaks/use-streak'
import { useHomeSnapshot } from '@/features/home/use-home-snapshot'
import {
  useAchievements,
  type AchievementViewItem,
} from '@/features/achievements/use-achievements'
import { markAchievementsSeen } from '@/features/achievements/use-achievements-seen'
import {
  achievementBody,
  achievementTitle,
} from '@/features/achievements/achievement-tiers'
import {
  splitLogros,
  type LogroRowVM as SplitRow,
  type ProgressSources,
} from '@/features/achievements/achievement-progress'
import { useAppTheme } from '@/theme/theme-provider'
import { neoMaterial, neoTokens } from '@/theme/neo-tokens'
import type { ResolvedThemeMode } from '@/theme/palette'
import { nunitoFamily } from '@/theme/typography'

/**
 * Los dos textos tapados del handoff (`achievements:screen.secretBody1|2`). Se
 * alternan para que las dos filas secretas no se lean como un error de
 * repetición; el kit hace lo mismo con su copia interna (que no exporta).
 */
const SECRET_BODY_KEYS = [
  'achievements:screen.secretBody1',
  'achievements:screen.secretBody2',
] as const

// ─── Geometría del skeleton ────────────────────────────────────────────────
// Las alturas son las del contenido real para que la lista no salte cuando
// llegan los datos: la card resumen (16 + título + 12 + barra 12 + 10 + nudge +
// 15) y la fila (12 + medalla 54 + 12). El radio y el gap son los del kit.
const RESUMEN_SKELETON_HEIGHT = 104
const ROW_SKELETON_HEIGHT = 78
const ROW_RADIUS = 22
const ROW_GAP = 11
const SKELETON_ROWS = 6

/** Brot `zen` del header — el mismo del kit, a la escala del header del Screen. */
const HEADER_BROT = 44

/**
 * Cola del nudge ("te falta poco para X — 2 días"). La unidad depende de la
 * familia del logro: los `no_spend_*` cuentan días en calma, los `streak_*`
 * días seguidos. La pluralización la resuelve i18next (`_one`/`_other`).
 */
function nudgeTailKey(code: string): string {
  return code.startsWith('no_spend_')
    ? 'achievements:screen.nudgeTailCalm'
    : 'achievements:screen.nudgeTailDays'
}

/**
 * Galería de logros — la colección, medalla a medalla.
 *
 * Historia: nació como trophy-case en grilla (2026-06-19, con skeleton para
 * matar la pantalla en blanco); el rediseño del jardín la pasa a la lista de
 * filas del handoff, con secciones, progreso real y secretos.
 */
export function AchievementsGalleryScreen() {
  const { theme } = useAppTheme()
  const mode = theme.mode
  const neo = neoTokens(mode)
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: session } = useAuthSession()
  const userId = session?.user?.id
  const { data: family } = useFamily(userId)
  const familyId = family?.familyId
  const { data, error, isLoading } = useAchievements(userId)
  const streakQuery = useStreak(familyId, userId)
  const snapshotQuery = useHomeSnapshot(userId)
  const [selected, setSelected] = useState<AchievementViewItem | null>(null)

  // ④2 — ver la galería apaga el dot del jardín, venga el usuario de la
  // `LogrosAccessCard` o de Ajustes. Se escribe con el conteo YA cargado: con
  // `data` en `undefined` no hay nada que anclar y el efecto no corre.
  //
  // `isLoading`/`error` en la guarda por la misma razón que en el jardín:
  // `useAchievements` publica el resumen apenas llega el CATÁLOGO, con
  // `earnedCount: 0`, aunque la query de `earned` siga viajando o haya fallado.
  // Marcar "visto" con ese 0 baja la marca de AsyncStorage por debajo de lo que
  // el usuario ya vio, y la próxima visita al jardín anuncia como nuevos todos
  // los logros de la cuenta.
  const earnedCount = data?.earnedCount
  useEffect(() => {
    if (!userId || isLoading || error || earnedCount === undefined) return
    void markAchievementsSeen(userId, earnedCount)
  }, [userId, earnedCount, isLoading, error])

  const handleRetry = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['achievements'] })
  }, [queryClient])

  const handlePressBadge = useCallback((badge: AchievementViewItem) => {
    void triggerHaptic('selection')
    setSelected(badge)
  }, [])

  const handleCloseSheet = useCallback(() => {
    setSelected(null)
  }, [])

  // `no_spend_days_this_cycle` es OPCIONAL en el payload (back-compat con RPCs
  // viejas): ausente ⇒ `null` (fila sin barra), presente y vacío ⇒ 0, que es un
  // conteo REAL. Por eso el `?.length` va antes del `?? null` y nunca hay un
  // `?? 0` en el medio.
  const noSpendDays = snapshotQuery.data?.no_spend_days_this_cycle
  const currentStreak = streakQuery.data?.currentStreak ?? null
  const sources = useMemo<ProgressSources>(
    () => ({
      currentStreak,
      cycleNoSpendCount: noSpendDays?.length ?? null,
    }),
    [currentStreak, noSpendDays],
  )

  const split = useMemo(
    () => (data ? splitLogros<AchievementViewItem>(data.items, sources) : null),
    [data, sources],
  )

  const sections = useMemo(() => {
    if (!split) return null
    const toVM = (row: SplitRow<AchievementViewItem>, secretIndex: number): LogroRowKitVM => {
      const vm: LogroRowKitVM = {
        code: row.code,
        title: achievementTitle(row.code, row.title),
        body: achievementBody(row.code, row.body),
        status: row.status,
        medal: row.medal,
      }
      // La clave se OMITE (no va en `undefined`): es lo que lee la fila para
      // decidir si dibuja barra.
      if (row.progress) vm.progress = row.progress
      if (row.status === 'secret') {
        // Sin `onPress`: un logro tapado no tiene nada que contar.
        vm.secretTitle = t('achievements:screen.secretTitle')
        vm.secretBody = t(SECRET_BODY_KEYS[secretIndex % SECRET_BODY_KEYS.length])
      } else {
        vm.onPress = () => handlePressBadge(row)
      }
      return vm
    }
    return {
      unlocked: split.unlocked.map((row) => toVM(row, 0)),
      inProgress: split.inProgress.map((row) => toVM(row, 0)),
      secret: split.secret.map((row, i) => toVM(row, i)),
    }
  }, [split, handlePressBadge, t])

  const resumen = useMemo<LogrosResumenVM | null>(() => {
    if (!split || !data) return null
    // El conteo del resumen es el de las filas MOSTRADAS (`unlocked`), no el
    // `earnedCount` crudo: si el catálogo desactivara un code ya otorgado, el
    // porcentaje del resumen y la sección se contradirían.
    const nudgeRow = split.nudgeCode
      ? split.inProgress.find((row) => row.code === split.nudgeCode)
      : undefined
    return {
      earnedCount: split.unlocked.length,
      total: data.totalCount,
      nudge: nudgeRow
        ? {
            title: achievementTitle(nudgeRow.code, nudgeRow.title),
            ...(nudgeRow.progress
              ? {
                  tail: t(nudgeTailKey(nudgeRow.code), {
                    count: Math.max(
                      nudgeRow.progress.target - nudgeRow.progress.current,
                      1,
                    ),
                  }),
                }
              : {}),
          }
        : null,
    }
  }, [split, data, t])

  /** Copy fijo de la card resumen (el kit guarda el literal del handoff como
   *  default para el preview del gate). */
  const resumenCopy = useMemo(
    () => ({
      countText: t('achievements:screen.resumenCount', {
        earned: resumen?.earnedCount ?? 0,
        total: resumen?.total ?? 0,
      }),
      completeLead: t('achievements:screen.resumenCompleteLead'),
      completeStrong: t('achievements:screen.resumenCompleteStrong'),
      emptyText: t('achievements:screen.resumenEmpty'),
      nudgeLead: t('achievements:screen.resumenNudgeLead'),
    }),
    [t, resumen?.earnedCount, resumen?.total],
  )

  return (
    <Screen
      backgroundColor={neo.bg}
      titleColor={neo.text}
      title={t('achievements:gallery.title')}
      subtitle={t('achievements:screen.subtitle')}
      canGoBack
      rightSlot={<BrotMascot pose="zen" size={HEADER_BROT} shadow={false} />}
    >
      {error && !data ? (
        <NeoStateBlock
          actionLabel={t('states:errorState.action')}
          description={t('achievements:gallery.errorDescription')}
          icon="error-outline"
          title={t('achievements:gallery.errorTitle')}
          tone="error"
          onAction={handleRetry}
        />
      ) : isLoading || !data || !sections || !resumen ? (
        // `isLoading` entra al gate porque `useAchievements` devuelve `data` en
        // cuanto llega el CATÁLOGO (staleTime 10 min ⇒ casi siempre cacheado)
        // aunque los earned sigan viajando: sin esto la colección entera
        // parpadea bloqueada y después salta a desbloqueada. Con cache tibio
        // `isLoading` ya es false, así que no agrega espera.
        <LogrosSkeleton />
      ) : data.totalCount === 0 ? (
        <Text style={[styles.emptyText, { color: neo.textMuted }]}>
          {t('achievements:gallery.empty')}
        </Text>
      ) : (
        <>
          <RiseView>
            <LogrosResumen mode={mode} vm={resumen} copy={resumenCopy} />
          </RiseView>
          {/* Una entrada por BLOQUE, no 18 filas escalonadas: en devices
              lentos el stagger largo satura el UI thread. */}
          <RiseView delay={90}>
            <LogrosSection
              mode={mode}
              label={t('achievements:screen.sectionUnlocked')}
              rows={sections.unlocked}
            />
            <LogrosSection
              mode={mode}
              label={t('achievements:screen.sectionInProgress')}
              rows={sections.inProgress}
            />
            <LogrosSection
              mode={mode}
              label={t('achievements:screen.sectionSecret')}
              rows={sections.secret}
            />
          </RiseView>
        </>
      )}

      <BadgeDetailSheet badge={selected} onClose={handleCloseSheet} />
    </Screen>
  )
}

// ─── Sección (header + filas) ──────────────────────────────────────────────
function LogrosSection({
  mode,
  label,
  rows,
}: {
  mode: ResolvedThemeMode
  label: string
  rows: LogroRowKitVM[]
}) {
  if (rows.length === 0) return null
  return (
    <>
      <LogrosSectionHeader mode={mode} label={label} count={rows.length} />
      <View style={styles.section}>
        {rows.map((vm) => (
          <LogroRow key={vm.code} mode={mode} vm={vm} />
        ))}
      </View>
    </>
  )
}

// ─── Skeleton de carga (nunca blanco) ──────────────────────────────────────
function LogrosSkeleton() {
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.mode)
  const reduced = useReducedMotion()
  const pulse = useSharedValue(0.6)

  useEffect(() => {
    if (reduced) return
    pulse.value = withRepeat(
      withTiming(1, { duration: decorativeDurations.meterFill }),
      -1,
      true,
    )
  }, [reduced, pulse])

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: reduced ? 0.6 : pulse.value,
  }))
  // Los placeholders son pozos: en Android < 29 la sombra inset se descarta en
  // silencio (ver `inset-shadow-support`) y sin el hairline quedarían en un
  // rectángulo casi del color del fondo.
  const skeletonMaterial = neoMaterial(theme.mode, 'insetSm')
  const flatFallback = {
    borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1,
    borderColor: neo.sheetDivider,
  }

  return (
    <View>
      <Animated.View
        style={[styles.resumenSkeleton, skeletonMaterial, flatFallback, pulseStyle]}
      />
      <View style={styles.skeletonRows}>
        {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
          <Animated.View
            key={i}
            style={[styles.rowSkeleton, skeletonMaterial, flatFallback, pulseStyle]}
          />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // Las filas de una sección; el aire ENTRE secciones lo pone el
  // `LogrosSectionHeader` del kit con su propio margen.
  section: { gap: ROW_GAP },

  // Skeleton — espeja el `marginTop` de la card resumen del kit y el alto real
  // de cada fila, así el contenido no salta al llegar.
  resumenSkeleton: {
    marginTop: 16,
    height: RESUMEN_SKELETON_HEIGHT,
    borderRadius: JARDIN_GEOMETRY.radii.card,
  },
  skeletonRows: {
    marginTop: 21,
    gap: ROW_GAP,
  },
  rowSkeleton: {
    height: ROW_SKELETON_HEIGHT,
    borderRadius: ROW_RADIUS,
  },

  emptyText: {
    fontSize: 14,
    fontWeight: '400',
    fontFamily: nunitoFamily('400'),
    textAlign: 'center',
    paddingVertical: 40,
  },
})
