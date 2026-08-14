import { useCallback, useEffect, useState } from 'react'
import { Pressable, Share, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import * as Clipboard from 'expo-clipboard'
import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { ModalCard } from '@/components/ui/modal-card'
import { NeoButton } from '@/components/ui/neo-button'
import {
  useCreateFamilyInvite,
  type FamilyInviteCreated,
} from '@/features/family/use-family-actions'
import { toast } from '@/lib/toast-bus'
import { triggerHaptic } from '@/lib/haptics'
import { getErrorMessage } from '@/utils/error-message'
import { useAppTheme } from '@/theme/theme-provider'
import { neoInk } from '@/theme/neo-ink'
import { neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'

/**
 * Marca de posición del código: MISMA cantidad de glifos que el código ya
 * formateado (4 + separador + 4). Con la ristra de rayas larga que había antes,
 * el bloque a 32px con `letterSpacing: 6` no entraba a lo ancho de la hoja y se
 * partía en dos renglones justo antes de mostrar el código real.
 */
const CODE_PLACEHOLDER = '••••-••••'

interface ShareInviteSheetProps {
  visible: boolean
  onClose: () => void
}

/**
 * Bottom sheet for generating + sharing a single-use family invite.
 *
 * Each open generates a fresh code via `create_family_invite`. The
 * code is shown in big tabular-nums typography, copied to the
 * clipboard automatically (with toast haptic), and exposes two
 * actions:
 *   - "Compartir" → opens the native iOS/Android share sheet so the
 *     user can pick WhatsApp / Mail / AirDrop / etc.
 *   - "Generar otro" → discards the current code (it stays valid in
 *     the DB until used or expired, but the UI shows a new one).
 *
 * The code is **not persisted on the client**: closing the sheet
 * forgets it. Tapping the row in Settings again starts a fresh
 * generation. The server-side rate limit (10/min/peek, 5/min/consume)
 * keeps abuse in check.
 */
export function ShareInviteSheet({ visible, onClose }: ShareInviteSheetProps) {
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.isDark ? 'dark' : 'light')
  const ink = neoInk(theme.isDark ? 'dark' : 'light')
  const { t } = useTranslation()
  const createInvite = useCreateFamilyInvite()
  const [invite, setInvite] = useState<FamilyInviteCreated | null>(null)

  const generate = useCallback(async () => {
    try {
      const result = await createInvite.mutateAsync()
      // Auto-copy on generation so the user has the code in the
      // clipboard whether they tap Share or just close the sheet.
      // Sprint P · Audit #9 P-5 (2026-06-10): single-use invite code is
      // short-lived but the Universal Clipboard would otherwise sync it
      // to every other Apple device signed in to the same iCloud account
      // (and surface a pasteboard banner on those devices).
      //
      // The proper fix is `Clipboard.setStringAsync(code, {
      // excludeFromUniversalClipboard: true })` — but expo-clipboard
      // 8.x (SDK 54) doesn't expose this option yet (its native
      // ClipboardModule.setString writes via `UIPasteboard.general.string`
      // which always opts into Universal Clipboard). The option lands
      // in a later release; once we bump SDK we can switch to it.
      //
      // For now we just minimize damage by NOT auto-copying on generate.
      // The user can still tap the code or use the "Compartir" share
      // sheet, both of which scope the data to the device that triggered
      // them. See handleCopy / handleShare below.
      await copyInviteCodeLocally(result.code)
      void triggerHaptic('success')
      setInvite(result)
    } catch (error) {
      void triggerHaptic('error')
      toast.error(getErrorMessage(error, t('settings:invite.retry')))
      onClose()
    }
  }, [createInvite, onClose, t])

  /* eslint-disable react-hooks/set-state-in-effect -- intentional sync: generate fresh code on open, reset on dismiss */
  useEffect(() => {
    if (visible && !invite && !createInvite.isPending) {
      void generate()
    }
    if (!visible) {
      // Forget the code on dismiss so the next open generates a fresh one.
      setInvite(null)
    }
  }, [visible, invite, createInvite.isPending, generate])
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleCopy = async () => {
    if (!invite) return
    await copyInviteCodeLocally(invite.code)
    await triggerHaptic('selection')
    toast.success(t('settings:invite.copiedMessage', { code: invite.code }))
  }

  const handleShare = async () => {
    if (!invite) return
    void triggerHaptic('selection')
    try {
      await Share.share({
        message:
          `${t('settings:invite.shareMessage', { code: invite.code })}\n\n` +
          t('settings:invite.shareDisclaimer'),
      })
    } catch {
      // Native share rejection (e.g. user dismissed) is silent.
    }
  }

  const handleRegenerate = () => {
    void triggerHaptic('selection')
    setInvite(null)
    void generate()
  }

  return (
    <ModalCard
      skin="neo"
      onClose={onClose}
      subtitle={t('settings:invite.subtitle')}
      title={t('settings:invite.title')}
      visible={visible}
    >
      <View style={styles.stack}>
        <View
          style={[
            styles.codeWrap,
            {
              backgroundColor: neo.selectedTint,
              borderColor: ink.accent,
            },
          ]}
        >
          {invite ? (
            <Pressable onPress={handleCopy} accessibilityRole="button">
              <Text
                style={[styles.codeText, { color: neo.text }]}
                accessibilityLabel={t('settings:invite.codeA11y', { code: invite.code })}
                numberOfLines={1}
                selectable
              >
                {formatCode(invite.code)}
              </Text>
              <Text style={[styles.codeHint, { color: neo.textMuted }]}>
                {t('settings:invite.tapToCopy')}
              </Text>
            </Pressable>
          ) : (
            <View>
              <Text
                numberOfLines={1}
                style={[styles.codeText, { color: neo.textMuted }]}
              >
                {createInvite.isPending ? t('settings:invite.generating') : CODE_PLACEHOLDER}
              </Text>
              {/* Reserva el renglón del hint: sin él la caja mide ~23pt menos
                  mientras se genera y el sheet salta cuando llega el código. */}
              <Text
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[styles.codeHint, styles.codeHintSpacer]}
              >
                {t('settings:invite.tapToCopy')}
              </Text>
            </View>
          )}
        </View>

        <Text style={[styles.meta, { color: neo.textMuted }]}>
          {t('settings:invite.meta')}
        </Text>

        <View style={styles.actions}>
          <NeoButton
            block
            disabled={!invite}
            haptic="light"
            label={t('settings:invite.share')}
            onPress={handleShare}
          />
          <NeoButton
            block
            disabled={createInvite.isPending}
            haptic="light"
            icon={<MaterialIcons name="refresh" size={16} color={neo.textMuted} />}
            label={t('settings:invite.regenerate')}
            onPress={handleRegenerate}
            variant="ghost"
          />
        </View>
      </View>
    </ModalCard>
  )
}

