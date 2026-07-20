import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeOutRight, LinearTransition, ReduceMotion } from 'react-native-reanimated'
import { StatusBar as ExpoStatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  NotifCard,
  NotifEmptyBody,
  NotifHeader,
  NotifMetaRow,
} from '@/components/redesign/notifications/notif-screen'
import { NOTIF_SPEC, type NotifMode } from '@/components/redesign/notifications/notif-spec'
import { notifCardVM, type NotifAuthor, type NotifCardVM } from '@/components/redesign/notifications/notif-visual'
import { useFamilyMembers } from '@/features/family/use-family-members'
import {
  useDeleteAllNotifications,
  useDeleteNotification,
  useFamilyNotifications,
  useFamilyNotificationsRealtime,
  useMarkNotificationsSeen,
  type FamilyNotification,
} from '@/features/notifications/use-notifications'
import { motionDurations, motionStagger } from '@/lib/motion'
import { triggerHaptic } from '@/lib/haptics'
import { nunitoFamily } from '@/theme/typography'
import { useThemeMode } from '@/theme/theme-provider'
import { getErrorMessage } from '@/utils/error-message'

/**
 * Notificaciones LIVE del rediseño (Turno 6 · cableado 2026-07-18).
 *
 * Presenta la vista aprobada (NotifCard / NotifHeader / NotifEmptyBody /
 * NotifMetaRow) sobre los MISMOS hooks y semántica que la pantalla
 * anterior (notifications-screen.tsx, que queda de referencia):
 *   · useFamilyNotifications(familyId, userId, 80) — lista plana, realtime.
 *   · useDeleteNotification — check por ítem = HARD DELETE (marcar leída).
 *   · useDeleteAllNotifications — "Marcar todas" (borra las pendientes).
 *   · useMarkNotificationsSeen — mark-on-open (badge del bell → 0).
 *   · useFamilyMembers — avatar del autor cuando la notif tiene created_by.
 * Los `kind` reales se mapean al vocabulario del rediseño en notif-visual
 * (check-ins por franja → 🔥/☀️/🌙, jardín → Brot seed, autor → avatar,
 * resto → emoji/pastel por grupo). Tap en el cuerpo = inerte (igual que
 * el feed vigente). Chrome live: insets reales + StatusBar del sistema.
 */

