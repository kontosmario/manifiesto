import type { ReactNode, RefObject } from 'react'
import { StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { RiseView } from '@/components/home/animated/rise-view'
import { useAppTheme } from '@/theme/theme-provider'

interface TabSectionHeaderProps {
  /** Large screen title. Rendered at the shared 34px display scale. */
  title: string
  /** Optional one/two-line description under the title. */
  subtitle?: string
  /** Clamp the subtitle to N lines (Control uses 1). Default: unclamped. */
  subtitleNumberOfLines?: number
  /**
   * Right-aligned affordance (icon buttons, add button, score pill…).
   * The shell only owns its POSITION (top-aligned with the title via
   * `marginTop`, left gap from the text). The content keeps its own
   * size and must NOT add its own top margin.
   */
  right?: ReactNode
  /** Ref forwarded to the right-slot wrapper (used by guided tours). */
  rightRef?: RefObject<View | null>
  /**
   * Extra right margin for affordances whose overflow (badges, halos,
   * pulse rings) would otherwise graze the screen's right gutter.
   */
  rightClearance?: number
  /** Extra content below the subtitle, inside the text column (e.g. a chip). */
  children?: ReactNode
}

/**
 * Shared header skeleton for the main tab screens (Gastos, Fijos,
 * Control). Derived from the Home header so all four read as one
 * family: the same row layout, the same 34px display title, the same
 * subtitle treatment, and the same right-slot vertical alignment.
 *
 * Home keeps its own bespoke greeting header (contextual eyebrow +
 * name) but shares this exact container geometry, so it stays the
 * visual reference without routing through here.
 *
 * Distinct from the two other header primitives:
 *   · `ScreenHeader` (screen-header.tsx) — back-button header for
 *     sub-screens / modal flows.
 *   · `SectionHeader` (section-header.tsx) — smaller title/subtitle
 *     row used inside Settings sub-screens.
 *
 * Structure tokens (single source of truth):
 *   · row: flex-start + space-between + paddingTop 2
 *   · title: 34 / lineHeight 34 / weight 800 / letterSpacing -1.2
 *   · subtitle: 13 / lineHeight 18 / marginTop 6
 *   · right slot: marginTop 14 (aligns the affordance with the title
 *     baseline) + marginLeft 8
 */
export function TabSectionHeader({
  title,
  subtitle,
  subtitleNumberOfLines,
  right,
  rightRef,
  rightClearance = 0,
  children,
}: TabSectionHeaderProps) {
  const { theme } = useAppTheme()
  return (
    <RiseView>
      <View style={styles.row}>
        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[styles.subtitle, { color: theme.colors.textMuted }]}
              numberOfLines={subtitleNumberOfLines}
            >
              {subtitle}
            </Text>
          ) : null}
          {children}
        </View>
        {right ? (
          <View
            ref={rightRef}
            collapsable={false}
            style={[
              styles.rightSlot,
              rightClearance ? ({ marginRight: rightClearance } as ViewStyle) : null,
            ]}
          >
            {right}
          </View>
        ) : null}
      </View>
    </RiseView>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  titleBlock: { flex: 1 },
  title: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1.2,
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  rightSlot: {
    marginTop: 14,
    marginLeft: 8,
  },
})
