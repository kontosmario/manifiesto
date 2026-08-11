// @i18n-ignore-file — la réplica/preview usa copy literal del mockup; el
// cableado live pasa strings i18n por props (ver NotifEmptyBody / la neo screen).
import { Fragment, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { Avatar } from '@/components/ui/avatar'
import { AvatarAnimal } from '@/components/ui/avatar-animal'
import { BrotMascot } from '@/components/brot'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { pastelDarkSolid } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import type { NotifCardVM } from './notif-visual'
import { NOTIF_SPEC, pillForSeverityNeo, type NotifMode, type NotifSpec } from './notif-spec'

/**
 * Notificaciones (Turno 6) — piezas del rediseño (aprobado 2026-07-18).
 * `NotifScreen` es el PREVIEW dev (demo, chrome dibujado del mockup); las
 * piezas exportadas (NotifCard, NotifHeader, NotifEmptyBody, chrome) las
 * reusa la pantalla LIVE (neo-notifications-screen) con datos reales.
 *
 * NotifCard es data-driven: recibe un `NotifCardVM` (icono emoji/seed/
 * avatar + tile pastel + título/tiempo/body + severity) — el preview arma
 * VMs demo y la screen live los mapea de FamilyNotification (notif-visual).
 *
 * DESVÍO DEL MOCKUP (owner 2026-07-18): sin swipe "Listo" (el check por
 * ítem es el único gesto). Semilla más grande (60) y centrada.
 */

// ─── SVGs (paths literales del mockup) ───────────────────────────────

function BackChevron({ color }: { color: string }) {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path d="M15 6l-6 6 6 6" stroke={color} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function CheckMark({ color }: { color: string }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12.5l4.5 4.5L19 7.5" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

/**
 * Los pozos del rediseño no llevan borde: la forma la dibuja la sombra inset.
 * En los Android que la descartan (API < 29) el chip de pendientes, el check
 * y el pozo del empty quedan invisibles, así que ahí —y sólo ahí— entra el
 * hairline. En claro además no tienen fill propio, o sea que sin esto no
 * queda NADA en pantalla.
 */
function wellFallback(s: NotifSpec) {
  return SUPPORTS_INSET_SHADOW ? null : { borderWidth: 1, borderColor: s.hairline }
}

// ─── Chrome dibujado (solo preview; la live usa insets reales) ───────

export function NotifStatusBar({ mode }: { mode: NotifMode }) {
  const c = NOTIF_SPEC[mode].chrome
  const heights = [4, 6, 8, 10]
  return (
    <View style={styles.statusBar}>
      <Text style={[styles.statusTime, { color: c }]}>9:41</Text>
      <View style={styles.statusRight}>
        <View style={styles.signalRow}>
          {heights.map((h, i) => (
            <View
              key={i}
              style={{ width: 3, height: h, borderRadius: 1, backgroundColor: c, opacity: i === 3 ? 0.35 : 1 }}
            />
          ))}
        </View>
        <View style={styles.batteryGroup}>
          <View style={[styles.battery, { borderColor: c }]}>
            <View style={{ width: '62%', height: '100%', borderRadius: 1.5, backgroundColor: c }} />
          </View>
          <View style={{ width: 1.5, height: 4, borderRadius: 1, backgroundColor: c }} />
        </View>
      </View>
    </View>
  )
}

export function NotifHomeIndicator({ mode }: { mode: NotifMode }) {
  const c = NOTIF_SPEC[mode].chrome
  return <View style={[styles.homeIndicator, { backgroundColor: c, opacity: mode === 'dark' ? 0.7 : 0.75 }]} />
}

// ─── Header (back + título + Brot idle) ──────────────────────────────

export function NotifHeader({
  mode,
  title,
  withBrot,
  onBack,
  backLabel,
}: {
  mode: NotifMode
  title: string
  withBrot: boolean
  /** Live: back real. Ausente = círculo decorativo (preview). */
  onBack?: () => void
  /** A11y del back (live: t('home:notificationsScreen.back')). */
  backLabel?: string
}) {
  const s = NOTIF_SPEC[mode]
  const circle = (
    <View
      style={[
        styles.backCircle,
        { backgroundColor: s.backBackground, boxShadow: s.backShadow },
        s.backGradientCss ? { experimental_backgroundImage: s.backGradientCss } : null,
      ]}
    >
      <BackChevron color={s.backStroke} />
    </View>
  )
  return (
    <View style={styles.headerRow}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel={backLabel ?? 'Volver'} hitSlop={8} onPress={onBack}>
          {circle}
        </Pressable>
      ) : (
        circle
      )}
      <Text style={[styles.title, { color: s.title }]}>{title}</Text>
      {withBrot ? <BrotMascot pose="idle" size={50} shadow={false} /> : null}
    </View>
  )
}

// ─── Card (data-driven vía NotifCardVM) ──────────────────────────────

export function NotifCard({
  vm,
  mode,
  onMarkRead,
  markReadLabel,
}: {
  vm: NotifCardVM
  mode: NotifMode
  /** Live: check = marcar leído (hard delete). Ausente = estático (preview). */
  onMarkRead?: () => void
  /** A11y del check (live: t('home:notificationFeed.markRead')). */
  markReadLabel?: string
}) {
  const s = NOTIF_SPEC[mode]
  const isAvatar = vm.icon.type === 'avatar'
  const tileBg =
    vm.tileLight === null ? undefined : mode === 'light' ? vm.tileLight : pastelDarkSolid(vm.tileLight)
  const pill = pillForSeverityNeo(vm.severity, mode)

  return (
    <View
      style={[
        styles.card,
        { experimental_backgroundImage: s.cardGradientCss, backgroundColor: s.cardFallback, boxShadow: s.cardShadow },
      ]}
    >
      {/* Icono: emoji/seed sobre tile pastel · avatar del miembro sin tile. */}
      {isAvatar ? (
        <View style={styles.avatarSlot}>
          {vm.icon.type === 'avatar' && vm.icon.slug ? (
            <AvatarAnimal slug={vm.icon.slug} size={42} />
          ) : vm.icon.type === 'avatar' ? (
            <Avatar name={vm.icon.name} color={vm.icon.color} size={42} />
          ) : null}
        </View>
      ) : (
        <View style={[styles.iconTile, vm.icon.type === 'seed' ? styles.iconTileGarden : null, { backgroundColor: tileBg }]}>
          {vm.icon.type === 'seed' ? (
            // Semilla más grande (60) subida al centro (el glifo se dibuja
            // en la mitad inferior de su viewBox) — owner 2026-07-18.
            <View style={styles.gardenSeed}>
              <BrotMascot pose="seed" size={60} shadow={false} animated={false} />
            </View>
          ) : vm.icon.type === 'emoji' ? (
            <Text style={styles.iconEmoji}>{vm.icon.emoji}</Text>
          ) : null}
        </View>
      )}

      <View style={styles.cardText}>
        <View style={styles.cardTitleRow}>
          <Text style={[styles.cardTitle, { color: s.cardTitle }]} numberOfLines={2}>
            {vm.title}
          </Text>
          <Text style={[styles.cardTime, { color: s.cardTime }]}>{vm.time}</Text>
        </View>
        {vm.body ? (
          <Text style={[styles.cardBody, { color: s.cardBody }]} numberOfLines={3}>
            {vm.body}
          </Text>
        ) : null}
        {pill ? (
          <View style={styles.pillRow}>
            <View style={[styles.pill, { backgroundColor: pill.surface }]}>
              <Text style={[styles.pillLabel, { color: pill.ink }]}>{pill.label}</Text>
            </View>
          </View>
        ) : null}
      </View>

      <NotifCheck mode={mode} onPress={onMarkRead} label={markReadLabel} />
    </View>
  )
}

function NotifCheck({ mode, onPress, label }: { mode: NotifMode; onPress?: () => void; label?: string }) {
  const s = NOTIF_SPEC[mode]
  const inner = (
    <View
      style={[
        styles.checkCircle,
        { backgroundColor: s.checkBackground, boxShadow: s.checkShadow },
        wellFallback(s),
      ]}
    >
      <CheckMark color={s.checkStroke} />
    </View>
  )
  if (!onPress) return inner
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? 'Marcar como leída'}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.9 : 1 }], opacity: pressed ? 0.85 : 1 })}
    >
      {inner}
    </Pressable>
  )
}