export function NeoNotificationsScreen({ userId, familyId }: { userId: string; familyId: string }) {
  const mode = useThemeMode().resolvedMode
  const { t } = useTranslation()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const s = NOTIF_SPEC[mode as NotifMode]

  const notificationsQuery = useFamilyNotifications(familyId, userId, 80)
  const notifications = useMemo(() => notificationsQuery.data ?? [], [notificationsQuery.data])
  const deleteOne = useDeleteNotification(familyId)
  const deleteAll = useDeleteAllNotifications(familyId, userId)
  const markSeen = useMarkNotificationsSeen(familyId, userId)
  const membersQuery = useFamilyMembers(familyId)

  useFamilyNotificationsRealtime(familyId)

  // Mark-on-open (una vez por apertura): abrir el feed = "las viste" → el
  // badge del bell va a 0. Las filas siguen para accionarlas. Transcrito
  // de la pantalla anterior.
  const seenFiredRef = useRef(false)
  useEffect(() => {
    if (seenFiredRef.current || !familyId) return
    seenFiredRef.current = true
    markSeen.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId])

  const memberById = useMemo(() => {
    const map = new Map<string, NotifAuthor>()
    for (const m of membersQuery.data ?? []) {
      map.set(m.id, { name: m.name, color: m.color, avatarSlug: m.avatarSlug })
    }
    return map
  }, [membersQuery.data])

  const vms = useMemo<NotifCardVM[]>(() => {
    const now = new Date()
    return notifications.map((n: FamilyNotification) => {
      const author = n.created_by ? (memberById.get(n.created_by) ?? null) : null
      return notifCardVM(n, author, now)
    })
  }, [notifications, memberById])

  const count = notifications.length
  const hasItems = count > 0

  const handleMarkRead = useCallback(
    (id: string) => {
      void triggerHaptic('selection')
      deleteOne.mutate({ id })
    },
    [deleteOne],
  )

  const handleMarkAll = useCallback(() => {
    if (count === 0) return
    void triggerHaptic('success')
    deleteAll.mutate()
  }, [deleteAll, count])

  const handleBack = useCallback(() => {
    void triggerHaptic('light')
    if (router.canGoBack()) router.back()
    else router.replace('/(app)/(tabs)/home')
  }, [router])

  // Pull-to-refresh: spinner SOLO en refresco iniciado por el usuario. Ligar
  // RefreshControl a `isRefetching` lo dispararía en cada refetch de fondo
  // (mark-on-open invalida la lista, y cada evento realtime también), haciendo
  // parpadear el spinner sin que nadie tire. Flag propio → sin falsos positivos.
  const [pullRefreshing, setPullRefreshing] = useState(false)
  const handleRefresh = useCallback(() => {
    setPullRefreshing(true)
    void notificationsQuery.refetch().finally(() => setPullRefreshing(false))
  }, [notificationsQuery])

  const errorMessage =
    notificationsQuery.isError && count === 0
      ? getErrorMessage(notificationsQuery.error, t('home:notificationsScreen.loadError'))
      : undefined

  // El header vive dentro del viewport de la FlatList, que RECORTA su contenido.
  // La sombra elevada del círculo back (highlight -6/-6 blur 12 ≈ 18dp hacia
  // arriba-izquierda) necesita ese aire DENTRO del scroll content, no en el root
  // (el clip es al origen del contenido). Por eso el room va en listContent.top,
  // y el root solo aplica el inset del sistema. Sin esto la sombra colisiona con
  // el safe area (owner 2026-07-20).
  const topPad = { paddingTop: insets.top }
  const bottomPad = Math.max(insets.bottom, 10)

  // Header (Brot idle + "Marcar todas" solo con pendientes: el empty state
  // aprobado 7b NO muestra el Brot idle, evitando 2 canvas Skia animados).
  const header = (
    <View style={styles.gutter}>
      <NotifHeader
        mode={mode as NotifMode}
        title={t('home:notificationsScreen.title')}
        withBrot={hasItems}
        onBack={handleBack}
        backLabel={t('home:notificationsScreen.back')}
      />
      {hasItems ? (
        <NotifMetaRow
          mode={mode as NotifMode}
          pendingLabel={t('home:notificationsScreen.pendingCount', { count })}
          markAllLabel={t('home:notificationsScreen.markAll')}
          markAllA11yLabel={t('home:notificationsScreen.markAllAccessibility')}
          onMarkAll={handleMarkAll}
        />
      ) : null}
    </View>
  )

  const renderItem = useCallback(
    ({ item, index }: { item: NotifCardVM; index: number }) => {
      const staggerDelay = Math.min(index, 8) * motionStagger.listItem
      return (
        <Animated.View
          entering={FadeIn.delay(staggerDelay).duration(motionDurations.enterTab).reduceMotion(ReduceMotion.System)}
          exiting={FadeOutRight.duration(220).reduceMotion(ReduceMotion.System)}
          layout={LinearTransition.springify().damping(22).stiffness(190).mass(0.6).reduceMotion(ReduceMotion.System)}
          style={[styles.gutter, index === 0 ? styles.firstItem : styles.item]}
        >
          <NotifCard
            vm={item}
            mode={mode as NotifMode}
            onMarkRead={() => handleMarkRead(item.id)}
            markReadLabel={t('home:notificationFeed.markRead')}
          />
        </Animated.View>
      )
    },
    [mode, handleMarkRead, t],
  )

  // Estado sin ítems: loading inicial · error sin datos · calma (7b). Va en
  // ListEmptyComponent para que pull-to-refresh y la animación de salida del
  // último ítem funcionen (una sola FlatList, sin ramas que desmontan).
  const renderEmpty = useCallback(() => {
    if (notificationsQuery.isLoading) {
      return (
        <View style={styles.centerState}>
          <ActivityIndicator color={s.markAll} />
          <Text style={[styles.stateText, { color: s.cardBody }]}>{t('home:notificationFeed.loading')}</Text>
        </View>
      )
    }
    if (errorMessage) {
      return (
        <View style={styles.centerState}>
          <Text style={[styles.stateTitle, { color: s.title }]}>{t('home:notificationFeed.loadError')}</Text>
          <Text style={[styles.stateText, { color: s.cardBody }]}>{errorMessage}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('home:notificationsHook.retry')}
            hitSlop={8}
            onPress={() => void notificationsQuery.refetch()}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, marginTop: 10 })}
          >
            <Text style={[styles.retry, { color: s.markAll }]}>{t('home:notificationsHook.retry')}</Text>
          </Pressable>
        </View>
      )
    }
    return (
      <NotifEmptyBody
        mode={mode as NotifMode}
        title={t('home:notificationsScreen.calmTitle')}
        body={t('home:notificationsScreen.calmBody')}
        chipLabel={t('home:notificationsScreen.calmChip')}
      />
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, notificationsQuery.isLoading, errorMessage, s])

  return (
    <View style={[styles.root, topPad, { backgroundColor: s.bg }]}>
      <ExpoStatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <FlatList
        data={vms}
        keyExtractor={(vm) => vm.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad + 14 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={pullRefreshing} onRefresh={handleRefresh} tintColor={s.markAll} />
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  gutter: { paddingHorizontal: 20 },
  // flexGrow para que el ListEmptyComponent (flex:1) llene y centre bajo el header.
  // paddingTop = aire para la sombra elevada del círculo back (≈18dp) dentro del
  // viewport que recorta el scroll — si no, colisiona con el safe area.
  listContent: { flexGrow: 1, paddingTop: 20 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20 },
  stateTitle: { fontSize: 17, fontWeight: '900', fontFamily: nunitoFamily('900') },
  stateText: { fontSize: 13, fontWeight: '700', fontFamily: nunitoFamily('700'), textAlign: 'center', lineHeight: 19 },
  retry: { fontSize: 14, fontWeight: '900', fontFamily: nunitoFamily('900') },
  firstItem: { marginTop: 16 },
  item: { marginTop: 12 },
})
