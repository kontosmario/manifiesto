import { type ComponentProps, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
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

type FamilyOnboardingMode = 'create' | 'join'

export function JoinScreen() {
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
        contentContainerStyle={styles.screenContent}
        subtitle="Después del acceso, elegí si abrís un grupo nuevo o si te sumás a uno existente."
        title="Tu grupo familiar"
      >
        <View style={styles.sectionStack}>
          {!theme.isDark ? <AmbientBackdrop variant="form" /> : null}

          <BrandedPanel elevated style={styles.heroCard} variant="hero">
            <Text style={[styles.heroLabel, { color: theme.colors.primaryStrong }]}>
              Onboarding del hogar
            </Text>
            <Text style={[styles.heroTitle, { color: theme.colors.text }]}>
              Primero definimos a qué grupo vas a pertenecer.
            </Text>
            <Text style={[styles.heroSubtitle, { color: theme.colors.textMuted }]}>
              Si todavía no existe, creás uno y seguís al wizard inicial. Si ya existe, ingresás el código y entrás directo.
            </Text>

            <SegmentedControl
              onChange={changeMode}
              options={[
                { label: 'Crear grupo', value: 'create' },
                { label: 'Unirme', value: 'join' },
              ]}
              value={mode}
            />

            <View style={styles.optionGrid}>
              <ChoiceCard
                description="Crea el hogar, genera el código y te lleva a la configuración inicial."
                fallback="add-home"
                isActive={mode === 'create'}
                name="house.badge.plus.fill"
                onPress={() => changeMode('create')}
                title="Crear grupo familiar"
              />
              <ChoiceCard
                description="Usa el código que te compartieron y entra al grupo ya existente."
                fallback="vpn-key"
                isActive={mode === 'join'}
                name="key.fill"
                onPress={() => changeMode('join')}
                title="Unirse a un grupo"
              />
            </View>
          </BrandedPanel>

          {mode === 'create' ? (
            <BrandedPanel style={styles.formCard}>
              <Text style={[styles.formCopy, { color: theme.colors.textMuted }]}>
                Crear grupo familiar genera el espacio compartido y, a continuación, abre el wizard para configurar ingreso, distribución porcentual, resguardo diario y recordatorios.
              </Text>

              {controller.errorMessage ? (
                <Text style={[styles.feedback, { color: theme.colors.danger }]}>
                  {controller.errorMessage}
                </Text>
              ) : null}

              <AppButton
                label="Crear grupo familiar"
                loading={controller.bootstrapMutation.isPending}
                onPress={controller.actions.createFamily}
              />

              {controller.isLoading ? (
                <Text style={[styles.help, { color: theme.colors.textSoft }]}>
                  Estamos preparando tu nuevo hogar...
                </Text>
              ) : null}
            </BrandedPanel>
          ) : (
            <BrandedPanel style={styles.formCard}>
              <Text style={[styles.formCopy, { color: theme.colors.textMuted }]}>
                Ingresá el código del grupo familiar al que querés sumarte. Al validar el código, vas a entrar directamente a la app con ese hogar activo.
              </Text>

              <TextField
                autoCapitalize="characters"
                autoCorrect={false}
                helper="Suele tener entre 6 y 8 caracteres."
                label="Código familiar"
                maxLength={8}
                onChangeText={controller.actions.setCode}
                placeholder="Ej: A9KD3L"
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
                label="Unirme con código"
                loading={controller.joinMutation.isPending}
                onPress={controller.actions.joinWithCode}
              />

              {controller.isLoading ? (
                <Text style={[styles.help, { color: theme.colors.textSoft }]}>
                  Estamos validando tu acceso al grupo...
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
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: '900',
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
    lineHeight: 18,
  },
  help: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
})