// ─── Empty state (7b) ────────────────────────────────────────────────

export function NotifEmptyBody({
  mode,
  title = 'Todo en calma',
  body,
  chipLabel = 'Al día · 0 pendientes',
}: {
  mode: NotifMode
  title?: string
  /** Ausente = copy literal del mockup (2 líneas). */
  body?: ReactNode
  chipLabel?: string
}) {
  const s = NOTIF_SPEC[mode]
  return (
    <View style={styles.emptyBody}>
      <View
        style={[
          styles.emptyOuter,
          { backgroundColor: s.emptyOuterBackground, boxShadow: s.emptyOuterShadow },
          s.emptyOuterGradientCss ? { experimental_backgroundImage: s.emptyOuterGradientCss } : null,
        ]}
      >
        <View
          style={[
            styles.emptyWell,
            { backgroundColor: s.emptyWellBackground, boxShadow: s.emptyWellShadow },
            wellFallback(s),
          ]}
        >
          <BrotMascot pose="zen" size={96} shadow={false} />
        </View>
      </View>
      <Text style={[styles.emptyTitle, { color: s.emptyTitle }]}>{title}</Text>
      <Text style={[styles.emptyText, { color: s.emptyBody }]}>
        {body ?? (
          <>
            No tenés avisos pendientes.{'\n'}Brot te avisa cuando haya algo del hogar.
          </>
        )}
      </Text>
      <View
        style={[
          styles.emptyChip,
          { backgroundColor: s.chipBackground, boxShadow: s.chipShadow },
          wellFallback(s),
        ]}
      >
        <View style={[styles.chipDot, { backgroundColor: s.emptyChipDot }]} />
        <Text style={[styles.chipText, { color: s.chipText }]}>{chipLabel}</Text>
      </View>
    </View>
  )
}

