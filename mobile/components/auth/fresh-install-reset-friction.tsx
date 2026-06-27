// Sprint J · Audit #3 J-Auth3 — fresh-install friction for password reset.
//
// On a fresh install with no PIN and no biometric saved credentials we
// have no second factor we can challenge the user against, so the
// recovery email link becomes a single-factor takeover vector: an
// attacker who briefly accessed the victim's inbox can request the
// link, install the app on their own device, complete the reset, and
// then enroll a PIN to lock the victim out.
//
// The ideal fix is a second confirmation channel (email/SMS the user
// has to acknowledge from a known device). That requires backend work
// out of scope for this sprint.
//
// Intermediate fix (this component): a forced warning interstitial with
// a 10-second countdown before the "Continuar" button activates. It
// doesn't stop an attacker who is patient, but raises the bar enough
// that a casual / opportunistic attacker won't follow through, AND
// gives the legitimate user 10 seconds to read a clear warning that
// explains the impact of the change.
//
// Migration path: when a backend email-confirmation flow exists, replace
// this with a "we sent a verification link to your other email — open
// it to continue" gate.
//
// Sprint L · Audit #5 L-Med3 (2026-06-13) — countdown hardening:
//   1. Previously the countdown used `setInterval` decrementing a
//      tick counter. iOS pauses JS timers when the app is backgrounded,
//      so a user could foreground after a wall-clock minute and still
//      see "5s" remaining — defeating the "force the user to read"
//      rationale. Fix: anchor on `mountedAt` (wall-clock ms) and
//      compute `remaining` from `Date.now() - mountedAt` on each tick.
//   2. Remount (navigating away and back) restarted the countdown.
//      Fix: persist the anchor in SecureStore keyed by `email` (or
//      `code` fallback for resets where email isn't surfaced) so the
//      countdown survives unmount within the reset flow. Cleaned up
//      on `onContinue` so the next reset starts fresh.
//
// Sprint M · Audit #7 M-1 (2026-06-14) — clock-skew bypass:
//   The Sprint L hardening defended FUTURE-dated stored anchors via
//   `parsed <= Date.now()` but did NOT defend FORWARD-jumped current
//   time consuming PAST anchors. Attacker flow: open the screen → anchor
//   `T0` lands in SecureStore → bump device clock forward 1 minute →
//   re-mount → `elapsed = 60s > COUNTDOWN_SECONDS` → CTA immediately
//   enabled. Fix: when rehydrating, if `Date.now() - parsed` exceeds
//   `MAX_REASONABLE_ANCHOR_GAP_MS` (5 min), discard the stored anchor
//   and start fresh. That generous threshold tolerates slow networks,
//   app-switching and legitimate backgrounding, but catches the clock
//   jumps that would otherwise grant a free CTA. Worst case for an
//   attacker is one bypassed countdown per fresh write — not a sustained
//   free pass.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'
import { AppButton } from '@/components/ui/button'
import {
  deletePersistentValue,
  getPersistentValue,
  setPersistentValue,
} from '@/lib/persistent-kv'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

const COUNTDOWN_SECONDS = 10
const SUPPORT_EMAIL = 'soporte@manifiestoapp.com'
const FRICTION_KEY_PREFIX = 'fresh-install-friction-'

/**
 * Sprint M · M-1 (2026-06-14): max delta between a stored anchor and
 * "now" before we treat the anchor as untrustworthy and start fresh.
 * Generous enough to swallow real-world slow networks, app-switching
 * and brief backgrounding, tight enough to catch a forward clock jump
 * that would otherwise instantly satisfy the countdown.
 */
const MAX_REASONABLE_ANCHOR_GAP_MS = 5 * 60 * 1000

interface FreshInstallResetFrictionProps {
  onContinue: () => void
  onCancel: () => void
  /**
   * Identifier the countdown anchor is keyed by in SecureStore. Pass
   * the email being reset when available; otherwise pass a unique
   * per-flow token (e.g. the recovery `code`). Without a key the
   * countdown is in-memory only and resets on unmount — acceptable as
   * a fallback but not the documented behaviour.
   */
  frictionKey?: string | null
}

function computeRemaining(mountedAtMs: number): number {
  const elapsed = Math.floor((Date.now() - mountedAtMs) / 1000)
  return Math.max(0, COUNTDOWN_SECONDS - elapsed)
}

/**
 * Renders the J-Auth3 fresh-install warning interstitial. The
 * `Continuar` button is disabled (and shows a live countdown) for the
 * first `COUNTDOWN_SECONDS` seconds after mount so the user is forced
 * to read the warning. The `Cerrar` button is always enabled.
 */
