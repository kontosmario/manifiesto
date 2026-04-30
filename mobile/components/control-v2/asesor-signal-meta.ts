import type { ComponentProps } from 'react'
import type { MaterialIcons } from '@expo/vector-icons'

type MaterialIconName = ComponentProps<typeof MaterialIcons>['name']

/**
 * Map every advisor signal id to a MaterialIcon. Static ids (e.g.
 * `streak-ok`, `velocity`) match exactly; dynamic ids carry a payload
 * suffix (`zombie-<fixedExpenseId>`, `cap-<cat>-<level>`,
 * `cat-dominance-<cat>`, `member-imbalance-<userId>`,
 * `undetected-sub-<amount>`, `hike-<fixedExpenseId>`) and are matched
 * by prefix.
 *
 * Why MaterialIcons here: emojis on the avatar tile clip against the
 * container's rounded corners and shift baseline by font version
 * across iOS/Android. Vector glyphs scale cleanly, take the state
 * accent color, and never crop. See `TaskAvatar` for usage.
 */

interface SignalEntry {
  /** Exact id match. */
  id?: string
  /** Prefix match (id starts with this string). Cheaper than regex. */
  prefix?: string
  icon: MaterialIconName
}

// Order matters: the first matching entry wins. We declare exact ids
// first, then prefixes (longest first to avoid `cat-` swallowing
// `cat-dominance-`).
const ENTRIES: SignalEntry[] = [
  // Exact-match signals (no payload in id)
  { id: 'stress-week', icon: 'event-busy' },
  { id: 'payday-proximity', icon: 'event-available' },
  { id: 'start-splurge', icon: 'rocket-launch' },
  { id: 'end-acceleration', icon: 'speed' },
  { id: 'recovery-hard', icon: 'gps-fixed' },
  { id: 'recovery-soft', icon: 'compass-calibration' },
  { id: 'velocity', icon: 'speed' },
  { id: 'positive-forecast', icon: 'trending-up' },
  { id: 'cat-accel', icon: 'track-changes' },
  { id: 'cat-win', icon: 'check-circle-outline' },
  { id: 'small-leaks', icon: 'water-drop' },
  { id: 'night-impulse', icon: 'bedtime' },
  { id: 'weekly-pattern', icon: 'calendar-month' },
  { id: 'fijos-ratio', icon: 'balance' },
  { id: 'income-volatility-better', icon: 'trending-up' },
  { id: 'income-volatility-worse', icon: 'trending-down' },
  { id: 'savings-feasibility', icon: 'flag' },
  { id: 'savings-over', icon: 'savings' },
  { id: 'streak-ok', icon: 'local-fire-department' },
  { id: 'income-volatility', icon: 'show-chart' },
  // P1 — atomic awareness
  { id: 'high-single-expense', icon: 'flash-on' },
  { id: 'data-gap-warning', icon: 'history-toggle-off' },
  { id: 'savings-milestone', icon: 'emoji-events' },
  { id: 'cycle-start-projection', icon: 'rule' },
  { id: 'income-missing', icon: 'mark-email-unread' },
  // P1 — forecast
  { id: 'forecast-tomorrow-risk', icon: 'event' },
  { id: 'forecast-storm-week', icon: 'thunderstorm' },
  { id: 'forecast-payday-gap', icon: 'warning-amber' },
  // P1 — super-signals
  { id: 'super-perfect-storm', icon: 'tornado' },
  { id: 'super-savings-momentum', icon: 'rocket-launch' },
  { id: 'super-hidden-drain', icon: 'water-damage' },

  // Prefix-match signals (payload-bearing ids). Order: longer/more
  // specific prefixes BEFORE shorter ones.
  { prefix: 'cat-dominance-', icon: 'pie-chart' },
  { prefix: 'undetected-sub-', icon: 'repeat' },
  { prefix: 'member-imbalance-', icon: 'group' },
  { prefix: 'duplicate-', icon: 'content-copy' },
  { prefix: 'causal-', icon: 'insights' },
  { prefix: 'zombie-', icon: 'block' },
  { prefix: 'hike-', icon: 'bolt' },
  { prefix: 'cap-', icon: 'shield' },
  { prefix: 'cat-', icon: 'pie-chart' },
]

/**
 * Resolve the avatar icon for a given signal id. Falls back to a
 * neutral "lightbulb" so the avatar never renders empty even if a
 * brand-new signal type ships before the map is updated.
 */
export function iconForSignal(id: string): MaterialIconName {
  for (const e of ENTRIES) {
    if (e.id && e.id === id) return e.icon
    if (e.prefix && id.startsWith(e.prefix)) return e.icon
  }
  return 'lightbulb-outline'
}