// ─── Meta row (chip pendientes + "Marcar todas") ─────────────────────

export function NotifMetaRow({
  mode,
  pendingLabel,
  markAllLabel,
  markAllA11yLabel,
  onMarkAll,
}: {
  mode: NotifMode
  pendingLabel: string
  markAllLabel: string
  /** A11y de "Marcar todas" (live: t('home:notificationsScreen.markAllAccessibility')). */
  markAllA11yLabel?: string
  onMarkAll?: () => void
}) {
  const s = NOTIF_SPEC[mode]
  return (
    <View style={styles.metaRow}>
      <View
        style={[
          styles.chip,
          { backgroundColor: s.chipBackground, boxShadow: s.chipShadow },
          wellFallback(s),
        ]}
      >
        <View style={[styles.chipDot, { backgroundColor: s.chipDot }]} />
        <Text style={[styles.chipText, { color: s.chipText }]}>{pendingLabel}</Text>
      </View>
      {onMarkAll ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={markAllA11yLabel ?? markAllLabel}
          hitSlop={8}
          onPress={onMarkAll}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={[styles.markAll, { color: s.markAll }]}>{markAllLabel}</Text>
        </Pressable>
      ) : (
        <Text style={[styles.markAll, { color: s.markAll }]}>{markAllLabel}</Text>
      )}
    </View>
  )
}

// ─── PREVIEW (demo) ──────────────────────────────────────────────────

// VMs demo del mockup 7a (emoji/seed directos, sin backend).
const DEMO_VMS: NotifCardVM[] = [
  { id: '1', icon: { type: 'emoji', emoji: '🔥' }, tileLight: '#F7E3CF', title: 'Buen día, Mario', time: 'hace 7 h', body: 'Hoy tenés ~$294.697 para gustos. Quedan $1.878.179 del ciclo.', severity: 'info' },
  { id: '2', icon: { type: 'emoji', emoji: '🌙' }, tileLight: '#E6E0F4', title: 'Cierre del día', time: 'ayer 8:00 p. m.', body: 'Día sin gastos registrados. Si fue así, marcalo y sumás un brote.', severity: 'info' },
  { id: '3', icon: { type: 'seed' }, tileLight: '#DDEBDD', title: 'Tu jardín te espera 🌱', time: 'ayer 8:00 p. m.', body: 'Si hoy nadie del hogar registra un movimiento, una semilla guardada cubre el día.', severity: 'info' },
  { id: '4', icon: { type: 'emoji', emoji: '☀️' }, tileLight: '#F2ECC9', title: 'Medio día', time: 'ayer 2:00 p. m.', body: 'Todavía sin gastos hoy. Buen momento para registrar si algo salió.', severity: 'info' },
  { id: '5', icon: { type: 'emoji', emoji: '🔥' }, tileLight: '#F7E3CF', title: 'Buen día, Mario', time: 'ayer 9:00 a. m.', body: 'Hoy tenés ~$277.566 para gustos. Quedan $2.052.963 del ciclo.', severity: 'info' },
  { id: '6', icon: { type: 'emoji', emoji: '🌙' }, tileLight: '#E6E0F4', title: 'Cierre del día', time: '12-jul', body: 'Día sin gastos registrados. Si fue así, marcalo y sumás un brote.', severity: 'info' },
]

