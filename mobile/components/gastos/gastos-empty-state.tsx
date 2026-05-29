import { StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { AppButton } from '@/components/ui/button'
import { RiseView } from '@/components/home/animated/rise-view'
import { GastosHeroCard } from '@/components/gastos/gastos-hero-card'
import { GastosMonthCalendar } from '@/components/gastos/gastos-month-calendar'
import { GastoRow } from '@/components/gastos/gasto-row'
import { useAppTheme } from '@/theme/theme-provider'

/** Which preview block a render wrapper applies to. Lets the screen map
 *  each preview to the matching guided-tour step (hero / calendar / list)
 *  without this component importing tour internals. */
type GhostSlot = 'hero' | 'calendar' | 'list'

interface GastosEmptyStateProps {
  onAddFirst: () => void
  /**
   * Optional wrapper for each preview block. The screen uses this to
   * wrap the previews in the GASTOS tour's hero/calendar/list targets
   * so the auto-starting tour still has something to highlight on an
   * empty account. When omitted, the previews render unwrapped.
   */
  renderSection?: (slot: GhostSlot, children: React.ReactNode) => React.ReactNode
}

/**
 * Gastos empty / first-run onboarding state.
 *
 * Shown when the account has zero expenses. It:
 *   1. Leads with an intro card explaining what "Gastos" are + a clear
 *      primary CTA to add the first one.
 *   2. Shows previews of the three real sections that will exist once
 *      the user has data — but rendered as the REAL components in their
 *      EMPTY mode (cycle summary hero / month calendar / movement rows),
 *      so the previews share the exact silhouette, chrome and labels of
 *      the live cards.
 *
 * Critical constraint: the previews MUST NOT show fake data. No $0, no
 * fake percentages, no fake categories/dates. Each real component is
 * rendered in its `empty` / `placeholder` mode, which keeps the frame +
 * labels but swaps every value for a neutral "—" / muted dash. The
 * month calendar is the one exception that's legitimately empty without
 * fabricating anything: a real current-cycle grid with no spend marks.
 * All previews are slightly recessed (opacity) and inert so they read
 * as samples, not interactive cards or loading skeletons.
 */
export function GastosEmptyState({ onAddFirst, renderSection }: GastosEmptyStateProps) {
  const { theme } = useAppTheme()

  const cardBg = theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard

  // Honest current-month calendar window for the preview: cycle starts
  // on the 1st of the current month and spans its real day count. This
  // is a genuine calendar (today is genuinely today) with zero spend
  // marks — empty, not fabricated.
  const today = new Date()
  const cycleStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const cycleDays = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const firstWeekdayOffset = (cycleStart.getDay() + 6) % 7

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
              name="receipt-long"
              size={26}
            />
          </View>
          <Text style={[styles.introTitle, { color: theme.colors.text }]}>
            Todavía no cargaste gastos
          </Text>
          <Text style={[styles.introBody, { color: theme.colors.textMuted }]}>
            Acá vas a ver cada movimiento del hogar: cuánto llevás gastado en el
            ciclo, tu cupo diario y el detalle por día. Cargá el primero para
            empezar.
          </Text>
          <View style={styles.introCta}>
            <AppButton
              haptic="light"
              label="Cargar mi primer gasto"
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

      {/* Preview 1 · Resumen del ciclo → real hero in empty mode. */}
      <RiseView delay={180}>
        {wrap(
          'hero',
          <PreviewBlock
            description="Cuánto llevás gastado y tu cupo diario disponible."
            icon="donut-large"
            title="Resumen del ciclo"
          >
            <GastosHeroCard empty />
          </PreviewBlock>,
        )}
      </RiseView>

      {/* Preview 2 · Mapa del mes → real calendar, honestly empty. */}
      <RiseView delay={240}>
        {wrap(
          'calendar',
          <PreviewBlock
            description="Un calendario con tus días de gasto del ciclo."
            icon="calendar-month"
            title="Mapa del mes"
          >
            <GastosMonthCalendar
              empty
              dayMoods={{}}
              todayDay={today.getDate()}
              cycleStart={cycleStart}
              cycleDays={cycleDays}
              firstWeekdayOffset={firstWeekdayOffset}
              selectedDay={null}
              onSelectDay={() => {}}
              onClearDay={() => {}}
            />
          </PreviewBlock>,
        )}
      </RiseView>

      {/* Preview 3 · Tus movimientos → real rows in placeholder mode. */}
      <RiseView delay={300}>
        {wrap(
          'list',
          <PreviewBlock
            description="El detalle por día, con categoría y autor."
            icon="receipt-long"
            title="Tus movimientos"
          >
            <View style={styles.rowsStack}>
              {[0, 1, 2].map((i) => (
                <GastoRow key={i} placeholder />
              ))}
            </View>
          </PreviewBlock>,
        )}
      </RiseView>
    </View>
  )
}

/**
 * Lightweight labeled wrapper for a preview block — an icon + bold
 * mini-title + one-line muted description, then the real component (in
 * its empty mode) below. Keeps the onboarding copy that explains what
 * each section is, without re-drawing any card chrome (the real
 * component owns that now).
 */
function PreviewBlock({
  icon,
  title,
  description,
  children,
}: {
  icon: keyof typeof MaterialIcons.glyphMap
  title: string
  description: string
  children: React.ReactNode
}) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.previewBlock}>
      <View style={styles.previewHeader}>
        <MaterialIcons color={theme.colors.textMuted} name={icon} size={16} />
        <Text style={[styles.previewTitle, { color: theme.colors.text }]}>
          {title}
        </Text>
      </View>
      <Text style={[styles.previewDescription, { color: theme.colors.textMuted }]}>
        {description}
      </Text>
      {children}
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
  previewBlock: { gap: 8 },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 2,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  previewDescription: {
    fontSize: 12.5,
    lineHeight: 18,
    marginLeft: 2,
    marginBottom: 2,
  },
  rowsStack: { gap: 8 },
})
