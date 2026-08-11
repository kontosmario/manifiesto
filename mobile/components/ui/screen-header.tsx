import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { ChevronBackIcon } from '@/components/redesign/auth/auth-icons'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { withAlpha } from '@/theme/color-utils'
import { buildMinimumTouchTargetHitSlop, DEFAULT_PRESS_RETENTION_OFFSET } from '@/theme/interaction'
import { neoMaterial, neoRadii, neoTokens } from '@/theme/neo-tokens'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

export type ScreenHeaderSkin = 'classic' | 'neo'

interface ScreenHeaderProps {
  canGoBack: boolean
  onBackPress: () => void
  rightSlot?: ReactNode
  /**
   * Piel neumórfica, opt-in por pantalla (la propaga `Screen`). `classic`
   * deja la V1 intacta para las pantallas que todavía no migraron.
   */
  skin?: ScreenHeaderSkin
  subtitle?: string
  title?: string
  /** Gana sobre la tinta de la piel: varias pantallas ya lo pasan a mano. */
  titleColor?: string
}

export function ScreenHeader({
  canGoBack,
  onBackPress,
  rightSlot,
  skin = 'classic',
  subtitle,
  title,
  titleColor,
}: ScreenHeaderProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const neo = skin === 'neo' ? neoTokens(theme.mode) : null

  return (
    <View style={styles.header}>
      <View style={styles.headerMain}>
        <View style={styles.headerTitleRow}>
          {canGoBack ? (
            <Pressable
              accessibilityLabel={t('common:actions.back')}
              accessibilityRole="button"
              android_ripple={{
                borderless: false,
                color: withAlpha(neo?.text ?? theme.colors.text, theme.isDark ? 0.18 : 0.08),
                radius: 20,
              }}
              hitSlop={buildMinimumTouchTargetHitSlop(40)}
              onPress={onBackPress}
              pressRetentionOffset={DEFAULT_PRESS_RETENTION_OFFSET}
              style={({ pressed }) => [
                styles.backButton,
                neo
                  ? [
                      styles.backButtonNeo,
                      neoMaterial(theme.mode, pressed && SUPPORTS_INSET_SHADOW ? 'insetSm' : 'raisedSm'),
                      // Android < API 29 descarta el boxShadow inset EN SILENCIO
                      // (ver `inset-shadow-support`): ahí el hundido no existe y
                      // el press se marca con la opacidad de la V1.
                      pressed && !SUPPORTS_INSET_SHADOW ? styles.backButtonPressedFlat : null,
                    ]
                  : {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                      opacity: pressed ? 0.82 : 1,
                    },
              ]}
            >
              {neo ? (
                <ChevronBackIcon color={neo.text} />
              ) : (
                <MaterialIcons color={theme.colors.text} name="arrow-back-ios-new" size={18} />
              )}
            </Pressable>
          ) : null}
          {title ? (
            <Text
              style={[
                styles.title,
                theme.typography.screenTitle,
                { color: titleColor ?? neo?.text ?? theme.colors.text },
              ]}
            >
              {title}
            </Text>
          ) : null}
        </View>
        {subtitle ? (
          <Text
            style={[
              styles.subtitle,
              theme.typography.body,
              { color: neo?.textMuted ?? theme.colors.textMuted },
            ]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {rightSlot ? <View>{rightSlot}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 10,
  },
  headerMain: {
    flex: 1,
    gap: 8,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonNeo: {
    borderRadius: neoRadii.pill,
    borderWidth: 0,
  },
  backButtonPressedFlat: {
    opacity: 0.82,
  },
  title: {
    flexShrink: 1,
  },
  subtitle: {},
})
