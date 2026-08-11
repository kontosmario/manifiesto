import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { FijoItem } from '@/features/fijos/fijos-aggregates.model'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

// ── Geometría del marquee ─────────────────────────────────────────
// Constantes hardcodeadas para que el ancho de loop coincida exacto
// con el ancho real del set de items (seamless wrap, sin "jump"
// visible en cada repetición).
//
// 2026-05-31 v2: single-row layout. TICKET_WIDTH 240 (era 250 — un
// toque más compacto). Es CRITICO que este valor coincida con el
// `width` del style `ticket` abajo — el loop seamless del marquee
// usa esta constante para calcular el wrap.
export const TICKET_WIDTH = 240
export const TICKET_GAP = 8

/**
 * MarqueeTicket — single-row compact layout (iOS list cell-style).
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ●Cochera     $103.500      [EN 5D]           │
 *   └──────────────────────────────────────────────┘
 *
 * Toda la info en UNA fila horizontal:
 *   · categoryDot (6pt) — color de categoría
 *   · nombre (flex 1, truncate) — semibold SF-style
 *   · amount tabular (auto-width) — bold, hero data
 *   · timing pill (auto-width) — chip iOS con bg + hairline border
 *     tintado por urgencia
 *
 * Width: TICKET_WIDTH (240pt) — espacio para nombres largos + amount
 * + pill sin que ninguno se corte.
 */
export function MarqueeTicket({
  item,
  category,
  theme,
}: {
  item: FijoItem
  category?: { id: string; name: string; color: string }
  theme: ReturnType<typeof useAppTheme>['theme']
}) {
  const { t } = useTranslation()
  const diffDays = Math.max(0, item.daysUntilDue)
  const urgent = diffDays <= 2

  const timingText =
    diffDays === 0
      ? t('fijos:marquee.today')
      : diffDays === 1
        ? t('fijos:marquee.tomorrow')
        : t('fijos:marquee.inDays', { days: diffDays })

  const urgentSolid = theme.isDark ? '#F2A78C' : '#B84014'
  const urgentBgRgba = theme.isDark
    ? 'rgba(242,167,140,0.16)'
    : 'rgba(184,64,20,0.10)'
  const urgentBorderRgba = theme.isDark
    ? 'rgba(242,167,140,0.40)'
    : 'rgba(184,64,20,0.28)'

  // Dark: el 0.035 dejaba los tickets sin volumen sobre el card surfaceMuted;
  // subido a 0.06 para que se lean como tarjetas (mismo hue, solo alpha).
  const ticketBg = theme.isDark
    ? 'rgba(255,255,255,0.06)'
    : 'rgba(15,42,30,0.035)'

  const catColor = category?.color ?? theme.colors.peach

  return (
    <View
      style={[
        styles.ticket,
        { backgroundColor: ticketBg, borderColor: theme.colors.line },
      ]}
    >
      <View style={[styles.categoryDot, { backgroundColor: catColor }]} />
      <Text
        style={[styles.ticketName, { color: theme.colors.text }]}
        numberOfLines={1}
      >
        {item.name}
      </Text>
      <Text
        style={[styles.ticketAmount, { color: theme.colors.text }]}
        numberOfLines={1}
      >
        {formatMoney(item.amount)}
      </Text>
      <View
        style={[
          styles.timingPill,
          {
            backgroundColor: urgent
              ? urgentBgRgba
              : theme.isDark
                ? 'rgba(255,255,255,0.08)'
                : 'rgba(15,42,30,0.05)',
            borderColor: urgent ? urgentBorderRgba : theme.colors.line,
          },
        ]}
      >
        <Text
          style={[
            styles.timingPillText,
            { color: urgent ? urgentSolid : theme.colors.textMuted },
          ]}
          numberOfLines={1}
        >
          {timingText}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // ── Ticket — single-row compact, ajustado a tamaño mínimo ──────
  ticket: {
    width: 240,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 7,
    paddingHorizontal: 10,
    gap: 7,
  },
  categoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  ticketName: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    letterSpacing: -0.2,
  },
  ticketAmount: {
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  timingPill: {
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  timingPillText: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    letterSpacing: 0.6,
    fontVariant: ['tabular-nums'],
  },
})
