import { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { RiseView } from '@/components/home/animated/rise-view'
import { CategorySticker } from '@/components/category/category-sticker'
import {
  ONBOARDING_ICONS,
  type OnboardingIconKey,
} from '@/components/onboarding/onboarding-icon-registry'
import { TextField } from '@/components/ui/text-field'
import { usePressScale } from '@/hooks/use-press-scale'
import { radii } from '@/theme/palette'
import {
  useBootstrapFamily,
  usePeekFamilyInvite,
  useSetFamilyKind,
  type FamilyPeek,
} from '@/features/family/use-family-actions'
import type { AccountKind } from '@/features/family/account-kind'
import { getErrorMessage } from '@/utils/error-message'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'

interface StepFamilyProps {
  userId: string
  familyMode: 'none' | 'created' | 'joined'
  familyId: string | null
  /** Fired when the user CREATES a family — actually persists the
   *  membership immediately because there's nothing to preview /
   *  confirm later. */
  onFamilyReady: (mode: 'created' | 'joined', familyId: string) => void
  /** Fired when the user enters a valid JOIN code. The peek result
   *  is stored in onboarding state; the actual `family_members`
   *  insert is deferred to step 5 (Confirmar y unirme). The user is
   *  NOT a member yet at this point. */
  onJoinPeek: (peek: FamilyPeek) => void
  /** Fija el accountKind en el draft del onboarding (para copy). */
  onAccountKind: (kind: AccountKind) => void
  /** accountKind actual del draft — neutraliza el copy de la card de
   *  confirmación en modo solo (sin "familia"/"invitar"). */
  accountKind: AccountKind
  isRejoin?: boolean
  closedByOwner?: boolean
}

type Panel = 'mode' | 'root' | 'create' | 'join'

export function StepFamily({
  userId,
  familyMode,
  familyId,
  onFamilyReady,
  onJoinPeek,
  onAccountKind,
  accountKind,
  isRejoin = false,
  closedByOwner = false,
}: StepFamilyProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const bootstrap = useBootstrapFamily(userId)
  // Single-use invite code lookup. Replaces the legacy
  // peek_family_by_code which used the persistent `families.code`.
  const peek = usePeekFamilyInvite()
  const setKind = useSetFamilyKind(userId)
  const [panel, setPanel] = useState<Panel>(() =>
    familyMode === 'created' ? 'create' : familyMode === 'joined' ? 'join' : 'mode',
  )
  const [codeInput, setCodeInput] = useState('')

  const busy = bootstrap.isPending || peek.isPending || setKind.isPending
  const alreadyDone = familyMode !== 'none' && Boolean(familyId)

  const handleCreate = async () => {
    void triggerHaptic('selection')
    try {
      const result = await bootstrap.mutateAsync()
      void triggerHaptic('success')
      onFamilyReady('created', result.family_id)
      onAccountKind('shared')
      setPanel('create')
    } catch (error) {
      void triggerHaptic('error')
      Alert.alert(t('onboarding:family.errorCreateFamily'), getErrorMessage(error, t('states:error.server')))
    }
  }

  const handleSolo = async () => {
    void triggerHaptic('selection')
    try {
      const result = await bootstrap.mutateAsync()
      await setKind.mutateAsync('solo')
      onAccountKind('solo')
      void triggerHaptic('success')
      onFamilyReady('created', result.family_id)
      setPanel('create')
    } catch (error) {
      void triggerHaptic('error')
      Alert.alert(t('onboarding:family.errorCreateAccount'), getErrorMessage(error, t('states:error.server')))
    }
  }

  const handleJoin = async () => {
    const trimmed = codeInput.trim().toUpperCase()
    if (trimmed.length < 4) {
      Alert.alert(t('onboarding:family.errorInvalidCodeTitle'), t('onboarding:family.errorInvalidCodeMessage'))
      return
    }
    void triggerHaptic('selection')
    try {
      // Look up the family WITHOUT inserting the membership. The
      // actual join happens in step 5 when the user confirms.
      const result = await peek.mutateAsync(trimmed)
      void triggerHaptic('success')
      onJoinPeek(result)
    } catch (error) {
      void triggerHaptic('error')
      Alert.alert(t('onboarding:family.errorValidateCode'), getErrorMessage(error, t('states:error.server')))
    }
  }

  return (
    <View style={styles.stack}>
      <RiseView>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {panel === 'mode' ? t('onboarding:family.titleStart') : t('onboarding:family.titleFamily')}
        </Text>
        <Text style={[styles.subcopy, { color: theme.colors.textMuted }]}>
          {panel === 'mode'
            ? t('onboarding:family.subcopyMode')
            : closedByOwner
              ? t('onboarding:family.subcopyClosedByOwner')
              : isRejoin
                ? t('onboarding:family.subcopyRejoin')
                : t('onboarding:family.subcopyDefault')}
        </Text>
        {closedByOwner ? (
          <Text style={[styles.rejoinHint, { color: theme.colors.textMuted }]}>
            {t('onboarding:family.hintClosedByOwner')}
          </Text>
        ) : isRejoin ? (
          <Text style={[styles.rejoinHint, { color: theme.colors.textMuted }]}>
            {t('onboarding:family.hintRejoin')}
          </Text>
        ) : null}
      </RiseView>

      {alreadyDone ? (
        <Animated.View
          key="done"
          entering={FadeIn.duration(220)}
          layout={LinearTransition.duration(240)}
          style={[
            styles.confirmCard,
            { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
          ]}
        >
          <View
            style={[
              styles.confirmIcon,
              { backgroundColor: theme.colors.creamSoft, borderColor: theme.colors.line },
            ]}
          >
            <MaterialIcons name="check" size={22} color={theme.colors.text} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.confirmTitle, { color: theme.colors.text }]}>
              {accountKind === 'solo'
                ? t('onboarding:family.confirmTitleSolo')
                : familyMode === 'created'
                  ? t('onboarding:family.confirmTitleCreated')
                  : t('onboarding:family.confirmTitleJoined')}
            </Text>
            {familyMode === 'created' && accountKind !== 'solo' ? (
              <Text style={[styles.confirmHint, { color: theme.colors.textMuted }]}>
                {t('onboarding:family.confirmHintCreated')}
              </Text>
            ) : null}
          </View>
        </Animated.View>
      ) : panel === 'mode' ? (
        <Animated.View
          key="mode"
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(140)}
          layout={LinearTransition.duration(240)}
          style={styles.optionStack}
        >
          <OptionCard
            iconKey="solo"
            title={t('onboarding:family.optionSoloTitle')}
            meta={t('onboarding:family.optionSoloMeta')}
            onPress={() => void handleSolo()}
            disabled={busy}
            accessibilityLabel={t('onboarding:family.optionSoloA11y')}
            theme={theme}
          />

          <OptionCard
            iconKey="familia"
            title={t('onboarding:family.optionSharedTitle')}
            meta={t('onboarding:family.optionSharedMeta')}
            onPress={() => setPanel('root')}
            disabled={busy}
            accessibilityLabel={t('onboarding:family.optionSharedA11y')}
            theme={theme}
          />
        </Animated.View>
      ) : panel === 'root' ? (
        <Animated.View
          key="root"
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(140)}
          layout={LinearTransition.duration(240)}
          style={styles.optionStack}
        >
          <OptionCard
            iconKey="casa"
            title={t('onboarding:family.optionCreateTitle')}
            meta={t('onboarding:family.optionCreateMeta')}
            onPress={() => {
              void triggerHaptic('selection')
              void handleCreate()
            }}
            disabled={busy}
            accessibilityLabel={t('onboarding:family.optionCreateA11y')}
            theme={theme}
          />

          <OptionCard
            iconKey="compartir"
            title={t('onboarding:family.optionJoinTitle')}
            meta={t('onboarding:family.optionJoinMeta')}
            onPress={() => setPanel('join')}
            accessibilityLabel={t('onboarding:family.optionJoinA11y')}
            theme={theme}
          />

          <Pressable
            onPress={() => setPanel('mode')}
            style={[styles.ghostButton, { borderColor: theme.colors.line }]}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding:family.back')}
          >
            <Text style={[styles.ghostButtonText, { color: theme.colors.text }]}>{t('onboarding:family.back')}</Text>
          </Pressable>
        </Animated.View>
      ) : panel === 'join' ? (
        <Animated.View
          key="join"
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(140)}
          layout={LinearTransition.duration(240)}
          style={styles.optionStack}
        >
          <TextField
            label={t('onboarding:family.codeLabel')}
            value={codeInput}
            onChangeText={(value) => setCodeInput(value.toUpperCase())}
            placeholder={t('onboarding:family.codePlaceholder')}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            accessibilityLabel={t('onboarding:family.codeA11y')}
            style={styles.codeInputOverride}
          />
          <View style={styles.joinRow}>
            <Pressable
              onPress={() => setPanel('root')}
              style={[
                styles.ghostButton,
                { borderColor: theme.colors.line },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('onboarding:family.back')}
            >
              <Text style={[styles.ghostButtonText, { color: theme.colors.text }]}>{t('onboarding:family.back')}</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleJoin()}
              disabled={busy}
              style={[
                styles.primaryButton,
                {
                  backgroundColor: theme.colors.text,
                  opacity: busy ? 0.7 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('onboarding:family.join')}
            >
              <Text style={[styles.primaryButtonText, { color: theme.colors.creamCard }]}>
                {busy ? t('onboarding:family.joining') : t('onboarding:family.join')}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      ) : null}
    </View>
  )
}

