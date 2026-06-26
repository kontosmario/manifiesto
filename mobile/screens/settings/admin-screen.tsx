import { useState } from 'react'
import {
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
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

/** Estado de acceso → chip claro (distingue quién paga de quién está cubierto). */
const ACCESS_CHIP: Record<AdminAccess, { label: string; state: SemanticState }> = {
  mvp: { label: 'MVP · de por vida', state: 'positive' },
  purchaser: { label: 'Titular · paga el plan', state: 'positive' },
  covered: { label: 'Cubierto por el hogar', state: 'caution' },
  comped: { label: 'Cortesía', state: 'neutral' },
  trial: { label: 'En prueba', state: 'neutral' },
  none: { label: 'Sin plan', state: 'neutral' },
}

/**
 * Panel de super admin — SOLO accesible desde kontosmario@gmail.com. Busca
 * usuarios por email y togglea su acceso MVP (full de por vida). El gate de
 * abajo es de UI; la autorización real la hace el server en cada RPC.
 */
export function AdminScreen() {
  const { theme } = useAppTheme()
  const isSuperAdmin = useIsSuperAdmin()
  const [query, setQuery] = useState('')
  const search = useAdminSearchUsers(query)
  const setMvp = useAdminSetMvp()

  const trimmed = query.trim()
  const results = search.data ?? []

  if (!isSuperAdmin) {
    return (
      <Screen title="Super admin" canGoBack>
        <View style={styles.empty}>
          <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
            No tienes acceso a esta sección.
          </Text>
        </View>
      </Screen>
    )
  }

  return (
    <Screen
      backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
      title="Super admin"
      subtitle="Busca un usuario por email y activa su acceso MVP (completo, de por vida)."
      canGoBack
      scrollable
    >
      <View style={styles.body}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar por email…"
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          accessibilityLabel="Buscar usuario por email"
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
            No se pudo actualizar. Reintenta.
          </Text>
        ) : null}

        {trimmed.length < 2 ? (
          <Text style={[theme.typography.caption, styles.hint, { color: theme.colors.textMuted }]}>
            Escribe al menos 2 caracteres.
          </Text>
        ) : search.isFetching ? (
          <Text style={[theme.typography.caption, styles.hint, { color: theme.colors.textMuted }]}>
            Buscando…
          </Text>
        ) : results.length === 0 ? (
          <Text style={[theme.typography.caption, styles.hint, { color: theme.colors.textMuted }]}>
            Sin resultados para "{trimmed}".
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
                const chip = ACCESS_CHIP[u.access] ?? ACCESS_CHIP.none
                const t = getStateTokens(chip.state, theme)
                return (
                  <View style={styles.statusRow}>
                    <View
                      style={[
                        styles.chip,
                        { backgroundColor: t.bg, borderColor: t.border },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: t.fg }]}>
                        {chip.label}
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
                  Paga {u.purchaserEmail}
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
