import { useState } from 'react'
import {
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import { Screen } from '@/components/ui/screen'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { withAlpha } from '@/theme/color-utils'
import type { SemanticState } from '@/theme/state-tokens'
import { useAppTheme } from '@/theme/theme-provider'
import { neoInk, type NeoInk } from '@/theme/neo-ink'
import { neoMaterial, neoRadii, neoTokens, type NeoTokens } from '@/theme/neo-tokens'
import {
  useAdminSearchUsers,
  useAdminSetMvp,
  useIsSuperAdmin,
  type AdminAccess,
} from '@/features/admin/use-super-admin'
import { nunitoFamily } from '@/theme/typography'

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

/** Chip de estado en el vocabulario neo: fill tintado + tinta, sin contorno. */
function chipTokens(state: SemanticState, neo: NeoTokens, ink: NeoInk) {
  switch (state) {
    case 'positive':
      return { bg: neo.selectedTint, fg: ink.accent }
    case 'caution':
      return { bg: withAlpha(neo.warm, 0.16), fg: ink.warn }
    case 'critical':
      return { bg: withAlpha(neo.danger, 0.16), fg: ink.danger }
    default:
      return { bg: withAlpha(neo.textMuted, 0.14), fg: neo.textMuted }
  }
}

/**
 * Panel de super admin — SOLO accesible desde kontosmario@gmail.com. Busca
 * usuarios por email y togglea su acceso MVP (full de por vida). El gate de
 * abajo es de UI; la autorización real la hace el server en cada RPC.
 */
export function AdminScreen() {
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.isDark ? 'dark' : 'light')
  const cardMaterial = neoMaterial(theme.isDark ? 'dark' : 'light')
  const ink = neoInk(theme.isDark ? 'dark' : 'light')
  // Android < API 28/29 descarta el boxShadow EN SILENCIO: sin relieve el pozo
  // del buscador y la card del resultado quedan del material del fondo. Sólo
  // en ese piso cae un contorno.
  const flatFallback = SUPPORTS_INSET_SHADOW
    ? null
    : { borderWidth: 1, borderColor: neo.sheetDivider }
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
          <Text style={[theme.typography.body, { color: neo.textMuted }]}>
            {t('settings:admin.noAccess')}
          </Text>
        </View>
      </Screen>
    )
  }

  return (
    <Screen
      backgroundColor={neo.bg}
      titleColor={neo.text}
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
          placeholderTextColor={neo.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          accessibilityLabel={t('settings:admin.searchA11y')}
          style={[
            styles.input,
            theme.typography.body,
            {
              // Un campo de texto es un POZO, no un relieve: en el vocabulario
              // del handoff los inputs van hundidos (`insetLg`). Se escribe
              // suelto y no con `neoMaterial()` porque ese helper devuelve
              // `ViewStyle` y un TextInput espera `TextStyle`.
              backgroundColor: neo.well,
              boxShadow: neo.shadows.insetLg,
              color: neo.text,
            },
            flatFallback,
          ]}
        />

        {setMvp.isError ? (
          <Text style={[theme.typography.caption, { color: ink.danger }]}>
            {t('settings:admin.updateError')}
          </Text>
        ) : null}

        {trimmed.length < 2 ? (
          <Text style={[theme.typography.caption, styles.hint, { color: neo.textMuted }]}>
            {t('settings:admin.minChars')}
          </Text>
        ) : search.isFetching ? (
          <Text style={[theme.typography.caption, styles.hint, { color: neo.textMuted }]}>
            {t('settings:admin.searching')}
          </Text>
        ) : results.length === 0 ? (
          <Text style={[theme.typography.caption, styles.hint, { color: neo.textMuted }]}>
            {t('settings:admin.noResults', { query: trimmed })}
          </Text>
        ) : null}

        {results.map((u) => (
          <View
            key={u.userId}
            style={[styles.row, cardMaterial, flatFallback]}
          >
            <View style={styles.mid}>
              <Text
                style={[styles.email, { color: neo.text }]}
                numberOfLines={1}
              >
                {u.email}
              </Text>
              {(() => {
                // Defensivo: cualquier `access` desconocido (p.ej. datos viejos
                // en cache) cae a 'none' en vez de crashear.
                const chipState = ACCESS_CHIP_STATE[u.access] ?? ACCESS_CHIP_STATE.none
                const chipLabel = t(`settings:adminChip.${ACCESS_CHIP_STATE[u.access] ? u.access : 'none'}`)
                const tokens = chipTokens(chipState, neo, ink)
                return (
                  <View style={styles.statusRow}>
                    <View
                      style={[
                        styles.chip,
                        { backgroundColor: tokens.bg },
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
                  style={[styles.sub, { color: neo.textMuted }]}
                  numberOfLines={1}
                >
                  {t('settings:admin.paidBy', { email: u.purchaserEmail })}
                </Text>
              ) : u.displayName ? (
                <Text
                  style={[styles.sub, { color: neo.textMuted }]}
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
                false: neo.sheetHandle,
                true: ink.accent,
              }}
              thumbColor="#FFFFFF"
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
    borderRadius: neoRadii.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  hint: { paddingHorizontal: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: neoRadii.tile,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  mid: { flex: 1, gap: 3 },
  email: { fontSize: 14, fontWeight: '800', fontFamily: nunitoFamily('800') },
  sub: { fontSize: 11, fontWeight: '600', fontFamily: nunitoFamily('600') },
  statusRow: { flexDirection: 'row' },
  chip: {
    borderRadius: neoRadii.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  chipText: { fontSize: 10, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: 0.2 },
})