export function FreshInstallResetFriction({
  onContinue,
  onCancel,
  frictionKey,
}: FreshInstallResetFrictionProps) {
  const { t } = useTranslation()
  const { theme } = useAppTheme()
  // L-Med3: anchor on wall-clock ms, not on tick count, so background
  // time IS counted towards the countdown. `mountedAtRef.current` is
  // initialised synchronously to `Date.now()` and then potentially
  // rewound to a persisted earlier anchor after the SecureStore read
  // resolves (see effect below).
  const mountedAtRef = useRef<number>(Date.now())
  const [remaining, setRemaining] = useState<number>(COUNTDOWN_SECONDS)

  const storageKey = frictionKey
    ? `${FRICTION_KEY_PREFIX}${frictionKey}`
    : null

  // L-Med3: rehydrate the anchor from SecureStore so navigating away
  // and back doesn't reset the countdown. Best-effort; if storage is
  // unavailable we fall back to the in-memory `Date.now()` set above.
  useEffect(() => {
    if (!storageKey) return
    let cancelled = false
    void (async () => {
      try {
        const stored = await getPersistentValue(storageKey)
        const parsed = stored ? Number.parseInt(stored, 10) : NaN
        const now = Date.now()
        // Sprint M · M-1 (2026-06-14): only trust stored anchors that
        // sit in a sane window relative to current wall-clock. Anchors
        // in the future (parsed > now) keep being rejected (Sprint L);
        // anchors more than MAX_REASONABLE_ANCHOR_GAP_MS in the past
        // are now ALSO rejected so a forward clock jump can't consume
        // an old anchor to satisfy the countdown.
        const gap = now - parsed
        if (
          !cancelled &&
          Number.isFinite(parsed) &&
          parsed > 0 &&
          parsed <= now &&
          gap <= MAX_REASONABLE_ANCHOR_GAP_MS
        ) {
          mountedAtRef.current = parsed
          setRemaining(computeRemaining(parsed))
          return
        }
        // No usable stored anchor (missing, future-dated, or stale) —
        // persist the current one for future remounts. Writes are
        // best-effort.
        await setPersistentValue(storageKey, String(mountedAtRef.current))
      } catch {
        // ignore — fallback to in-memory anchor
      }
    })()
    return () => {
      cancelled = true
    }
  }, [storageKey])

  // L-Med3: recompute `remaining` from wall-clock each tick so
  // backgrounded time counts. Stop the interval once we hit zero.
  useEffect(() => {
    if (remaining <= 0) return
    const id = setInterval(() => {
      const next = computeRemaining(mountedAtRef.current)
      setRemaining(next)
    }, 250)
    return () => clearInterval(id)
  }, [remaining])

  const handleEmailSupport = useCallback(() => {
    void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)
  }, [])

  const handleContinue = useCallback(() => {
    // Clean up the anchor so the NEXT reset request starts a fresh
    // 10s countdown. Best-effort — a failed delete doesn't block the
    // user (worst case is a slightly shorter countdown on a re-reset
    // within the same minute, which is fine).
    if (storageKey) {
      void deletePersistentValue(storageKey)
    }
    onContinue()
  }, [onContinue, storageKey])

  const canContinue = remaining <= 0
  const ctaLabel = canContinue
    ? t('auth:freshInstallFriction.continue')
    : t('auth:freshInstallFriction.continueCountdown', { seconds: remaining })

  return (
    <View style={styles.stack}>
      <View
        style={[
          styles.warningCard,
          {
            backgroundColor: theme.colors.surfaceMuted,
            borderColor: theme.colors.danger,
          },
        ]}
      >
        <MaterialIcons color={theme.colors.danger} name="warning-amber" size={28} />
        <View style={styles.cardBody}>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            {t('auth:freshInstallFriction.title')}
          </Text>
          <Text style={[styles.body, { color: theme.colors.textMuted }]}>
            {t('auth:freshInstallFriction.body')}
          </Text>
          <Text
            style={[
              styles.bodyStrong,
              {
                // Light: danger (#C23A2F) daba 4.41 sobre surfaceMuted →
                // accent-700 #973511 = 6.13 AA. Dark: danger (#F06A6A) ya
                // pasa (4.87), se mantiene.
                color: theme.isDark ? theme.colors.danger : '#973511',
              },
            ]}
          >
            {t('auth:freshInstallFriction.bodyStrongPrefix')}{' '}
            <Text
              accessibilityRole="link"
              onPress={handleEmailSupport}
              style={styles.link}
            >
              {SUPPORT_EMAIL}
            </Text>
            .
          </Text>
        </View>
      </View>

      <AppButton
        accessibilityLabel={ctaLabel}
        disabled={!canContinue}
        label={ctaLabel}
        onPress={handleContinue}
        variant="danger"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('auth:freshInstallFriction.closeA11y')}
        onPress={onCancel}
        style={({ pressed }) => [
          styles.cancelLink,
          { opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <Text style={[styles.cancelLabel, { color: theme.colors.textMuted }]}>
          {t('auth:freshInstallFriction.closeWithoutChanging')}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  stack: {
    gap: 16,
  },
  warningCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderRadius: radii.lg,
    borderWidth: 2,
    alignItems: 'flex-start',
  },
  cardBody: {
    flex: 1,
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
  },
  bodyStrong: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  link: {
    textDecorationLine: 'underline',
  },
  cancelLink: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  cancelLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
})
