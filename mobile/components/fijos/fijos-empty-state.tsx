import { StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { AppButton } from '@/components/ui/button'
import { RiseView } from '@/components/home/animated/rise-view'
import { useAppTheme } from '@/theme/theme-provider'

/** Which preview ghost a render wrapper applies to. Lets the screen map
 *  each ghost to the matching guided-tour step (hero / calendar / list)
 *  without this component importing tour internals. */
type GhostSlot = 'hero' | 'calendar' | 'list'

interface FijosEmptyStateProps {
  onAddFirst: () => void
  /**
   * Optional wrapper for each ghost preview block. The screen uses this
   * to wrap the ghosts in the FIJOS tour's hero/calendar/list targets so
   * the auto-starting tour still has something to highlight on an empty
   * account. When omitted, the ghosts render unwrapped.
   */
  renderSection?: (slot: GhostSlot, children: React.ReactNode) => React.ReactNode
}

/**
 * Fijos empty / first-run onboarding state.
 *
 * Shown when the account has zero fixed expenses. Instead of rendering
 * the real data cards with zeros (which reads as broken), it:
 *   1. Leads with an intro card explaining what "Fijos" are + a clear
 *      primary CTA to add the first one.
 *   2. Shows three GHOST previews of the sections that will exist once
 *      the user has data (cycle summary / upcoming / per-category).
 *
 * Critical constraint: the ghosts MUST NOT show fake data. No $0, no
 * fake percentages, no fake dates. Each ghost is an inert structural
 * preview — an icon + mini-title + one-line description + a couple of
 * faint placeholder bars (rounded muted Views) that suggest "content
 * goes here". They are intentionally lower-opacity / soft-bordered so
 * they read as previews, NOT as loading skeletons (no shimmer).
 */
export function FijosEmptyState({ onAddFirst, renderSection }: FijosEmptyStateProps) {
  const { theme } = useAppTheme()

  const cardBg = theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard
  // Faint neutral for the inert placeholder bars — low-opacity so the
  // ghost cards never read like real content or a loading shimmer.
  const ghostBar = theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,42,30,0.06)'

  // Identity wrapper when the screen doesn't supply a tour wrapper.
  const wrap = (slot: GhostSlot, children: React.ReactNode) =>
    renderSection ? renderSection(slot, children) : children

  return (
    <View style={styles.stack}>
      {/* ── Intro card (focal hero of the empty state) ─────────────── */}
      <RiseView delay={40}>
        <View
          style={[
            styles.introCard,
            { backgroundColor: cardBg, borderColor: theme.colors.line },
          ]}
        >
          <View
            style={[
              styles.introIconTile,
              { backgroundColor: theme.colors.primarySurface },
            ]}
          >
            <MaterialIcons
              color={theme.colors.primary}
              name="event-repeat"
              size={26}
            />
          </View>
          <Text style={[styles.introTitle, { color: theme.colors.text }]}>
            Todavía no tenés gastos fijos
          </Text>
          <Text style={[styles.introBody, { color: theme.colors.textMuted }]}>
            Acá vas a llevar lo que se paga sí o sí cada mes: alquiler,
            servicios, cuotas y suscripciones. Cargá el primero y te armamos el
            resumen del ciclo.
          </Text>
          <View style={styles.introCta}>
            <AppButton
              haptic="light"
              label="Agregar mi primer fijo"
              onPress={onAddFirst}
              variant="primary"
            />
          </View>
        </View>
      </RiseView>

      {/* ── "Así se va a ver" preview section ──────────────────────── */}
      <RiseView delay={120}>
        <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
          ASÍ SE VA A VER
        </Text>
      </RiseView>

      {/* Ghost 1 · Resumen del ciclo (ghost of the hero). Wider, with a
          short bar pair on the left and a small block on the right to
          echo the hero's two-column "pagado / falta" layout. */}
      <RiseView delay={180}>
        {wrap(
          'hero',
          <GhostCard
            bg={cardBg}
            borderColor={theme.colors.line}
            description="Cuánto llevás pagado y cuánto te queda libre este mes."
            icon="donut-large"
            iconColor={theme.colors.textMuted}
            title="Resumen del ciclo"
          >
            <View style={styles.ghostHeroRow}>
              <View style={styles.ghostHeroCol}>
                <View style={[styles.bar, styles.barShort, { backgroundColor: ghostBar }]} />
                <View style={[styles.bar, styles.barWide, { backgroundColor: ghostBar }]} />
              </View>
              <View style={[styles.ghostHeroBlock, { backgroundColor: ghostBar }]} />
            </View>
          </GhostCard>,
        )}
      </RiseView>

      {/* Ghost 2 · Próximos a pagar (ghost of the upcoming card). Three
          stacked "rows" suggesting a date-ordered list. */}
      <RiseView delay={240}>
        {wrap(
          'calendar',
          <GhostCard
            bg={cardBg}
            borderColor={theme.colors.line}
            description="Los fijos que vencen pronto, ordenados por fecha."
            icon="event-note"
            iconColor={theme.colors.textMuted}
            title="Próximos a pagar"
          >
            <View style={styles.ghostRows}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.ghostRow}>
                  <View style={[styles.ghostDot, { backgroundColor: ghostBar }]} />
                  <View
                    style={[
                      styles.bar,
                      styles.ghostRowBar,
                      // Slightly varied widths so it reads as a list, not a grid.
                      { backgroundColor: ghostBar, flex: i === 1 ? 0.7 : 0.9 },
                    ]}
                  />
                </View>
              ))}
            </View>
          </GhostCard>,
        )}
      </RiseView>

      {/* Ghost 3 · Por categoría (ghost of the category list). Two small
          "category chips" with a bar each, varied from the others. */}
      <RiseView delay={300}>
        {wrap(
          'list',
          <GhostCard
            bg={cardBg}
            borderColor={theme.colors.line}
            description="Tus fijos agrupados por categoría, con su estado."
            icon="category"
            iconColor={theme.colors.textMuted}
            title="Por categoría"
          >
            <View style={styles.ghostChips}>
              {[0, 1].map((i) => (
                <View key={i} style={styles.ghostChip}>
                  <View style={[styles.ghostChipBadge, { backgroundColor: ghostBar }]} />
                  <View style={[styles.bar, styles.ghostChipBar, { backgroundColor: ghostBar }]} />
                </View>
              ))}
            </View>
          </GhostCard>,
        )}
      </RiseView>
    </View>
  )
}

