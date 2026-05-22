import { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { RiseView } from '@/components/home/animated/rise-view'
import { TextField } from '@/components/ui/text-field'
import {
  useBootstrapFamily,
  usePeekFamilyInvite,
  useSetFamilyKind,
  type FamilyPeek,
} from '@/features/family/use-family-actions'
import type { AccountKind } from '@/features/family/account-kind'
import { errorMessages } from '@/lib/copy/states'
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
      Alert.alert('No pudimos crear la familia', getErrorMessage(error, errorMessages.server))
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
      Alert.alert('No pudimos crear tu cuenta', getErrorMessage(error, errorMessages.server))
    }
  }

  const handleJoin = async () => {
    const trimmed = codeInput.trim().toUpperCase()
    if (trimmed.length < 4) {
      Alert.alert('Código inválido', 'Ingresa el código que te compartieron.')
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
      Alert.alert('No pudimos validar el código', getErrorMessage(error, errorMessages.server))
    }
  }

  return (
    <View style={styles.stack}>
      <RiseView>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {panel === 'mode' ? 'Empecemos' : 'Familia'}
        </Text>
        <Text style={[styles.subcopy, { color: theme.colors.textMuted }]}>
          {panel === 'mode'
            ? '¿Cómo vas a usar Manifiesto?'
            : closedByOwner
              ? 'Tu hogar anterior fue cerrado. Armemos uno propio o súmate a otro con su código.'
              : isRejoin
                ? 'Puedes empezar un hogar nuevo o sumarte a otro con su código.'
                : 'Empieza una familia o súmate a una existente.'}
        </Text>
        {closedByOwner ? (
          <Text style={[styles.rejoinHint, { color: theme.colors.textMuted }]}>
            Como el dueño cerró el hogar, sus datos compartidos ya no están disponibles —
            arrancamos limpios.
          </Text>
        ) : isRejoin ? (
          <Text style={[styles.rejoinHint, { color: theme.colors.textMuted }]}>
            Tus gastos y metas viejos quedan con tu hogar anterior — este arranque es desde cero.
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
                ? '¡Listo! Tu cuenta está creada.'
                : familyMode === 'created'
                  ? '¡Tu familia ya está creada!'
                  : '¡Listo, te sumaste!'}
            </Text>
            {familyMode === 'created' && accountKind !== 'solo' ? (
              <Text style={[styles.confirmHint, { color: theme.colors.textMuted }]}>
                Cuando quieras invitar a alguien, genera un código desde Ajustes.
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
          <Pressable
            onPress={() => void handleSolo()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Usar la app yo solo"
            style={[
              styles.optionCard,
              { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
            ]}
          >
            <Text style={styles.optionEmoji}>👤</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionTitle, { color: theme.colors.text }]}>Yo solo</Text>
              <Text style={[styles.optionMeta, { color: theme.colors.textMuted }]}>
                Gestiono mi plata solo.
              </Text>
            </View>
            <MaterialIcons name="arrow-forward" size={20} color={theme.colors.textMuted} />
          </Pressable>

          <Pressable
            onPress={() => setPanel('root')}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Usar la app con mi familia o pareja"
            style={[
              styles.optionCard,
              { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
            ]}
          >
            <Text style={styles.optionEmoji}>👨‍👩‍👧</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionTitle, { color: theme.colors.text }]}>
                Con mi familia o pareja
              </Text>
              <Text style={[styles.optionMeta, { color: theme.colors.textMuted }]}>
                Compartimos los gastos.
              </Text>
            </View>
            <MaterialIcons name="arrow-forward" size={20} color={theme.colors.textMuted} />
          </Pressable>
        </Animated.View>
      ) : panel === 'root' ? (
        <Animated.View
          key="root"
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(140)}
          layout={LinearTransition.duration(240)}
          style={styles.optionStack}
        >
          <Pressable
            onPress={() => {
              void triggerHaptic('selection')
              void handleCreate()
            }}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Crear nueva familia"
            style={[
              styles.optionCard,
              { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
            ]}
          >
            <Text style={styles.optionEmoji}>🏠</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionTitle, { color: theme.colors.text }]}>Crear nueva</Text>
              <Text style={[styles.optionMeta, { color: theme.colors.textMuted }]}>
                Empezamos con un código nuevo.
              </Text>
            </View>
            <MaterialIcons name="arrow-forward" size={20} color={theme.colors.textMuted} />
          </Pressable>

          <Pressable
            onPress={() => setPanel('join')}
            accessibilityRole="button"
            accessibilityLabel="Unirme con código"
            style={[
              styles.optionCard,
              { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
            ]}
          >
            <Text style={styles.optionEmoji}>🔗</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionTitle, { color: theme.colors.text }]}>Unirme con código</Text>
              <Text style={[styles.optionMeta, { color: theme.colors.textMuted }]}>
                Pegá el código que te pasaron.
              </Text>
            </View>
            <MaterialIcons name="arrow-forward" size={20} color={theme.colors.textMuted} />
          </Pressable>

          <Pressable
            onPress={() => setPanel('mode')}
            style={[styles.ghostButton, { borderColor: theme.colors.line }]}
            accessibilityRole="button"
            accessibilityLabel="Volver"
          >
            <Text style={[styles.ghostButtonText, { color: theme.colors.text }]}>Volver</Text>
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
            label="Código"
            value={codeInput}
            onChangeText={(t) => setCodeInput(t.toUpperCase())}
            placeholder="ABCD12"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            accessibilityLabel="Código de familia"
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
              accessibilityLabel="Volver"
            >
              <Text style={[styles.ghostButtonText, { color: theme.colors.text }]}>Volver</Text>
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
              accessibilityLabel="Unirme"
            >
              <Text style={[styles.primaryButtonText, { color: theme.colors.creamCard }]}>
                {busy ? 'Uniendo…' : 'Unirme'}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      ) : null}
    </View>
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
    borderRadius: 18,
    borderWidth: 1,
  },
  optionEmoji: { fontSize: 28 },
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
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostButtonText: { fontSize: 14, fontWeight: '700' },
  primaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
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
    borderRadius: 18,
    borderWidth: 1,
  },
  confirmIcon: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  confirmTitle: { fontSize: 15, fontWeight: '800' },
  confirmMeta: { fontSize: 12, marginTop: 4 },
  confirmHint: { fontSize: 11, marginTop: 4 },
})