interface OptionCardProps {
  iconKey: OnboardingIconKey
  title: string
  meta: string
  onPress: () => void
  disabled?: boolean
  accessibilityLabel: string
  theme: ReturnType<typeof useAppTheme>['theme']
}

function OptionCard({
  iconKey,
  title,
  meta,
  onPress,
  disabled = false,
  accessibilityLabel,
  theme,
}: OptionCardProps) {
  const press = usePressScale({ pressedScale: 0.98 })
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View
        style={[
          styles.optionCard,
          press.animatedStyle,
          { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
        ]}
      >
        <CategorySticker source={ONBOARDING_ICONS[iconKey]} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.optionTitle, { color: theme.colors.text }]}>{title}</Text>
          <Text style={[styles.optionMeta, { color: theme.colors.textMuted }]}>{meta}</Text>
        </View>
        <MaterialIcons name="arrow-forward" size={20} color={theme.colors.textMuted} />
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.6 },
  subcopy: { fontSize: 13, marginTop: 4 },
  rejoinHint: { fontSize: 12, marginTop: 6, fontStyle: 'italic' },
  optionStack: { gap: 10 },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  optionTitle: { fontSize: 16, fontWeight: '800' },
  optionMeta: { fontSize: 12, marginTop: 2 },
  codeInputOverride: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 4,
    textAlign: 'center',
  },
  joinRow: { flexDirection: 'row', gap: 10 },
  ghostButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostButtonText: { fontSize: 14, fontWeight: '700' },
  primaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { fontSize: 14, fontWeight: '800' },
  confirmCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  confirmIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  confirmTitle: { fontSize: 15, fontWeight: '800' },
  confirmMeta: { fontSize: 12, marginTop: 4 },
  confirmHint: { fontSize: 11, marginTop: 4 },
})
