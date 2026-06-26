import { useState } from 'react'
import {
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { Screen } from '@/components/ui/screen'
import { DARK_TAB_CANVAS } from '@/theme/palette'
import { getStateTokens, type SemanticState } from '@/theme/state-tokens'
import { useAppTheme } from '@/theme/theme-provider'
import {
  useAdminSearchUsers,
  useAdminSetMvp,
  useIsSuperAdmin,
  type AdminAccess,
} from '@/features/admin/use-super-admin'

/** Estado de acceso → chip claro (distingue quién paga de quién está cubierto).
 *  El label se resuelve por i18n vía `settings:adminChip.<access>`. */
const ACCESS_CHIP_STATE: Record<AdminAccess, SemanticState> = {
  mvp: 'positive',
  purchaser: 'positive',
  covered: 'caution',
  comped: 'neutral',
  trial: 'neutral',
  none: 'neutral',
}

/**
 * Panel de super admin — SOLO accesible desde kontosmario@gmail.com. Busca
 * usuarios por email y togglea su acceso MVP (full de por vida). El gate de
 * abajo es de UI; la autorización real la hace el server en cada RPC.
 */
export function AdminScreen() {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const isSuperAdmin = useIsSuperAdmin()
  const [query, setQuery] = useState('')
  const search = useAdminSearchUsers(query)
  const setMvp = useAdminSetMvp()

  const trimmed = query.trim()
  const results = search.data ?? []

  if (!isSuperAdmin) {
    return (
      <Screen title={t('settings:admin.title')} canGoBack>
        <View style={styles.empty}>
          <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
            {t('settings:admin.noAccess')}
          </Text>
        </View>
      </Screen>
    )
  }

  return (
    <Screen
      backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
      title={t('settings:admin.title')}
      subtitle={t('settings:admin.subtitle')}
      canGoBack
      scrollable
    >
      <View style={styles.body}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('settings:admin.searchPlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          accessibilityLabel={t('settings:admin.searchA11y')}
          style={[
            styles.input,
            theme.typography.body,
            {
              backgroundColor: theme.isDark
                ? theme.colors.surfaceMuted
                : theme.colors.creamCard,
              borderColor: theme.colors.line,
              color: theme.colors.text,
            },
          ]}
        />

        {setMvp.isError ? (
          <Text style={[theme.typography.caption, { color: theme.colors.danger }]}>
            {t('settings:admin.updateError')}
          </Text>
        ) : null}

        {trimmed.length < 2 ? (
          <Text style={[theme.typography.caption, styles.hint, { color: theme.colors.textMuted }]}>
            {t('settings:admin.minChars')}
          </Text>
        ) : search.isFetching ? (
          <Text style={[theme.typography.caption, styles.hint, { color: theme.colors.textMuted }]}>
            {t('settings:admin.searching')}
          </Text>
        ) : results.length === 0 ? (
          <Text style={[theme.typography.caption, styles.hint, { color: theme.colors.textMuted }]}>
            {t('settings:admin.noResults', { query: trimmed })}
          </Text>
        ) : null}

        {results.map((u) => (
          <View
            key={u.userId}
            style={[
              styles.row,
              {
                backgroundColor: theme.isDark
                  ? theme.colors.surfaceMuted
                  : theme.colors.creamCard,
                borderColor: theme.colors.line,
              },
            ]}
          >
            <View style={styles.mid}>
              <Text
                style={[styles.email, { color: theme.colors.text }]}
                numberOfLines={1}
              >
                {u.email}
              </Text>
              {(() => {
                // Defensivo: cualquier `access` desconocido (p.ej. datos viejos
                // en cache) cae a 'none' en vez de crashear.
                const chipState = ACCESS_CHIP_STATE[u.access] ?? ACCESS_CHIP_STATE.none
                const chipLabel = t(`settings:adminChip.${ACCESS_CHIP_STATE[u.access] ? u.access : 'none'}`)
                const tokens = getStateTokens(chipState, theme)
                return (
                  <View style={styles.statusRow}>
                    <View
                      style={[
                        styles.chip,
                        { backgroundColor: tokens.bg, borderColor: tokens.border },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: tokens.fg }]}>
                        {chipLabel}
                      </Text>
                    </View>
                  </View>
                )
              })()}
              {u.access === 'covered' && u.purchaserEmail ? (
                <Text
                  style={[styles.sub, { color: theme.colors.textMuted }]}
                  numberOfLines={1}
                >
                  {t('settings:admin.paidBy', { email: u.purchaserEmail })}
                </Text>
              ) : u.displayName ? (
                <Text
                  style={[styles.sub, { color: theme.colors.textMuted }]}
                  numberOfLines={1}
                >
                  {u.displayName}
                </Text>
              ) : null}
            </View>
            <Switch
              value={u.isMvp}
              disabled={setMvp.isPending || !u.familyId}
              onValueChange={(enabled) =>
                setMvp.mutate({ targetUserId: u.userId, enabled })
              }
              trackColor={{
                false: theme.colors.surfaceMuted,
                true: theme.colors.primary,
              }}
              thumbColor={theme.colors.creamCard}
            />
          </View>
        ))}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  body: { gap: 10, paddingBottom: 16 },
  empty: { padding: 16 },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  hint: { paddingHorizontal: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  mid: { flex: 1, gap: 3 },
  email: { fontSize: 14, fontWeight: '800' },
  sub: { fontSize: 11, fontWeight: '600' },
  statusRow: { flexDirection: 'row' },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  chipText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },
})