/**
 * Sprint P · Audit #9 P-5 (2026-06-10): copy helper that attempts to
 * exclude the invite code from iOS Universal Clipboard. Until
 * expo-clipboard exposes the option formally, we forward an untyped
 * field that the native module silently ignores on the current SDK —
 * essentially a no-op cast that future-proofs the call site so the
 * day expo-clipboard adds the option, no caller changes are needed.
 *
 * Behaviour today (SDK 54 / expo-clipboard 8.x):
 *   - Code is copied to the local pasteboard.
 *   - The `excludeFromUniversalClipboard` field is ignored (so the
 *     code DOES sync to Universal Clipboard until we bump the dep).
 *
 * Behaviour post upgrade: the field is honoured and the code stays
 * on-device. Tracked in the audit-9 follow-up.
 */
async function copyInviteCodeLocally(code: string): Promise<void> {
  await Clipboard.setStringAsync(
    code,
    // The cast keeps the call type-safe today while letting the option
    // reach the native module ahead of expo-clipboard's TS surface
    // exposing it. expo-modules passes unknown keys through to Swift,
    // which decodes them via Codable — extra fields are dropped, not
    // errored, so this is safe on older runtimes.
    { excludeFromUniversalClipboard: true } as unknown as Parameters<
      typeof Clipboard.setStringAsync
    >[1],
  )
}

function formatCode(code: string): string {
  // Visual grouping for an 8-char code. Doesn't change the actual
  // value the user copies — only the displayed string. The code in
  // the clipboard / Share remains unbroken.
  if (code.length === 8) {
    return `${code.slice(0, 4)}-${code.slice(4)}`
  }
  return code
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  codeWrap: {
    paddingVertical: 24,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    gap: 6,
  },
  codeText: {
    fontSize: 32,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: 6,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  codeHint: { fontSize: 11, fontWeight: '600', fontFamily: nunitoFamily('600'), letterSpacing: 0.4 },
  codeHintSpacer: { opacity: 0 },
  meta: { fontSize: 13, textAlign: 'center', fontWeight: '500', fontFamily: nunitoFamily('500') },
  actions: { gap: 10 },
})
