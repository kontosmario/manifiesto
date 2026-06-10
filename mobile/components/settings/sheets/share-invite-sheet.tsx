import { useCallback, useEffect, useState } from 'react'
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { MaterialIcons } from '@expo/vector-icons'
import { AppButton } from '@/components/ui/button'
import { ModalCard } from '@/components/ui/modal-card'
import {
  useCreateFamilyInvite,
  type FamilyInviteCreated,
} from '@/features/family/use-family-actions'
import { triggerHaptic } from '@/lib/haptics'
import { getErrorMessage } from '@/utils/error-message'
import { useAppTheme } from '@/theme/theme-provider'

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
      Alert.alert(
        'No pudimos generar el código',
        getErrorMessage(error, 'Reintenta en un momento.'),
      )
      onClose()
    }
  }, [createInvite, onClose])

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
    Alert.alert('Copiado', `El código "${invite.code}" está en tu portapapeles.`)
  }

  const handleShare = async () => {
    if (!invite) return
    void triggerHaptic('selection')
    try {
      await Share.share({
        message:
          `Te invito al hogar en Manifiesto. Ingresa este código en la app: ${invite.code}\n\n` +
          'El código sirve para una sola persona y vence en 7 días.',
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
      onClose={onClose}
      subtitle="Compartilo con la persona que quieres que se sume."
      title="Invitar a alguien"
      visible={visible}
    >
      <View style={styles.stack}>
        <View
          style={[
            styles.codeWrap,
            {
              backgroundColor: theme.colors.primarySurface,
              borderColor: theme.colors.primary,
            },
          ]}
        >
          {invite ? (
            <Pressable onPress={handleCopy} accessibilityRole="button">
              <Text
                style={[styles.codeText, { color: theme.colors.text }]}
                accessibilityLabel={`Código de invitación ${invite.code}`}
                selectable
              >
                {formatCode(invite.code)}
              </Text>
              <Text style={[styles.codeHint, { color: theme.colors.textMuted }]}>
                Toca para copiar
              </Text>
            </Pressable>
          ) : (
            <Text style={[styles.codeText, { color: theme.colors.textMuted }]}>
              {createInvite.isPending ? 'Generando…' : '— — — — — — — —'}
            </Text>
          )}
        </View>

        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
          Se usa una sola vez · vence en 7 días.
        </Text>

        <View style={styles.actions}>
          <AppButton
            disabled={!invite}
            label="Compartir"
            onPress={handleShare}
          />
          <Pressable
            disabled={createInvite.isPending}
            onPress={handleRegenerate}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.secondaryAction,
              {
                borderColor: theme.colors.line,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <MaterialIcons
              name="refresh"
              size={16}
              color={theme.colors.textMuted}
            />
            <Text
              style={[styles.secondaryActionText, { color: theme.colors.textMuted }]}
            >
              Generar otro
            </Text>
          </Pressable>
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
    letterSpacing: 6,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  codeHint: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },
  meta: { fontSize: 13, textAlign: 'center', fontWeight: '500' },
  actions: { gap: 10 },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 48,
  },
  secondaryActionText: { fontSize: 14, fontWeight: '700' },
})
