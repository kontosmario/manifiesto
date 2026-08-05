import { useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui/button'
import { ModalCard } from '@/components/ui/modal-card'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { neoInk } from '@/theme/neo-ink'
import { neoTokens } from '@/theme/neo-tokens'

interface DestroyFamilyConfirmSheetProps {
  visible: boolean
  isSubmitting: boolean
  otherActiveMembers: number
  onCancel: () => void
  onConfirm: () => void
  /**
   * `'family'` (default): owner tearing down a shared hogar that still
   * has members — the original flow. `'account'`: a solo user wiping
   * their OWN account to re-onboard from scratch (no members involved).
   * Only the copy + confirm phrase change; the two-step friction is shared.
   */
  mode?: 'family' | 'account'
}

/**
 * Two-step destructive confirmation sheet shown to the OWNER when
 * leaving a family that still has other active members. Step 1 is
 * the warning + "Continuar" CTA; Step 2 requires the user to type
 * the exact phrase "ELIMINAR" before the destructive button enables.
 *
 * The friction is intentional — once the owner confirms, the server
 * tears down the entire family and every surviving member loses
 * access. There is no undo.
 */
export function DestroyFamilyConfirmSheet({
  visible,
  isSubmitting,
  otherActiveMembers,
  onCancel,
  onConfirm,
  mode = 'family',
}: DestroyFamilyConfirmSheetProps) {
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.isDark ? 'dark' : 'light')
  const ink = neoInk(theme.isDark ? 'dark' : 'light')
  const { t } = useTranslation()
  const isAccount = mode === 'account'
  const confirmPhrase = isAccount
    ? t('settings:destroyFamily.phraseAccount')
    : t('settings:destroyFamily.phraseFamily')
  const [step, setStep] = useState<1 | 2>(1)
  const [phrase, setPhrase] = useState('')
  const inputRef = useRef<TextInput | null>(null)

  // Reset to step 1 every time the sheet opens (don't preserve the
  // previous typing state — destructive flows should always start
  // from the warning).
  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset of destructive flow on each open
      setStep(1)
      setPhrase('')
    }
  }, [visible])

  // Auto-focus the confirmation input when entering step 2.
  useEffect(() => {
    if (visible && step === 2) {
      const handle = setTimeout(() => inputRef.current?.focus(), 80)
      return () => clearTimeout(handle)
    }
  }, [visible, step])

  const matches = useMemo(
    () => phrase.trim().toUpperCase() === confirmPhrase,
    [phrase, confirmPhrase],
  )

  const memberLabel = t('settings:destroyFamily.memberCount', { count: otherActiveMembers })

  return (
    <ModalCard
      skin="neo"
      onClose={onCancel}
      subtitle={
        step === 1
          ? isAccount
            ? t('settings:destroyFamily.subtitleAccount')
            : t('settings:destroyFamily.subtitleFamily', { members: memberLabel })
          : t('settings:destroyFamily.subtitleConfirm')
      }
      title={
        step === 1
          ? isAccount
            ? t('settings:destroyFamily.titleAccount')
            : t('settings:destroyFamily.titleFamily')
          : t('settings:destroyFamily.titleConfirm')
      }
      visible={visible}
    >
      {step === 1 ? (
        <View style={styles.stack}>
          <View
            style={[
              styles.warningCard,
              {
                backgroundColor: neo.well,
                boxShadow: neo.shadows.insetSm,
                borderColor: ink.danger,
              },
            ]}
          >
            <View
              style={[
                styles.warningIcon,
                { backgroundColor: ink.danger },
              ]}
            >
              <MaterialIcons name="warning-amber" size={20} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.warningTitle, { color: neo.text }]}>
                {isAccount ? t('settings:destroyFamily.warningTitleAccount') : t('settings:destroyFamily.warningTitleFamily')}
              </Text>
              <Text style={[styles.warningBody, { color: neo.textMuted }]}>
                {isAccount
                  ? t('settings:destroyFamily.warningBodyAccount')
                  : t('settings:destroyFamily.warningBodyFamily', { members: memberLabel })}
              </Text>
            </View>
          </View>

          {isAccount ? (
            <View style={styles.bullets}>
              <BulletRow
                colorMuted={neo.textMuted}
                colorText={neo.text}
                icon="delete-outline"
                label={t('settings:destroyFamily.accountBullet1')}
              />
              <BulletRow
                colorMuted={neo.textMuted}
                colorText={neo.text}
                icon="restart-alt"
                label={t('settings:destroyFamily.accountBullet2')}
              />
              <BulletRow
                colorMuted={neo.textMuted}
                colorText={neo.text}
                icon="verified"
                label={t('settings:destroyFamily.accountBullet3')}
              />
            </View>
          ) : (
            <View style={styles.bullets}>
              <BulletRow
                colorMuted={neo.textMuted}
                colorText={neo.text}
                icon="delete-outline"
                label={t('settings:destroyFamily.familyBullet1')}
              />
              <BulletRow
                colorMuted={neo.textMuted}
                colorText={neo.text}
                icon="people-outline"
                label={t('settings:destroyFamily.familyBullet2', { members: memberLabel })}
              />
              <BulletRow
                colorMuted={neo.textMuted}
                colorText={neo.text}
                icon="restore"
                label={t('settings:destroyFamily.familyBullet3')}
              />
            </View>
          )}

          <View style={styles.row}>
            <AppButton
              label={t('common:actions.cancel')}
              onPress={onCancel}
              variant="ghost"
            />
            <AppButton
              label={t('common:actions.continue')}
              onPress={() => setStep(2)}
              variant="danger"
            />
          </View>
        </View>
      ) : (
        <View style={styles.stack}>
          <View style={styles.confirmHelperRow}>
            <Text style={[styles.confirmHelper, { color: neo.textMuted }]}>
              {t('settings:destroyFamily.confirmHelperPrefix')}{' '}
              <Text style={{ color: ink.danger, fontWeight: '800' }}>
                {confirmPhrase}
              </Text>{' '}
              {t('settings:destroyFamily.confirmHelperSuffix')}
            </Text>
          </View>

          <TextInput
            ref={inputRef}
            value={phrase}
            onChangeText={(value) => setPhrase(value.toUpperCase())}
            placeholder={confirmPhrase}
            placeholderTextColor={neo.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            spellCheck={false}
            accessibilityLabel={t('settings:destroyFamily.inputA11y', { phrase: confirmPhrase })}
            style={[
              styles.input,
              {
                // Input = pozo. El borde rojo se mantiene: acá el hairline
                // comunica el estado destructivo, no la forma de la caja.
                backgroundColor: neo.well,
                boxShadow: neo.shadows.insetLg,
                borderColor: ink.danger,
                color: neo.text,
              },
            ]}
            returnKeyType="done"
          />

          {phrase.length > 0 && !matches ? (
            <Text style={[styles.errorText, { color: ink.danger }]}>
              {t('settings:destroyFamily.mismatch', { phrase: confirmPhrase })}
            </Text>
          ) : null}

          <View style={styles.row}>
            <AppButton
              disabled={isSubmitting}
              label={t('common:actions.cancel')}
              onPress={onCancel}
              variant="ghost"
            />
            <AppButton
              disabled={!matches || isSubmitting}
              label={isAccount ? t('settings:destroyFamily.ctaAccount') : t('settings:destroyFamily.ctaFamily')}
              loading={isSubmitting}
              onPress={onConfirm}
              variant="danger"
            />
          </View>
        </View>
      )}
    </ModalCard>
  )
}

interface BulletRowProps {
  colorMuted: string
  colorText: string
  icon: keyof typeof MaterialIcons.glyphMap
  label: string
}

function BulletRow({ colorMuted, colorText, icon, label }: BulletRowProps) {
  return (
    <View style={styles.bulletRow}>
      <MaterialIcons name={icon} size={18} color={colorMuted} />
      <Text style={[styles.bulletText, { color: colorText }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  warningCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  warningIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  warningBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  bullets: {
    gap: 10,
    paddingHorizontal: 4,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletText: {
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 4,
  },
  confirmHelperRow: {
    paddingHorizontal: 4,
  },
  confirmHelper: {
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    borderRadius: radii.lg,
    borderWidth: 2,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 2,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
})