/**
 * Inert ghost preview card. Renders an icon + bold mini-title + one-line
 * muted description, then whatever placeholder geometry the caller
 * passes as `children`. Soft border + lower opacity so it reads as a
 * preview, not a real card and not a loading skeleton.
 */
function GhostCard({
  bg,
  borderColor,
  icon,
  iconColor,
  title,
  description,
  children,
}: {
  bg: string
  borderColor: string
  icon: keyof typeof MaterialIcons.glyphMap
  iconColor: string
  title: string
  description: string
  children: React.ReactNode
}) {
  const { theme } = useAppTheme()
  return (
    <View
      style={[
        styles.ghostCard,
        { backgroundColor: bg, borderColor },
      ]}
    >
      <View style={styles.ghostHeader}>
        <MaterialIcons color={iconColor} name={icon} size={18} />
        <Text style={[styles.ghostTitle, { color: theme.colors.text }]}>
          {title}
        </Text>
      </View>
      <Text style={[styles.ghostDescription, { color: theme.colors.textMuted }]}>
        {description}
      </Text>
      <View style={styles.ghostBody}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 10 },

  // ── Intro card ───────────────────────────────────────────────────
  introCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    alignItems: 'center',
    gap: 12,
  },
  introIconTile: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  introTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  introBody: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  introCta: {
    alignSelf: 'stretch',
    marginTop: 4,
  },

  // ── Preview section ──────────────────────────────────────────────
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginTop: 6,
    marginBottom: 2,
    marginLeft: 4,
  },

  // The ghost cards are intentionally a touch transparent so they sit
  // back from the vibrant real cards / intro card.
  ghostCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 8,
    opacity: 0.86,
  },
  ghostHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ghostTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  ghostDescription: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  ghostBody: {
    marginTop: 6,
  },

  // ── Placeholder bars (inert, no data) ────────────────────────────
  bar: {
    height: 8,
    borderRadius: 4,
  },
  barShort: { width: 56 },
  barWide: { width: 96, marginTop: 6, height: 12 },

  // Ghost 1 — hero echo
  ghostHeroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  ghostHeroCol: {},
  ghostHeroBlock: {
    width: 64,
    height: 26,
    borderRadius: 8,
  },

  // Ghost 2 — upcoming list echo
  ghostRows: { gap: 10 },
  ghostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ghostDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  ghostRowBar: {
    height: 10,
  },

  // Ghost 3 — category chips echo
  ghostChips: {
    flexDirection: 'row',
    gap: 10,
  },
  ghostChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ghostChipBadge: {
    width: 22,
    height: 22,
    borderRadius: 7,
  },
  ghostChipBar: {
    flex: 1,
    height: 10,
  },
})
