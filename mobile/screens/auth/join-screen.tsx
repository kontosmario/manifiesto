import { type ComponentProps, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import { RequireGuest } from '@/components/guards'
import { AppButton } from '@/components/ui/button'
import { AppSymbol } from '@/components/ui/app-symbol'
import { AmbientBackdrop } from '@/components/ui/ambient-backdrop'
import { BrandedPanel } from '@/components/ui/branded-panel'
import { Screen } from '@/components/ui/screen'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { TextField } from '@/components/ui/text-field'
import { useJoinController } from '@/features/family/use-join-controller'
import { triggerHaptic } from '@/lib/haptics'
import { withAlpha } from '@/theme/color-utils'
import { DEFAULT_HIT_SLOP, DEFAULT_PRESS_RETENTION_OFFSET } from '@/theme/interaction'
import { useAppTheme } from '@/theme/theme-provider'
import { radii } from '@/theme/palette'
import { nunitoFamily } from '@/theme/typography'

type FamilyOnboardingMode = 'create' | 'join'

export function JoinScreen() {
  const { t } = useTranslation()
  const { theme } = useAppTheme()
  const controller = useJoinController()
  const [mode, setMode] = useState<FamilyOnboardingMode>('create')
  const changeMode = (nextMode: FamilyOnboardingMode) => {
    controller.actions.clearError()
    setMode(nextMode)
  }

  return (
    <RequireGuest allowFamilylessSession>
      <Screen
        backgroundColor={theme.colors.background}
        contentContainerStyle={styles.screenContent}
        subtitle={t('auth:join.screenSubtitle')}
        title={t('auth:join.screenTitle')}
      >
        <View style={styles.sectionStack}>
          {!theme.isDark ? <AmbientBackdrop variant="form" /> : null}

          <BrandedPanel elevated style={styles.heroCard} variant="hero">
            <Text style={[styles.heroLabel, { color: theme.colors.primaryStrong }]}>
              {t('auth:join.heroLabel')}
            </Text>
            <Text style={[styles.heroTitle, { color: theme.colors.text }]}>
              {t('auth:join.heroTitle')}
            </Text>
            <Text style={[styles.heroSubtitle, { color: theme.colors.textMuted }]}>
              {t('auth:join.heroSubtitle')}
            </Text>

            <SegmentedControl
              onChange={changeMode}
              options={[
                { label: t('auth:join.segmentCreate'), value: 'create' },
                { label: t('auth:join.segmentJoin'), value: 'join' },
              ]}
              value={mode}
            />

            <View style={styles.optionGrid}>
              <ChoiceCard
                description={t('auth:join.createCardDescription')}
                fallback="add-home"
                isActive={mode === 'create'}
                name="house.badge.plus.fill"
                onPress={() => changeMode('create')}
                title={t('auth:join.createCardTitle')}
              />
              <ChoiceCard
                description={t('auth:join.joinCardDescription')}
                fallback="vpn-key"
                isActive={mode === 'join'}
                name="key.fill"
                onPress={() => changeMode('join')}
                title={t('auth:join.joinCardTitle')}
              />
            </View>
          </BrandedPanel>

          {mode === 'create' ? (
            <BrandedPanel style={styles.formCard}>
              <Text style={[styles.formCopy, { color: theme.colors.textMuted }]}>
                {t('auth:join.createFormCopy')}
              </Text>

              {controller.errorMessage ? (
                <Text style={[styles.feedback, { color: theme.colors.danger }]}>
                  {controller.errorMessage}
                </Text>
              ) : null}

              <AppButton
                label={t('auth:join.createButton')}
                loading={controller.bootstrapMutation.isPending}
                onPress={controller.actions.createFamily}
              />

              {controller.isLoading ? (
                <Text style={[styles.help, { color: theme.colors.textSoft }]}>
                  {t('auth:join.creatingHome')}
                </Text>
              ) : null}
            </BrandedPanel>
          ) : (
            <BrandedPanel style={styles.formCard}>
              <Text style={[styles.formCopy, { color: theme.colors.textMuted }]}>
                {t('auth:join.joinFormCopy')}
              </Text>

              <TextField
                autoCapitalize="characters"
                autoCorrect={false}
                helper={t('auth:join.codeHelper')}
                label={t('auth:join.codeLabel')}
                maxLength={8}
                onChangeText={controller.actions.setCode}
                placeholder={t('auth:join.codePlaceholder')}
                textContentType="oneTimeCode"
                value={controller.code}
              />

              {controller.errorMessage ? (
                <Text style={[styles.feedback, { color: theme.colors.danger }]}>
                  {controller.errorMessage}
                </Text>
              ) : null}

              <AppButton
                disabled={!controller.canJoinWithCode}
                label={t('auth:join.joinButton')}
                loading={controller.joinMutation.isPending}
                onPress={controller.actions.joinWithCode}
              />

              {controller.isLoading ? (
                <Text style={[styles.help, { color: theme.colors.textSoft }]}>
                  {t('auth:join.validatingAccess')}
                </Text>
              ) : null}
            </BrandedPanel>
          )}
        </View>
      </Screen>
    </RequireGuest>
  )
}

function ChoiceCard({
  description,
  fallback,
  isActive,
  name,
  onPress,
  title,
}: {
  description: string
  fallback: ComponentProps<typeof AppSymbol>['fallback']
  isActive: boolean
  name: string
  onPress: () => void
  title: string
}) {
  const { theme } = useAppTheme()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      android_ripple={{
        borderless: false,
        color: withAlpha(theme.colors.primary, theme.isDark ? 0.18 : 0.1),
      }}
      hitSlop={DEFAULT_HIT_SLOP}
      onPress={() => {
        void triggerHaptic('selection')
        onPress()
      }}
      pressRetentionOffset={DEFAULT_PRESS_RETENTION_OFFSET}
      style={({ pressed }) => [
        styles.choiceCard,
        {
          backgroundColor: isActive ? theme.colors.surface : theme.colors.surfaceMuted,
          borderColor: isActive ? theme.colors.primary : theme.colors.border,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.choiceIconWrap,
          {
            backgroundColor: isActive
              ? withAlpha(theme.colors.primary, theme.isDark ? 0.22 : 0.14)
              : theme.colors.surface,
            borderColor: isActive ? withAlpha(theme.colors.primary, 0.4) : theme.colors.border,
          },
        ]}
      >
        <AppSymbol color={theme.colors.text} fallback={fallback} name={name} size={18} />
      </View>
      <View style={styles.choiceCopy}>
        <Text style={[styles.choiceTitle, { color: theme.colors.text }]}>{title}</Text>
        <Text style={[styles.choiceDescription, { color: theme.colors.textMuted }]}>
          {description}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screenContent: {
    paddingTop: 4,
  },
  sectionStack: {
    gap: 18,
    position: 'relative',
  },
  heroCard: {
    gap: 16,
  },
  heroLabel: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.8,
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  optionGrid: {
    gap: 12,
  },
  choiceCard: {
    alignItems: 'center',
    borderRadius: radii.xl,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  choiceIconWrap: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  choiceCopy: {
    flex: 1,
    gap: 3,
  },
  choiceTitle: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  choiceDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  formCard: {
    gap: 16,
  },
  formCopy: {
    fontSize: 14,
    lineHeight: 20,
  },
  feedback: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    lineHeight: 18,
  },
  help: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
})