export function NotifScreen({ mode, variant }: { mode: NotifMode; variant: 'list' | 'empty' }) {
  const s = NOTIF_SPEC[mode]
  return (
    <View style={[styles.shell, { backgroundColor: s.bg }]}>
      <NotifStatusBar mode={mode} />
      {variant === 'list' ? (
        <ScrollView style={styles.flex} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          <NotifHeader mode={mode} title="Notificaciones" withBrot />
          <NotifMetaRow mode={mode} pendingLabel="9 pendientes" markAllLabel="Marcar todas" />
          {DEMO_VMS.map((vm, i) => (
            <View key={vm.id} style={i === 0 ? styles.firstCard : styles.card12}>
              <NotifCard vm={vm} mode={mode} />
            </View>
          ))}
        </ScrollView>
      ) : (
        <Fragment>
          <View style={styles.emptyHeader}>
            <NotifHeader mode={mode} title="Notificaciones" withBrot={false} />
          </View>
          <NotifEmptyBody mode={mode} />
        </Fragment>
      )}
      <NotifHomeIndicator mode={mode} />
    </View>
  )
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
  flex: { flex: 1 },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 18,
    paddingHorizontal: 28,
    paddingBottom: 4,
  },
  statusTime: { fontSize: 15, fontWeight: '800', fontFamily: nunitoFamily('800') },
  statusRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  signalRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2.5 },
  batteryGroup: { flexDirection: 'row', alignItems: 'center', gap: 1.5 },
  battery: { width: 23, height: 11.5, borderWidth: 1.5, borderRadius: 3.5, padding: 1.5, justifyContent: 'center' },
  homeIndicator: { width: 132, height: 5, borderRadius: 3, alignSelf: 'center', marginTop: 6, marginBottom: 10 },
  listContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  backCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 30, fontWeight: '900', fontFamily: nunitoFamily('900') },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 13 },
  chipDot: { width: 7, height: 7, borderRadius: 3.5 },
  chipText: { fontSize: 12.5, fontWeight: '800', fontFamily: nunitoFamily('800') },
  markAll: { fontSize: 13, fontWeight: '900', fontFamily: nunitoFamily('900') },
  firstCard: { marginTop: 16 },
  card12: { marginTop: 12 },
  card: { flexDirection: 'row', gap: 12, borderRadius: 24, padding: 14 },
  iconTile: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconTileGarden: { alignSelf: 'center', overflow: 'visible' },
  gardenSeed: { transform: [{ translateY: -14 }] },
  avatarSlot: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  iconEmoji: { fontSize: 19 },
  cardText: { flex: 1, minWidth: 0 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  cardTitle: { flexShrink: 1, fontSize: 14.5, fontWeight: '900', fontFamily: nunitoFamily('900') },
  cardTime: { fontSize: 11, fontWeight: '800', fontFamily: nunitoFamily('800') },
  cardBody: { fontSize: 12.5, fontWeight: '700', fontFamily: nunitoFamily('700'), lineHeight: 18, marginTop: 3 },
  pillRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  pillLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', fontFamily: nunitoFamily('800') },
  checkCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  emptyHeader: { paddingHorizontal: 20, paddingTop: 10 },
  emptyBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyOuter: { width: 170, height: 170, borderRadius: 85, alignItems: 'center', justifyContent: 'center' },
  emptyWell: { width: 136, height: 136, borderRadius: 68, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 12 },
  emptyTitle: { fontSize: 22, fontWeight: '900', fontFamily: nunitoFamily('900'), marginTop: 24 },
  emptyText: { fontSize: 13.5, fontWeight: '700', fontFamily: nunitoFamily('700'), lineHeight: 21, textAlign: 'center', marginTop: 8 },
  emptyChip: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 16, paddingVertical: 9, paddingHorizontal: 14, marginTop: 18 },
})
